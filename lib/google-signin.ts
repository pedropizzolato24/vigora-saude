import { Linking, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { exchangeCodeAsync } from "expo-auth-session";
import {
  completeServerLogin,
  getNextRoute,
  postAuthRoute,
  type Nav,
  type ServerAuthResult,
} from "@/lib/auth-session";
import {
  GOOGLE_ANDROID_CLIENT_ID,
  GOOGLE_IOS_CLIENT_ID,
  GOOGLE_WEB_CLIENT_ID,
} from "@/constants/oauth";

const VERIFIER_KEY = "vigora_oauth_code_verifier";
const REDIRECT_KEY = "vigora_oauth_redirect_uri";

// Re-export: app/oauthredirect.tsx e telas antigas importam daqui.
export { getNextRoute };

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
 * Abre a tela de consentimento do Google.
 *
 * O caminho normal é o Custom Tab (expo-web-browser), mas ele depende de um
 * navegador que exponha o CustomTabsService e esteja visível para o app
 * (package visibility do Android 11+). Em aparelhos com Chrome desativado ou
 * ROM enxuta isso não existe e o módulo rejeita com "No matching browser
 * activity found" — o login nem chegava a abrir (Samsung A15).
 *
 * Fallback: abrir a URL no navegador padrão do sistema. No Android o retorno é
 * sempre por deep link (`com.vigora.saude:/oauthredirect`), tratado em
 * app/oauthredirect.tsx, então o login termina igual.
 *
 * @returns `true` quando usou o fallback (o app volta ao primeiro plano na hora,
 * então quem chamou precisa liberar o estado de loading).
 */
export async function openGoogleAuth(
  promptAsync: () => Promise<unknown>,
  authUrl: string | null | undefined
): Promise<boolean> {
  try {
    await promptAsync();
    return false;
  } catch (err) {
    if (Platform.OS !== "android" || !authUrl) throw err;
    console.warn("[GoogleLogin] Custom Tab indisponível, abrindo navegador padrão:", err);
    await Linking.openURL(authUrl);
    return true;
  }
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

    const result = await postAuthRoute<ServerAuthResult>("/api/auth/google", {
      id_token: tokens.idToken,
    });

    await completeServerLogin(result, router, reconcileFromCloud);
    // Limpa o PKCE só depois do login concluído.
    await AsyncStorage.multiRemove([VERIFIER_KEY, REDIRECT_KEY]);
  } catch (err) {
    consumingCode = null;
    // Diagnóstico (client IDs são públicos, sem segredo): confirma que o CLIENT_ID
    // não veio vazio do bundle e ajuda a identificar redirect_uri_mismatch.
    console.error("[GoogleLogin] failed. clientId:", CLIENT_ID || "(vazio!)", "err:", err);
    throw err;
  }
}
