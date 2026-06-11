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
 * Fail-closed check for secrets that must never be empty in production.
 * Without it, JWT_SECRET silently fell back to "" (see `cookieSecret` above
 * and sdk.ts), so session JWTs would be signed AND verified with an empty
 * HMAC key — trivial token forgery for any openId. We refuse to boot rather
 * than run fail-open. Reads `env` live (default process.env) so it can be
 * unit-tested with a fake environment.
 */
export function assertRequiredSecrets(env: NodeJS.ProcessEnv = process.env): void {
  const isProduction = env.NODE_ENV === "production";
  const secret = env.JWT_SECRET ?? "";
  if (!isProduction) {
    if (secret.length === 0) {
      console.warn(
        "[api] AVISO: JWT_SECRET ausente — usando segredo vazio (apenas DEV). " +
          "Em produção o servidor recusa iniciar sem ele.",
      );
    }
    return;
  }
  if (secret.length === 0) {
    throw new Error(
      "JWT_SECRET ausente ou vazio em produção. Recusando iniciar para não " +
        "assinar/verificar sessões com segredo vazio (forja de token trivial).",
    );
  }
  if (secret.length < 32) {
    console.warn(
      "[api] AVISO: JWT_SECRET com menos de 32 caracteres; use >=32 (256-bit) para HS256.",
    );
  }
}

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
