/**
 * session-refresh.ts
 *
 * Sliding-session refresh. Called once on every app startup: if we have a
 * stored session, ask the server for a fresh token (auth.refresh) and persist
 * it. This keeps an actively-used device logged in indefinitely — essential
 * because a dead session silently disarms the dead man's switch (heartbeat,
 * alarm sync and event confirmation all start failing with 401, with no
 * user-visible error).
 *
 * On web the token lives in an httpOnly cookie the server resets itself, so we
 * only need to trigger the call. On native we read the returned token and store
 * it in SecureStore.
 *
 * If the server rejects the session (401/403 — token already expired), we route
 * the user back to login via handleUnauthorized().
 */
import { Platform } from "react-native";
import { getApiBaseUrl } from "@/constants/oauth";
import * as Auth from "./_core/auth";

const REFRESH_TIMEOUT_MS = 10_000;

/**
 * Refresh the session token if one exists. No-op when there's no session yet
 * (user hasn't logged in). Best-effort: network failures are swallowed so a
 * flaky connection at startup doesn't log the user out — only an explicit
 * 401/403 from the server clears the session.
 */
export async function refreshSessionOnStartup(): Promise<void> {
  try {
    // Only refresh when there's an established session to slide. Stored user
    // info is the cross-platform signal (web can't read the httpOnly cookie
    // from JS). Skipping when absent avoids forcing a brand-new user off the
    // onboarding funnel and into /login on web.
    const user = await Auth.getUserInfo();
    if (!user) return;

    const headers: Record<string, string> = { "Content-Type": "application/json" };

    if (Platform.OS !== "web") {
      const token = await Auth.getSessionToken();
      if (!token) return; // not logged in — nothing to refresh
      headers["Authorization"] = `Bearer ${token}`;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REFRESH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(`${getApiBaseUrl()}/api/trpc/auth.refresh`, {
        method: "POST",
        headers,
        credentials: "include",
        // tRPC mutation with no input still expects the superjson envelope.
        body: JSON.stringify({ json: {} }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    // Server rejected the session: token expired / user deleted. Clear and
    // send the user to login instead of running "logged in but dead".
    if (res.status === 401 || res.status === 403) {
      console.warn("[SessionRefresh] Session rejected by server, signing out");
      await Auth.handleUnauthorized();
      return;
    }

    if (!res.ok) {
      // 5xx / transient: keep the current token, try again next startup.
      console.warn(`[SessionRefresh] Refresh failed (${res.status}), keeping current session`);
      return;
    }

    if (Platform.OS !== "web") {
      const data = await res.json().catch(() => null);
      const newToken: unknown = data?.result?.data?.json?.token ?? data?.result?.data?.token;
      if (typeof newToken === "string" && newToken.length > 0) {
        await Auth.setSessionToken(newToken);
        console.log("[SessionRefresh] Session token refreshed");
      }
    } else {
      console.log("[SessionRefresh] Session cookie refreshed");
    }
  } catch (err) {
    // Network error / timeout: never log the user out on a flaky startup.
    console.warn("[SessionRefresh] Refresh error (keeping session):", err);
  }
}
