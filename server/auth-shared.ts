/**
 * auth-shared.ts
 *
 * Resposta de autenticação comum a todos os provedores (Google, Apple,
 * e-mail+senha, telefone): emite o JWT de sessão interno e serializa o
 * usuário no formato que o cliente espera.
 */
import type { Request } from "express";
import { getUserByOpenId } from "./db";
import { sdk } from "./_core/sdk";

export function buildUserResponse(
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

export type AuthResponse = {
  sessionToken: string;
  user: ReturnType<typeof buildUserResponse>;
};

/**
 * Emite o JWT de sessão para a conta canônica e devolve { sessionToken, user }.
 * `displayName` precisa ser não-vazio — verifySession rejeita name vazio.
 */
export async function issueSession(
  openId: string,
  displayName: string
): Promise<AuthResponse> {
  const appId = process.env.APP_ID ?? process.env.VITE_APP_ID ?? "vigora-saude";
  const name = displayName.trim() || "Usuário";
  const sessionToken = await sdk.signSession({ openId, appId, name });
  const dbUser = await getUserByOpenId(openId);
  return { sessionToken, user: buildUserResponse(dbUser) };
}

/**
 * openId da conta ANÔNIMA autenticada no request, ou undefined.
 * Usado pelos endpoints de login para o upgrade: se quem está logando já tem
 * uma sessão anônima, a credencial nova é ANEXADA a essa conta
 * (resolveAccount.linkToOpenId) em vez de criar outra. Best-effort: sem
 * sessão, sessão inválida ou conta não-anônima → login normal.
 */
export async function getLinkableAnonymousOpenId(
  req: Request
): Promise<string | undefined> {
  try {
    const user = await sdk.authenticateRequest(req);
    return user.loginMethod === "anonymous" ? user.openId : undefined;
  } catch {
    return undefined;
  }
}
