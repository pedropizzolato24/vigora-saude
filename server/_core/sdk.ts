import {
  AXIOS_TIMEOUT_MS,
  COOKIE_NAME,
  DEFAULT_SESSION_TTL_MS,
  ONE_YEAR_MS,
} from "../../shared/const.js";
import { ForbiddenError } from "../../shared/_core/errors.js";
import axios, { type AxiosInstance } from "axios";
import { parse as parseCookieHeader } from "cookie";
import { randomBytes } from "crypto";
import type { Request } from "express";
import { SignJWT, jwtVerify } from "jose";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { ENV, isAllowedRedirectUri } from "./env";
import type {
  ExchangeTokenRequest,
  ExchangeTokenResponse,
  GetUserInfoResponse,
  GetUserInfoWithJwtRequest,
  GetUserInfoWithJwtResponse,
} from "./types/manusTypes";
// Utility function
const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

export type SessionPayload = {
  openId: string;
  appId: string;
  name: string;
};

/**
 * In-memory token denylist. Maps jti -> expiry time (ms epoch). Tokens
 * with a denied jti are rejected by verifySession even if the signature
 * is valid. This gives us a real "logout" instead of just clearing the
 * client cookie (the JWT itself would otherwise stay valid until
 * natural expiry).
 *
 * Cleanup: we lazily evict expired entries on every read/write. For a
 * multi-instance deploy this should move to Redis.
 */
const tokenDenylist = new Map<string, number>();

function pruneDenylist() {
  const now = Date.now();
  for (const [jti, exp] of tokenDenylist) {
    if (exp <= now) tokenDenylist.delete(jti);
  }
}

/**
 * Mark a JWT id as revoked. Called from auth.logout. `expiresAtMs`
 * lets us drop the entry once the token would naturally expire.
 */
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

const EXCHANGE_TOKEN_PATH = `/webdev.v1.WebDevAuthPublicService/ExchangeToken`;
const GET_USER_INFO_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfo`;
const GET_USER_INFO_WITH_JWT_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfoWithJwt`;

class OAuthService {
  constructor(private client: ReturnType<typeof axios.create>) {
    console.log("[OAuth] Initialized with baseURL:", ENV.oAuthServerUrl);
    if (!ENV.oAuthServerUrl) {
      console.error(
        "[OAuth] ERROR: OAUTH_SERVER_URL is not configured! Set OAUTH_SERVER_URL environment variable.",
      );
    }
  }

  async getTokenByCode(code: string, redirectUri: string): Promise<ExchangeTokenResponse> {
    // redirectUri is supplied by the caller AFTER it has been verified
    // via verifyState — never trust caller input directly here.
    const payload: ExchangeTokenRequest = {
      clientId: ENV.appId,
      grantType: "authorization_code",
      code,
      redirectUri,
    };

    const { data } = await this.client.post<ExchangeTokenResponse>(EXCHANGE_TOKEN_PATH, payload);

    return data;
  }

  async getUserInfoByToken(token: ExchangeTokenResponse): Promise<GetUserInfoResponse> {
    const { data } = await this.client.post<GetUserInfoResponse>(GET_USER_INFO_PATH, {
      accessToken: token.accessToken,
    });

    return data;
  }
}

const createOAuthHttpClient = (): AxiosInstance =>
  axios.create({
    baseURL: ENV.oAuthServerUrl,
    timeout: AXIOS_TIMEOUT_MS,
  });

class SDKServer {
  private readonly client: AxiosInstance;
  private readonly oauthService: OAuthService;

  constructor(client: AxiosInstance = createOAuthHttpClient()) {
    this.client = client;
    this.oauthService = new OAuthService(this.client);
  }

  private deriveLoginMethod(
    platforms: unknown,
    fallback: string | null | undefined,
  ): string | null {
    if (fallback && fallback.length > 0) return fallback;
    if (!Array.isArray(platforms) || platforms.length === 0) return null;
    const set = new Set<string>(platforms.filter((p): p is string => typeof p === "string"));
    if (set.has("REGISTERED_PLATFORM_EMAIL")) return "email";
    if (set.has("REGISTERED_PLATFORM_GOOGLE")) return "google";
    if (set.has("REGISTERED_PLATFORM_APPLE")) return "apple";
    if (set.has("REGISTERED_PLATFORM_MICROSOFT") || set.has("REGISTERED_PLATFORM_AZURE"))
      return "microsoft";
    if (set.has("REGISTERED_PLATFORM_GITHUB")) return "github";
    const first = Array.from(set)[0];
    return first ? first.toLowerCase() : null;
  }

  /**
   * Sign an OAuth state token for the given redirectUri.
   *
   * The state is a short-lived JWT (HS256, 10 min) containing the
   * redirectUri plus a random nonce. It is HMAC-bound to the server
   * cookieSecret so an attacker cannot forge state values, and the
   * redirectUri is validated against the allowlist before signing so an
   * attacker cannot trigger token exchange against arbitrary URIs.
   */
  async signOAuthState(redirectUri: string): Promise<string> {
    if (!isAllowedRedirectUri(redirectUri)) {
      throw ForbiddenError("redirectUri not allowed");
    }
    const secretKey = this.getSessionSecret();
    const nonce = randomBytes(16).toString("hex");
    const expSeconds = Math.floor(Date.now() / 1000) + 600; // 10 minutes
    return new SignJWT({ redirectUri, nonce, typ: "oauth-state" })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setExpirationTime(expSeconds)
      .sign(secretKey);
  }

  /**
   * Verify an OAuth state token issued by signOAuthState and return the
   * embedded redirectUri. Throws if the token is forged, expired, or if
   * the embedded redirectUri is no longer allowlisted.
   */
  async verifyOAuthState(state: string): Promise<string> {
    const secretKey = this.getSessionSecret();
    const { payload } = await jwtVerify(state, secretKey, {
      algorithms: ["HS256"],
    });
    if ((payload as any)?.typ !== "oauth-state") {
      throw ForbiddenError("invalid state typ");
    }
    const redirectUri = (payload as any)?.redirectUri;
    if (typeof redirectUri !== "string" || !isAllowedRedirectUri(redirectUri)) {
      throw ForbiddenError("redirectUri not allowed");
    }
    return redirectUri;
  }

  /**
   * Exchange OAuth authorization code for access token.
   *
   * `state` MUST have been issued by signOAuthState. We verify the
   * signature first, then extract the validated redirectUri.
   */
  async exchangeCodeForToken(code: string, state: string): Promise<ExchangeTokenResponse> {
    const redirectUri = await this.verifyOAuthState(state);
    return this.oauthService.getTokenByCode(code, redirectUri);
  }

  /**
   * Get user information using access token
   * @example
   * const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
   */
  async getUserInfo(accessToken: string): Promise<GetUserInfoResponse> {
    const data = await this.oauthService.getUserInfoByToken({
      accessToken,
    } as ExchangeTokenResponse);
    const loginMethod = this.deriveLoginMethod(
      (data as any)?.platforms,
      (data as any)?.platform ?? data.platform ?? null,
    );
    return {
      ...(data as any),
      platform: loginMethod,
      loginMethod,
    } as GetUserInfoResponse;
  }

  private parseCookies(cookieHeader: string | undefined) {
    if (!cookieHeader) {
      return new Map<string, string>();
    }

    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }

  private getSessionSecret() {
    // Read from process.env on each call (tests and rotated config-aware)
    const secret = process.env.JWT_SECRET ?? ENV.cookieSecret;
    return new TextEncoder().encode(secret);
  }

  /**
   * Create a session token for a Manus user openId.
   *
   * The token's TTL defaults to DEFAULT_SESSION_TTL_MS (7 days). Callers
   * MAY pass a shorter expiresInMs but should not request the legacy
   * 1-year window — that's exactly the issue we are fixing.
   */
  async createSessionToken(
    openId: string,
    options: { expiresInMs?: number; name?: string } = {},
  ): Promise<string> {
    return this.signSession(
      {
        openId,
        // Read process.env lazily so tests / rotated config see latest value
        appId: process.env.VITE_APP_ID || ENV.appId,
        name: options.name || "",
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
    const secretKey = this.getSessionSecret();
    // Random jti so we can revoke individual tokens.
    const jti = randomBytes(16).toString("hex");

    return new SignJWT({
      openId: payload.openId,
      appId: payload.appId,
      name: payload.name,
      jti,
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setExpirationTime(expirationSeconds)
      .sign(secretKey);
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
    if (!cookieValue) {
      console.warn("[Auth] Missing session cookie");
      return null;
    }

    try {
      const secretKey = this.getSessionSecret();
      const { payload } = await jwtVerify(cookieValue, secretKey, {
        algorithms: ["HS256"],
      });
      const { openId, appId, name, jti, exp } = payload as Record<string, unknown>;

      if (!isNonEmptyString(openId) || !isNonEmptyString(appId) || !isNonEmptyString(name)) {
        console.warn("[Auth] Session payload missing required fields");
        return null;
      }

      // Reject revoked tokens (logged out)
      if (typeof jti === "string" && tokenDenylist.has(jti)) {
        console.warn("[Auth] Token has been revoked (logged out)");
        return null;
      }

      const expMs =
        typeof exp === "number" && Number.isFinite(exp)
          ? exp * 1000
          : undefined;

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

  async getUserInfoWithJwt(jwtToken: string): Promise<GetUserInfoWithJwtResponse> {
    const payload: GetUserInfoWithJwtRequest = {
      jwtToken,
      projectId: ENV.appId,
    };

    const { data } = await this.client.post<GetUserInfoWithJwtResponse>(
      GET_USER_INFO_WITH_JWT_PATH,
      payload,
    );

    const loginMethod = this.deriveLoginMethod(
      (data as any)?.platforms,
      (data as any)?.platform ?? data.platform ?? null,
    );
    return {
      ...(data as any),
      platform: loginMethod,
      loginMethod,
    } as GetUserInfoWithJwtResponse;
  }

  async authenticateRequest(req: Request): Promise<User> {
    // Regular authentication flow
    const authHeader = req.headers.authorization || req.headers.Authorization;
    let token: string | undefined;
    if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
      token = authHeader.slice("Bearer ".length).trim();
    }

    const cookies = this.parseCookies(req.headers.cookie);
    const sessionCookie = token || cookies.get(COOKIE_NAME);
    const session = await this.verifySession(sessionCookie);

    if (!session) {
      throw ForbiddenError("Invalid session cookie");
    }

    const sessionUserId = session.openId;
    const signedInAt = new Date();
    let user = await db.getUserByOpenId(sessionUserId);

    // If user not in DB, sync from OAuth server automatically
    if (!user) {
      try {
        const userInfo = await this.getUserInfoWithJwt(sessionCookie ?? "");
        await db.upsertUser({
          openId: userInfo.openId,
          name: userInfo.name || null,
          email: userInfo.email ?? null,
          loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
          lastSignedIn: signedInAt,
        });
        user = await db.getUserByOpenId(userInfo.openId);
      } catch (error) {
        console.error("[Auth] Failed to sync user from OAuth:", error);
        throw ForbiddenError("Failed to sync user info");
      }
    }

    if (!user) {
      throw ForbiddenError("User not found");
    }

    await db.upsertUser({
      openId: user.openId,
      lastSignedIn: signedInAt,
    });

    return user;
  }
}

export const sdk = new SDKServer();
