// server/google-auth.ts
import type { Express, Request, Response } from "express";
import { getUserByOpenId, upsertUser } from "./db";
import { resolveAccount } from "./db-auth";
import { issueSession } from "./auth-shared";

interface GoogleTokenPayload {
  sub: string;
  email?: string;
  /** O tokeninfo devolve booleanos como string ("true"/"false"). */
  email_verified?: string | boolean;
  name?: string;
  /** Cliente OAuth para o qual o token foi emitido — DEVE ser um dos nossos. */
  aud: string;
  /** Authorized party — em fluxos nativos pode trazer o client id também. */
  azp?: string;
  iss: string;
  exp: string;
}

/**
 * Client IDs OAuth do Vigora. O `aud` do id_token tem que bater com um destes
 * — senão um token legítimo do Google emitido para QUALQUER outro app seria
 * aceito (o tokeninfo só valida assinatura/expiração, não o destinatário).
 *
 * São valores públicos (vão no bundle do app e no workflow de build), então
 * ficam como fallback no código para o servidor funcionar sem env extra; o
 * deploy pode sobrescrever/estender via EXPO_PUBLIC_GOOGLE_*_CLIENT_ID.
 */
const KNOWN_GOOGLE_CLIENT_IDS = [
  "39705729598-iv01adn3g5di03k6ukp9n02mri393s6n.apps.googleusercontent.com", // android
  "39705729598-0q57pbi4hmfd231rkbld2ftgh9eqcidg.apps.googleusercontent.com", // ios
  "39705729598-q49ldjevjp58hg9tvre49tphuo076s08.apps.googleusercontent.com", // web
];

function allowedAudiences(): Set<string> {
  const fromEnv = [
    process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
    process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    ...(process.env.GOOGLE_EXTRA_AUDIENCES?.split(",") ?? []),
  ]
    .map((v) => v?.trim())
    .filter((v): v is string => !!v);
  const set = new Set(fromEnv);
  // Garante que os client IDs conhecidos sempre valem (fail-safe p/ prod).
  for (const id of KNOWN_GOOGLE_CLIENT_IDS) set.add(id);
  return set;
}

/**
 * Verifica um Google id_token usando o endpoint público de tokeninfo e
 * confere que o `aud` é um cliente OAuth do Vigora.
 * Lança "INVALID_TOKEN" se o Google rejeitar o token ou o aud não bater.
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
  const payload = (await res.json()) as GoogleTokenPayload;

  const allowed = allowedAudiences();
  if (!payload.aud || !allowed.has(payload.aud)) {
    console.warn("[Google Auth] Rejected token with unexpected aud");
    throw new Error("INVALID_TOKEN");
  }

  return payload;
}

/**
 * Núcleo da autenticação Google:
 * 1. Verifica o id_token com o Google (incluindo o aud)
 * 2. Resolve a conta canônica (vinculando por e-mail verificado se existir)
 * 3. Emite o JWT de sessão interno
 */
export async function handleGoogleAuth(idToken: string) {
  const payload = await verifyGoogleIdToken(idToken);

  const emailVerified =
    payload.email_verified === true || payload.email_verified === "true";
  // E-mail só é confiável (para vincular/persistir) quando verificado.
  const email =
    payload.email && emailVerified ? payload.email.trim().toLowerCase() : null;
  const name = payload.name ?? payload.email ?? "Usuário";

  const { openId } = await resolveAccount({
    provider: "google",
    subject: payload.sub,
    email,
    emailVerified,
    name,
  });

  // Não sobrescreve nome/e-mail já gravados (ex.: conta criada via e-mail e
  // depois vinculada ao Google, ou nome editado no app). Só preenche vazios.
  const existing = await getUserByOpenId(openId);
  await upsertUser({
    openId,
    loginMethod: "google",
    lastSignedIn: new Date(),
    ...(!existing?.name && payload.name ? { name: payload.name } : {}),
    ...(!existing?.email && email ? { email } : {}),
  });

  return issueSession(openId, existing?.name ?? name);
}

/**
 * POST /api/auth/google
 * Body: { id_token: string }
 *
 * Verifica o Google id_token, resolve/vincula a conta no Railway MySQL,
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
