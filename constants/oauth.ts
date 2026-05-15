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
