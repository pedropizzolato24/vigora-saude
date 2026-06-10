// server/apple-auth.ts
import type { Express, Request, Response } from "express";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { z } from "zod";
import { getUserByOpenId, upsertUser } from "./db";
import { resolveAccount } from "./db-auth";
import { issueSession } from "./auth-shared";

/**
 * Sign in with Apple.
 *
 * O cliente (expo-apple-authentication) entrega um identity token (JWT
 * assinado pela Apple). Verificamos assinatura/issuer/audience contra o JWKS
 * público da Apple — nenhum secret necessário, igual ao fluxo Google.
 *
 * Particularidade da Apple: nome e e-mail só vêm na PRIMEIRA autorização do
 * usuário. O cliente envia `full_name` quando o recebe; nos logins seguintes
 * o campo chega vazio e preservamos o nome já gravado.
 */

const APPLE_ISSUER = "https://appleid.apple.com";
const APPLE_JWKS_URL = "https://appleid.apple.com/auth/keys";

let _jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function getAppleJwks() {
  if (!_jwks) _jwks = createRemoteJWKSet(new URL(APPLE_JWKS_URL));
  return _jwks;
}

interface AppleClaims {
  sub: string;
  email: string | null;
  emailVerified: boolean;
}

/**
 * Verifica o identity token contra o JWKS da Apple.
 * Lança "INVALID_TOKEN" para qualquer falha de verificação.
 */
export async function verifyAppleIdentityToken(
  identityToken: string
): Promise<AppleClaims> {
  // audience = bundle id do app (aud do identity token gerado no dispositivo)
  const audience = process.env.APPLE_BUNDLE_ID ?? "com.vigora.saude";

  let payload: Record<string, unknown>;
  try {
    const result = await jwtVerify(identityToken, getAppleJwks(), {
      issuer: APPLE_ISSUER,
      audience,
    });
    payload = result.payload as Record<string, unknown>;
  } catch {
    throw new Error("INVALID_TOKEN");
  }

  const sub = payload.sub;
  if (typeof sub !== "string" || sub.length === 0) {
    throw new Error("INVALID_TOKEN");
  }

  const email =
    typeof payload.email === "string" ? payload.email.trim().toLowerCase() : null;
  // A Apple envia email_verified como boolean ou string conforme a versão.
  const emailVerified =
    payload.email_verified === true || payload.email_verified === "true";

  return { sub, email, emailVerified };
}

export async function handleAppleAuth(
  identityToken: string,
  fullName?: string | null
) {
  const claims = await verifyAppleIdentityToken(identityToken);

  const { openId } = await resolveAccount({
    provider: "apple",
    subject: claims.sub,
    email: claims.email,
    emailVerified: claims.emailVerified,
    name: fullName ?? claims.email ?? "Usuário",
  });

  // Só grava o nome se a conta ainda não tem um — a Apple não reenvia o nome
  // depois da primeira autorização, e não queremos sobrescrever um nome
  // editado no app com e-mail/placeholder. E-mail só quando verificado (é a
  // chave de vinculação de contas).
  const existing = await getUserByOpenId(openId);
  const incomingName = fullName?.trim() || null;
  const safeEmail = claims.emailVerified ? claims.email : null;
  await upsertUser({
    openId,
    loginMethod: "apple",
    lastSignedIn: new Date(),
    ...(!existing?.name && (incomingName || safeEmail)
      ? { name: incomingName ?? safeEmail }
      : {}),
    ...(!existing?.email && safeEmail ? { email: safeEmail } : {}),
  });

  const display =
    existing?.name ?? incomingName ?? claims.email ?? "Usuário";
  return issueSession(openId, display);
}

const appleBodySchema = z.object({
  identity_token: z.string().min(1).max(8192),
  full_name: z.string().trim().max(255).optional(),
});

/**
 * POST /api/auth/apple
 * Body: { identity_token: string, full_name?: string }
 */
export function registerAppleAuthRoute(app: Express): void {
  app.post("/api/auth/apple", async (req: Request, res: Response) => {
    const parsed = appleBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "identity_token é obrigatório" });
      return;
    }

    try {
      const result = await handleAppleAuth(
        parsed.data.identity_token,
        parsed.data.full_name ?? null
      );
      res.json(result);
    } catch (err) {
      if (err instanceof Error && err.message === "INVALID_TOKEN") {
        res.status(401).json({ error: "Token inválido ou expirado" });
        return;
      }
      console.error("[Apple Auth] Error:", err);
      res.status(500).json({ error: "Erro interno do servidor" });
    }
  });
}
