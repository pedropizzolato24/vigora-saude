/**
 * lib/phone-signin.ts
 *
 * Cliente do login por telefone: código de 6 dígitos entregue no WhatsApp do
 * próprio número. Disponível apenas quando o servidor tem o template OTP
 * aprovado (GET /api/auth/methods → phone: true).
 */
import {
  completeServerLogin,
  postAuthRoute,
  type Nav,
  type ServerAuthResult,
} from "@/lib/auth-session";
import { getApiBaseUrl } from "@/constants/oauth";

/** Pede o envio do código OTP pelo WhatsApp. */
export async function phoneRequestCode(phone: string): Promise<void> {
  await postAuthRoute("/api/auth/phone/request", { phone });
}

/** Confirma o código e entra (cria a conta no primeiro acesso). */
export async function phoneVerifyCode(
  phone: string,
  code: string,
  router: Nav,
  reconcileFromCloud: () => Promise<void>
): Promise<void> {
  const result = await postAuthRoute<ServerAuthResult>(
    "/api/auth/phone/verify",
    { phone, code }
  );
  await completeServerLogin(result, router, reconcileFromCloud);
}

export interface AuthMethods {
  google: boolean;
  apple: boolean;
  email: boolean;
  phone: boolean;
}

/**
 * Consulta quais métodos de login este deploy suporta. Em erro de rede,
 * assume o conjunto seguro (só OAuth) para não exibir fluxos quebrados.
 */
export async function fetchAuthMethods(): Promise<AuthMethods> {
  const fallback: AuthMethods = {
    google: true,
    apple: true,
    email: false,
    phone: false,
  };
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) return fallback;
  try {
    const res = await fetch(`${baseUrl}/api/auth/methods`);
    if (!res.ok) return fallback;
    const json = (await res.json()) as Partial<AuthMethods>;
    return {
      google: json.google !== false,
      apple: json.apple !== false,
      email: json.email === true,
      phone: json.phone === true,
    };
  } catch {
    return fallback;
  }
}
