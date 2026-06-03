import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { exchangeCodeAsync } from "expo-auth-session";
import * as Auth from "@/lib/_core/auth";
import { clearPendingInvite, getPendingInvite } from "@/lib/pending-invite";
import {
  getApiBaseUrl,
  GOOGLE_ANDROID_CLIENT_ID,
  GOOGLE_IOS_CLIENT_ID,
  GOOGLE_WEB_CLIENT_ID,
} from "@/constants/oauth";

const VERIFIER_KEY = "vigora_oauth_code_verifier";
const REDIRECT_KEY = "vigora_oauth_redirect_uri";
const LOGIN_COMPLETED_KEY = "vigora_login_completed";
const CAREGIVER_ONBOARDING_KEY = "vigora_caregiver_onboarding_completed";

// Mesma seleção por plataforma que o expo-auth-session usa no useAuthRequest.
const CLIENT_ID =
  Platform.select({
    ios: GOOGLE_IOS_CLIENT_ID,
    android: GOOGLE_ANDROID_CLIENT_ID,
    default: GOOGLE_WEB_CLIENT_ID,
  }) ?? GOOGLE_WEB_CLIENT_ID;

// Evita trocar o mesmo code duas vezes (a resposta "warm" e o deep link podem
// chegar quase simultaneamente). Resetado em caso de falha para permitir retry.
let consumingCode: string | null = null;

type Nav = { replace: (href: string) => void };

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
 * Salva os dados de PKCE antes de abrir o browser. No Android o redirect do
 * Google volta como deep link (`vigora://oauthredirect?code=...`) e pode até
 * reabrir o app do zero (cold start), quando o `codeVerifier` em memória já
 * não existe — por isso persistimos.
 */
export async function persistOAuthPkce(
  codeVerifier: string,
  redirectUri: string
): Promise<void> {
  await AsyncStorage.multiSet([
    [VERIFIER_KEY, codeVerifier],
    [REDIRECT_KEY, redirectUri],
  ]);
}

/**
 * Troca o authorization code por tokens, autentica no servidor, grava a sessão
 * e navega para a próxima tela. Idempotente por `code`.
 */
export async function finishGoogleLogin(
  code: string,
  router: Nav,
  reconcileFromCloud: () => Promise<void>
): Promise<void> {
  if (consumingCode === code) return;
  consumingCode = code;

  try {
    const [codeVerifier, redirectUri] = await Promise.all([
      AsyncStorage.getItem(VERIFIER_KEY),
      AsyncStorage.getItem(REDIRECT_KEY),
    ]);

    const tokens = await exchangeCodeAsync(
      {
        clientId: CLIENT_ID,
        code,
        redirectUri: redirectUri ?? "",
        extraParams: { code_verifier: codeVerifier ?? "" },
      },
      { tokenEndpoint: "https://oauth2.googleapis.com/token" }
    );

    if (!tokens.idToken) throw new Error("id_token não recebido do Google");

    const baseUrl = getApiBaseUrl();
    if (!baseUrl)
      throw new Error(
        "URL do servidor não configurada. Rebuilde o app com EXPO_PUBLIC_API_BASE_URL."
      );

    const res = await fetch(`${baseUrl}/api/auth/google`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id_token: tokens.idToken }),
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? `Erro ${res.status}`);
    }

    const result = (await res.json()) as {
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
    };

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
    await AsyncStorage.multiRemove([VERIFIER_KEY, REDIRECT_KEY]);
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
  } catch (err) {
    consumingCode = null;
    throw err;
  }
}
