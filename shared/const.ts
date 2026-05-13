export const COOKIE_NAME = "app_session_id";
/** Legacy constant — used to be the session TTL. Kept for any
 *  remaining callers; new code should use SESSION_TTL_MS. */
export const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;
/**
 * Default session TTL (7 days). Override via env SESSION_TTL_MS.
 * The previous 1-year TTL gave any leaked token a 12-month attack
 * window with no rotation/revocation; we now denylist on logout and
 * users re-auth weekly.
 */
export const DEFAULT_SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
export const AXIOS_TIMEOUT_MS = 30_000;
export const UNAUTHED_ERR_MSG = "Please login (10001)";
export const NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";
