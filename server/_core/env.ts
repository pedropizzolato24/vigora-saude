/**
 * Parses a comma-separated allowlist of redirect URI patterns from env.
 * Each entry is either an exact match, or a prefix ending in `*`.
 * Example: "https://app.example.com/api/oauth/callback,vigora://*"
 */
function parseAllowlist(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Comma-separated allowlist of allowed origins for browser requests.
 * Reflective CORS (echoing any Origin) is replaced by this list — the
 * previous behavior combined with `Allow-Credentials: true` enabled
 * cross-site authenticated requests from any malicious origin.
 */
function parseOriginAllowlist(raw: string | undefined): string[] {
  return parseAllowlist(raw);
}

export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  // WhatsApp Business API (Meta Cloud API)
  whatsappApiToken: process.env.WHATSAPP_API_TOKEN ?? "",
  whatsappPhoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? "",
  // Email via Resend API (https://resend.com)
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  resendFromEmail: process.env.RESEND_FROM_EMAIL ?? "",
  // SMS via Twilio
  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID ?? "",
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN ?? "",
  twilioFromNumber: process.env.TWILIO_FROM_NUMBER ?? "",
  // OAuth — redirect URIs we'll accept when issuing/verifying signed state
  // and CORS origins we'll accept. Set via env var.
  oauthRedirectAllowlist: parseAllowlist(process.env.OAUTH_REDIRECT_URI_ALLOWLIST),
  corsOriginAllowlist: parseOriginAllowlist(process.env.CORS_ORIGIN_ALLOWLIST),
  // Shared secret required by the check-missed-alarms edge function
  checkMissedAlarmsSecret: process.env.CHECK_MISSED_ALARMS_SECRET ?? "",
};

/**
 * Returns true if `redirectUri` matches one of the configured allowlist
 * entries. Each entry is either an exact match or a prefix ending in `*`.
 * In dev (no allowlist set), localhost is allowed.
 *
 * Reads process.env on each call so tests (and rotated config) see the
 * current value rather than the value captured at module load.
 */
export function isAllowedRedirectUri(redirectUri: string): boolean {
  const list = parseAllowlist(process.env.OAUTH_REDIRECT_URI_ALLOWLIST);
  if (list.length === 0) {
    // Dev fallback: accept localhost and 127.0.0.1 callbacks only.
    return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/api\/oauth\/callback/.test(
      redirectUri
    );
  }
  return list.some((entry) => {
    if (entry.endsWith("*")) {
      const prefix = entry.slice(0, -1);
      return redirectUri.startsWith(prefix);
    }
    return redirectUri === entry;
  });
}

/**
 * Returns true if the given origin is allowlisted. In dev (no list set),
 * accepts localhost on any port.
 */
export function isAllowedOrigin(origin: string): boolean {
  const list = parseOriginAllowlist(process.env.CORS_ORIGIN_ALLOWLIST);
  if (list.length === 0) {
    return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  }
  return list.some((entry) => {
    if (entry.endsWith("*")) {
      const prefix = entry.slice(0, -1);
      return origin.startsWith(prefix);
    }
    return origin === entry;
  });
}
