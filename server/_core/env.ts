function parseCsv(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

export const ENV = {
  appId: process.env.APP_ID ?? process.env.VITE_APP_ID ?? "vigora-saude",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  // WhatsApp Business API (Meta Cloud API)
  whatsappApiToken: process.env.WHATSAPP_API_TOKEN ?? "",
  whatsappPhoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? "",
  // CORS origins for browser requests. Comma-separated. Each entry is
  // either an exact match or a prefix ending in `*`.
  corsOriginAllowlist: parseCsv(process.env.CORS_ORIGIN_ALLOWLIST),
};

/**
 * Returns true if the given origin is allowlisted. In dev (no list set),
 * accepts localhost on any port.
 */
export function isAllowedOrigin(origin: string): boolean {
  const list = parseCsv(process.env.CORS_ORIGIN_ALLOWLIST);
  if (list.length === 0) {
    return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  }
  return list.some((entry) => {
    if (entry.endsWith("*")) return origin.startsWith(entry.slice(0, -1));
    return origin === entry;
  });
}
