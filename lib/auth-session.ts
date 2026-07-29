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
import type { Href } from "expo-router";
import * as Auth from "@/lib/_core/auth";
import { clearPendingInvite, getPendingInvite } from "@/lib/pending-invite";
import { hasCompletedCaregiverOnboarding } from "@/lib/caregiver-onboarding-flag";
import { getApiBaseUrl } from "@/constants/oauth";
import { identifyUser } from "@/lib/purchases";

const LOGIN_COMPLETED_KEY = "vigora_login_completed";

export type Nav = { replace: (href: Href) => void };

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
): Href {
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

  // Upgrade de conta anônima: se já existe uma sessão (conta anônima), envia
  // o Bearer — o servidor ANEXA o login novo à conta atual em vez de criar
  // outra (getLinkableAnonymousOpenId). Inofensivo no login normal: o servidor
  // só usa a sessão quando ela é de conta anônima.
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = await Auth.getSessionToken().catch(() => null);
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers,
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

  // Vincula a assinatura (RevenueCat) à conta Vigora pelo id estável do servidor
  // — nunca e-mail/telefone (PII). Sem isto, o entitlement fica preso ao ID
  // anônimo do dispositivo e não migra entre aparelhos/logins. Best-effort: não
  // bloqueia nem falha o login se o SDK de compras não estiver configurado.
  const rcAppUserId = result.user.id ? String(result.user.id) : result.user.openId;
  if (rcAppUserId) {
    void identifyUser(rcAppUserId);
  }

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

  // Flag de onboarding do cuidador é POR CONTA (openId) — a chave global antiga
  // não é mais escrita, então lê-la mandava o cuidador ao onboarding a CADA
  // login. Ver lib/caregiver-onboarding-flag.ts.
  const onboardingDone = await hasCompletedCaregiverOnboarding(result.user.openId);
  router.replace(getNextRoute(result.user.userType, onboardingDone));
}
