// server/google-auth.ts
import type { Express, Request, Response } from "express";
import { getUserByOpenId, upsertUser } from "./db";
import { sdk } from "./_core/sdk";

interface GoogleTokenPayload {
  sub: string;
  email?: string;
  name?: string;
  aud: string;
  iss: string;
  exp: string;
}

function buildUserResponse(
  user: Awaited<ReturnType<typeof getUserByOpenId>>
) {
  return {
    id: user?.id ?? null,
    openId: user?.openId ?? null,
    name: user?.name ?? null,
    email: user?.email ?? null,
    phone: user?.phone ?? null,
    userType: user?.userType ?? null,
    birthDate: user?.birthDate ?? null,
    bloodType: user?.bloodType ?? null,
    loginMethod: user?.loginMethod ?? null,
    lastSignedIn: (user?.lastSignedIn ?? new Date()).toISOString(),
  };
}

/**
 * Verifica um Google id_token usando o endpoint público de tokeninfo.
 * Lança "INVALID_TOKEN" se o Google rejeitar o token.
 * Não requer secret — tokeninfo é um endpoint público do Google.
 */
export async function verifyGoogleIdToken(
  idToken: string
): Promise<GoogleTokenPayload> {
  const res = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`
  );
  if (!res.ok) {
    throw new Error("INVALID_TOKEN");
  }
  return res.json() as Promise<GoogleTokenPayload>;
}

/**
 * Núcleo da autenticação Google:
 * 1. Verifica o id_token com o Google
 * 2. Faz upsert do usuário no Railway MySQL
 * 3. Emite o JWT de sessão interno
 */
export async function handleGoogleAuth(idToken: string) {
  const payload = await verifyGoogleIdToken(idToken);

  const openId = `google:${payload.sub}`;
  const name = payload.name ?? payload.email ?? "Usuário";
  const email = payload.email ?? null;

  await upsertUser({
    openId,
    name,
    email,
    loginMethod: "google",
    lastSignedIn: new Date(),
  });

  const appId =
    process.env.APP_ID ?? process.env.VITE_APP_ID ?? "vigora-saude";
  const sessionToken = await sdk.signSession({ openId, appId, name });
  const dbUser = await getUserByOpenId(openId);

  return {
    sessionToken,
    user: buildUserResponse(dbUser),
  };
}

/**
 * POST /api/auth/google
 * Body: { id_token: string }
 *
 * Verifica o Google id_token, faz upsert do usuário no Railway MySQL,
 * e retorna { sessionToken, user } com o JWT de sessão interno.
 */
export function registerGoogleAuthRoute(app: Express): void {
  app.post("/api/auth/google", async (req: Request, res: Response) => {
    const { id_token } = req.body as { id_token?: string };

    if (!id_token) {
      res.status(400).json({ error: "id_token é obrigatório" });
      return;
    }

    try {
      const result = await handleGoogleAuth(id_token);
      res.json(result);
    } catch (err) {
      if (err instanceof Error && err.message === "INVALID_TOKEN") {
        res.status(401).json({ error: "Token inválido ou expirado" });
        return;
      }
      console.error("[Google Auth] Error:", err);
      res.status(500).json({ error: "Erro interno do servidor" });
    }
  });
}
