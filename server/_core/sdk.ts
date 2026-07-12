import { COOKIE_NAME, DEFAULT_SESSION_TTL_MS } from "../../shared/const.js";
import { ForbiddenError } from "../../shared/_core/errors.js";
import { parse as parseCookieHeader } from "cookie";
import { randomBytes } from "crypto";
import type { Request } from "express";
import { SignJWT, jwtVerify } from "jose";
import type { User } from "../../drizzle/schema";
import * as db from "../db";

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

export type SessionPayload = {
  openId: string;
  appId: string;
  name: string;
};

// In-memory token denylist for real logout (jti -> expiry epoch ms).
// For multi-instance deploys, move to Redis.
const tokenDenylist = new Map<string, number>();

function pruneDenylist() {
  const now = Date.now();
  for (const [jti, exp] of tokenDenylist) {
    if (exp <= now) tokenDenylist.delete(jti);
  }
}

export function revokeJti(jti: string, expiresAtMs: number) {
  if (!jti) return;
  pruneDenylist();
  tokenDenylist.set(jti, expiresAtMs);
}

/** Test-only helper. Wipes the denylist. */
export function __resetDenylistForTests() {
  tokenDenylist.clear();
}

function getSessionTtlMs(): number {
  const raw = process.env.SESSION_TTL_MS;
  if (raw) {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return DEFAULT_SESSION_TTL_MS;
}

function getSessionSecret() {
  const secret = process.env.JWT_SECRET ?? "";
  return new TextEncoder().encode(secret);
}

function parseCookies(cookieHeader: string | undefined) {
  if (!cookieHeader) return new Map<string, string>();
  return new Map(Object.entries(parseCookieHeader(cookieHeader)));
}

class SDKServer {
  /** Convenience wrapper that fills in `appId` from env. */
  async createSessionToken(
    openId: string,
    options: { expiresInMs?: number; name?: string } = {},
  ): Promise<string> {
    return this.signSession(
      {
        openId,
        appId: process.env.APP_ID || process.env.VITE_APP_ID || "vigora-saude",
        name: options.name ?? "",
      },
      options,
    );
  }

  async signSession(
    payload: SessionPayload,
    options: { expiresInMs?: number } = {},
  ): Promise<string> {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? getSessionTtlMs();
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1000);
    const jti = randomBytes(16).toString("hex");

    // Invariante de segurança: verifySession REJEITA token com name/appId vazio.
    // Emitir um aqui produz um token que falha na própria verificação (403 na
    // requisição seguinte), então nenhum caller pode gerar um token auto-inválido:
    // coage nome vazio para um fallback não-vazio. O nome no JWT é só cosmético
    // (authenticateRequest re-busca o usuário por openId), então isto é seguro.
    const safeName = payload.name?.trim() || "Usuário";

    return new SignJWT({
      openId: payload.openId,
      appId: payload.appId,
      name: safeName,
      jti,
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setExpirationTime(expirationSeconds)
      .sign(getSessionSecret());
  }

  async verifySession(
    cookieValue: string | undefined | null,
  ): Promise<{
    openId: string;
    appId: string;
    name: string;
    jti?: string;
    expMs?: number;
  } | null> {
    if (!cookieValue) return null;

    try {
      const { payload } = await jwtVerify(cookieValue, getSessionSecret(), {
        algorithms: ["HS256"],
      });
      const { openId, appId, name, jti, exp } = payload as Record<string, unknown>;

      if (!isNonEmptyString(openId) || !isNonEmptyString(appId) || !isNonEmptyString(name)) {
        return null;
      }

      if (typeof jti === "string" && tokenDenylist.has(jti)) {
        console.warn("[Auth] Token has been revoked");
        return null;
      }

      const expMs =
        typeof exp === "number" && Number.isFinite(exp) ? exp * 1000 : undefined;

      return {
        openId,
        appId,
        name,
        jti: typeof jti === "string" ? jti : undefined,
        expMs,
      };
    } catch (error) {
      console.warn("[Auth] Session verification failed", String(error));
      return null;
    }
  }

  async authenticateRequest(req: Request): Promise<User> {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    let token: string | undefined;
    if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
      token = authHeader.slice("Bearer ".length).trim();
    }

    const cookies = parseCookies(req.headers.cookie);
    const sessionCookie = token || cookies.get(COOKIE_NAME);
    const session = await this.verifySession(sessionCookie);

    if (!session) {
      throw ForbiddenError("Invalid session cookie");
    }

    const user = await db.getUserByOpenId(session.openId);
    if (!user) {
      // Users are provisioned via /api/auth/google on login. If we don't
      // find them here, the session is stale or pointing at a deleted user.
      throw ForbiddenError("User not found");
    }

    await db.upsertUser({ openId: user.openId, lastSignedIn: new Date() });
    return user;
  }
}

export const sdk = new SDKServer();
