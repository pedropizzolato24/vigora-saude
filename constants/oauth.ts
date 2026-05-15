import * as Linking from "expo-linking";
import * as ReactNative from "react-native";

const env = {
  portal: process.env.EXPO_PUBLIC_OAUTH_PORTAL_URL ?? "",
  server: process.env.EXPO_PUBLIC_OAUTH_SERVER_URL ?? "",
  appId: process.env.EXPO_PUBLIC_APP_ID ?? "",
  ownerId: process.env.EXPO_PUBLIC_OWNER_OPEN_ID ?? "",
  ownerName: process.env.EXPO_PUBLIC_OWNER_NAME ?? "",
  apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL ?? "",
  deepLinkScheme: "vigora",
};

export const OAUTH_PORTAL_URL = env.portal;
export const OAUTH_SERVER_URL = env.server;
export const APP_ID = env.appId;
export const OWNER_OPEN_ID = env.ownerId;
export const OWNER_NAME = env.ownerName;
export const API_BASE_URL = env.apiBaseUrl;

const PRODUCTION_API_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? "";

/**
 * Get the API base URL, deriving from current hostname if not set.
 * Metro runs on 8081, API server runs on 3000.
 * URL pattern: https://PORT-sandboxid.region.domain
 *
 * Priority:
 * 1. EXPO_PUBLIC_API_BASE_URL env var (set in sandbox dev environment)
 * 2. Web: derive from current hostname (8081 -> 3000)
 * 3. Native fallback: permanent production domain
 */
export function getApiBaseUrl(): string {
  // If API_BASE_URL is set, use it
  if (API_BASE_URL) {
    return API_BASE_URL.replace(/\/$/, "");
  }

  // On web, derive from current hostname by replacing port 8081 with 3000
  if (ReactNative.Platform.OS === "web" && typeof window !== "undefined" && window.location) {
    const { protocol, hostname } = window.location;
    // Pattern: 8081-sandboxid.region.domain -> 3000-sandboxid.region.domain
    const apiHostname = hostname.replace(/^8081-/, "3000-");
    if (apiHostname !== hostname) {
      return `${protocol}//${apiHostname}`;
    }
    // Web fallback: use production domain
    return PRODUCTION_API_URL;
  }

  // Native fallback: use permanent production domain
  // This ensures Expo Go and APK builds always connect to the correct server
  return PRODUCTION_API_URL;
}

export const SESSION_TOKEN_KEY = "app_session_token";
export const USER_INFO_KEY = "vigora-user-info";

/**
 * Get the redirect URI for OAuth callback.
 * - Web: uses API server callback endpoint
 * - Native: uses deep link scheme
 */
export const getRedirectUri = () => {
  if (ReactNative.Platform.OS === "web") {
    return `${getApiBaseUrl()}/api/oauth/callback`;
  } else {
    return Linking.createURL("/oauth/callback", {
      scheme: env.deepLinkScheme,
    });
  }
};

/**
 * Ask the API server to issue a signed `state` JWT for our redirectUri.
 * The server validates the redirectUri against its allowlist, signs the
 * state with HMAC, and returns it. This replaces the previous (insecure)
 * base64(redirectUri) state, which had no CSRF protection and allowed
 * any caller to set arbitrary redirectUris.
 */
async function fetchSignedState(redirectUri: string): Promise<string> {
  const baseUrl = getApiBaseUrl();
  const params = new URLSearchParams({ redirectUri });
  const url = `${baseUrl}/api/oauth/state?${params.toString()}`;
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Failed to obtain OAuth state (${res.status}) ${detail}`);
  }
  const data = (await res.json()) as { state?: string };
  if (!data.state) {
    throw new Error("OAuth state endpoint returned empty state");
  }
  return data.state;
}

/**
 * Build the OAuth provider login URL after acquiring a signed state from
 * the API server. Returns null if state issuance fails (e.g. server
 * unreachable, allowlist mismatch).
 */
export const getLoginUrl = async (): Promise<string | null> => {
  const redirectUri = getRedirectUri();
  let state: string;
  try {
    state = await fetchSignedState(redirectUri);
  } catch (err) {
    console.error("[OAuth] Could not obtain signed state:", err);
    return null;
  }

  const url = new URL(`${OAUTH_PORTAL_URL}/app-auth`);
  url.searchParams.set("appId", APP_ID);
  url.searchParams.set("redirectUri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("type", "signIn");

  return url.toString();
};

/**
 * Start OAuth login flow.
 *
 * On native platforms (iOS/Android), open the system browser directly so
 * the OAuth callback returns via deep link to the app.
 *
 * On web, this simply redirects to the login URL.
 *
 * @returns Always null, the callback is handled via deep link.
 */
export async function startOAuthLogin(): Promise<string | null> {
  const loginUrl = await getLoginUrl();
  if (!loginUrl) {
    throw new Error(
      'Não foi possível obter a URL de login. Verifique sua conexão com a internet.',
    );
  }

  if (ReactNative.Platform.OS === "web") {
    if (typeof window !== "undefined") {
      window.location.href = loginUrl;
    }
    return null;
  }

  const supported = await Linking.canOpenURL(loginUrl);
  if (!supported) {
    throw new Error('Não foi possível abrir o navegador para login.');
  }

  try {
    await Linking.openURL(loginUrl);
  } catch (error) {
    console.error("[OAuth] Failed to open login URL:", error);
    throw new Error('Falha ao abrir o navegador. Tente novamente.');
  }

  // The OAuth callback will reopen the app via deep link.
  return null;
}
