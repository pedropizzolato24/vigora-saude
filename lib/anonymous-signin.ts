/**
 * anonymous-signin.ts — "Continuar sem conta".
 *
 * Troca o deviceId (SecureStore) por uma sessão de uma conta REAL com
 * loginMethod "anonymous" — o app funciona inteiro; login vira um upgrade
 * opcional ("proteja sua conta") feito depois, sem pressão. Ver
 * docs/design/2026-07-12-monitoring-account-ownership.md, "Contas sem login".
 */
import { getDeviceId } from "@/lib/device-id";
import { postAuthRoute, type ServerAuthResult } from "@/lib/auth-session";

export async function signInAnonymously(): Promise<ServerAuthResult> {
  const deviceId = await getDeviceId();
  return postAuthRoute<ServerAuthResult>("/api/auth/anonymous", { deviceId });
}
