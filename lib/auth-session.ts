/**
 * lib/auth-session.ts
 *
 * Finalização de login comum a TODOS os provedores (Google, Apple,
 * e-mail+senha, telefone): grava sessão+perfil, dispara o sync da nuvem e
 * navega para a próxima tela (registro pendente, convite pendente ou home).
 *
 * Cada provedor só faz a própria troca de credencial e entrega o
 * { sessionToken, user } do servidor para completeServerLogin.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Auth from "@/lib/_core/auth";
import { clearPendingInvite, getPendingInvite } from "@/lib/pending-invite";
import { getApiBaseUrl } from "@/constants/oauth";

const LOGIN_COMPLETED_KEY = "vigora_login_completed";
const CAREGIVER_ONBOARDING_KEY = "vigora_caregiver_onboarding_completed";

export type Nav = { replace: (href: string) => void };

export interface ServerAuthResult {
  sessionToken: string;
  user: {
    id: number | null;
    openId: string;
    name: string | null;
    email: string | null;
    phone: string | null;
    userType: "caregiver" | "monitored" | null;
    birthDate: string | null;
    bloodType: string | null;
    loginMethod: string | null;
    lastSignedIn: string;
  };
}

export function getNextRoute(
  userType: "caregiver" | "monitored" | null,
  caregiverOnboardingDone: boolean
): string {
  if (!userType) return "/register";
  if (userType === "caregiver") {
    return caregiverOnboardingDone
      ? "/(caregiver-tabs)"
      : "/caregiver-onboarding";
  }
  return "/(tabs)";
}

/**
 * POST JSON para uma rota de autenticação do servidor. Lança Error com a
 * mensagem do servidor (já em pt-BR) quando a resposta não é 2xx.
 */
export async function postAuthRoute<T = Record<string, unknown>>(
  path: string,
  body: Record<string, unknown>
): Promise<T> {
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) {
    throw new Error(
      "URL do servidor não configurada. Rebuilde o app com EXPO_PUBLIC_API_BASE_URL."
    );
  }

  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const json = (await res.json().catch(() => ({}))) as Record<string, unknown> & {
    error?: string;
  };
  if (!res.ok) {
    throw new Error(json.error ?? `Erro ${res.status}`);
  }
  return json as T;
}

/**
 * Grava a sessão retornada pelo servidor e navega para a próxima tela.
 */
export async function completeServerLogin(
  result: ServerAuthResult,
  router: Nav,
  reconcileFromCloud: () => Promise<void>
): Promise<void> {
  await Auth.setSessionToken(result.sessionToken);
  await Auth.setUserInfo({
    id: result.user.id ?? 0,
    openId: result.user.openId,
    name: result.user.name,
    email: result.user.email,
    phone: result.user.phone,
    userType: result.user.userType,
    birthDate: result.user.birthDate,
    bloodType: result.user.bloodType,
    loginMethod: result.user.loginMethod,
    lastSignedIn: new Date(result.user.lastSignedIn),
  });

  await AsyncStorage.setItem(LOGIN_COMPLETED_KEY, "true");
  reconcileFromCloud().catch(() => {});

  // Resume a pending invite link if the user opened one before logging in.
  // Only once registration is complete (userType set) — otherwise fall
  // through to /register and resume after that.
  const pendingInvite = await getPendingInvite();
  if (pendingInvite && result.user.userType) {
    await clearPendingInvite();
    router.replace(`/convite/${pendingInvite}`);
    return;
  }

  const flag = await AsyncStorage.getItem(CAREGIVER_ONBOARDING_KEY);
  router.replace(getNextRoute(result.user.userType, flag === "true"));
}
