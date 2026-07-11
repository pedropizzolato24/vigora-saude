export const COOKIE_NAME = "app_session_id";
/**
 * Default session TTL (30 days). Override via env SESSION_TTL_MS.
 *
 * The token is SLIDING: every app startup calls auth.refresh and stores a
 * fresh token (see lib/session-refresh.ts), so an actively-used device never
 * expires — critical for the dead man's switch, which silently disarms when
 * the session dies (heartbeat/sync/events all 401). The 30-day base bounds a
 * leaked/abandoned-device token window while tolerating real inactivity gaps
 * (hospitalization, travel) that a 7-day window cut too short. Rotation on
 * logout (denylist) + account-deletion invalidation still bound leaked tokens.
 */
export const DEFAULT_SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;
export const UNAUTHED_ERR_MSG = "Please login (10001)";
export const NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";
