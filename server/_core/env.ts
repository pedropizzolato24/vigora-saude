import { randomBytes } from "node:crypto";

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
 * Escape hatch EXPLÍCITA para desenvolvimento local sem segredo/banco.
 * Precisa ser ligada de propósito e não vale em produção.
 */
export const DEV_INSECURE_FLAG = "ALLOW_INSECURE_DEV_BOOT";

/**
 * Fail-closed check for secrets that must never be empty.
 *
 * Sem isto, JWT_SECRET cai silenciosamente para "" (ver `cookieSecret` acima e
 * sdk.ts), e as sessões seriam assinadas E verificadas com uma chave HMAC vazia
 * — forja trivial de token para qualquer openId.
 *
 * A decisão é pela PRESENÇA do segredo, não por NODE_ENV. A versão anterior
 * liberava o boot sempre que `NODE_ENV !== "production"`, então qualquer desvio
 * ("Production", "prod", ou a variável sumindo porque um Start Command
 * customizado substituiu o script `start`) fazia o servidor subir em modo
 * permissivo com apenas um aviso no log. Agora o padrão é recusar, e o modo
 * permissivo exige ligar ALLOW_INSECURE_DEV_BOOT de propósito — que, por sua
 * vez, nunca vale em produção.
 *
 * Lê `env` ao vivo (default process.env) para poder ser testado com um
 * ambiente falso.
 */
export function assertRequiredSecrets(env: NodeJS.ProcessEnv = process.env): void {
  const isProduction = env.NODE_ENV === "production";
  const devPermissivo = env[DEV_INSECURE_FLAG] === "1" && !isProduction;
  const secret = env.JWT_SECRET ?? "";

  if (secret.length === 0) {
    if (!devPermissivo) {
      throw new Error(
        "JWT_SECRET ausente ou vazio. Recusando iniciar para não assinar/" +
          "verificar sessões com segredo vazio (forja de token trivial). " +
          `Em desenvolvimento local, defina ${DEV_INSECURE_FLAG}=1 para ignorar.`,
      );
    }
    // Segredo EFÊMERO em vez de vazio: um HMAC de chave vazia assina e verifica
    // qualquer token. Aleatório (e não uma constante no código) de propósito —
    // um default fixo aqui seria justamente o "valor padrão que vira segredo
    // real quando ninguém sobrescreve". As sessões morrem a cada reinício, o
    // que é o comportamento certo para um servidor de desenvolvimento.
    env.JWT_SECRET = randomBytes(32).toString("hex");
    console.warn(
      `[api] AVISO: JWT_SECRET ausente e ${DEV_INSECURE_FLAG}=1 — gerado um ` +
        "segredo aleatório só para esta execução; as sessões não sobrevivem a " +
        "um reinício. NUNCA use isto fora da sua máquina.",
    );
  } else if (secret.length < 32) {
    console.warn(
      "[api] AVISO: JWT_SECRET com menos de 32 caracteres; use >=32 (256-bit) para HS256.",
    );
  }

  // Banco ausente não é falha aberta (a autenticação recusa quando não acha o
  // usuário), mas é o modo de falha que já desarmou o dead man's switch por 27h
  // sem ninguém notar. Melhor não subir do que subir cego.
  if (!(env.DATABASE_URL ?? "") && !devPermissivo) {
    throw new Error(
      "DATABASE_URL ausente. Recusando iniciar: sem banco o monitoramento " +
        `não persiste nada. Em desenvolvimento local, defina ${DEV_INSECURE_FLAG}=1.`,
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
