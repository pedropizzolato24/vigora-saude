import * as ReactNative from "react-native";

const PRODUCTION_API_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? "";

/**
 * Get the API base URL.
 *
 * Priority:
 * 1. `EXPO_PUBLIC_API_BASE_URL` (set at build time, e.g. Railway URL)
 * 2. Web fallback: derive from the current hostname by swapping
 *    the Metro port (8081) for the API port (3000) — used in local dev.
 * 3. Empty string (callers should treat this as misconfigured).
 */
export function getApiBaseUrl(): string {
  if (PRODUCTION_API_URL) {
    return PRODUCTION_API_URL.replace(/\/$/, "");
  }

  if (
    ReactNative.Platform.OS === "web" &&
    typeof window !== "undefined" &&
    window.location
  ) {
    const { protocol, hostname } = window.location;
    const apiHostname = hostname.replace(/^8081-/, "3000-");
    if (apiHostname !== hostname) {
      return `${protocol}//${apiHostname}`;
    }
  }

  return "";
}

export const SESSION_TOKEN_KEY = "app_session_token";
export const USER_INFO_KEY = "vigora-user-info";

// Google OAuth Client IDs — configurar via EAS Secrets ou .env
// expo-auth-session/providers/google seleciona o ID correto por plataforma automaticamente.
// Android usa domínio reverso (com.vigora.saude:/), iOS idem — o Google valida por package/bundle.
// Web usa o proxy Expo (https://auth.expo.io) durante desenvolvimento com Expo Go.
export const GOOGLE_ANDROID_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ?? "";
export const GOOGLE_IOS_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? "";
export const GOOGLE_WEB_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? "";
