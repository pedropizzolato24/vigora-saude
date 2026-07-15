/**
 * db-auth.ts
 *
 * Identidades de login (auth_identities) e códigos de verificação (auth_codes).
 *
 * Regra central de vinculação: o MESMO e-mail verificado sempre resolve para a
 * MESMA conta canônica (users.openId), independente do método de login. A
 * vinculação só acontece com e-mail comprovadamente verificado:
 *   - Google: claim `email_verified` do id_token
 *   - Apple: claim `email_verified` do identity token
 *   - E-mail+senha: código de 6 dígitos enviado à caixa postal
 * Telefone nunca vincula por e-mail (não há e-mail) nem por users.phone — o
 * telefone do cadastro é autodeclarado, vincular por ele permitiria assumir a
 * conta de quem digitou o número errado.
 */
import { createHash, randomBytes, randomInt } from "crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import { authCodes, authIdentities, users } from "../drizzle/schema";
import type { AuthCode, AuthIdentity } from "../drizzle/schema";
import { getDb, getUserByOpenId, upsertUser } from "./db";

export type AuthProvider = "google" | "apple" | "email" | "phone";
export type CodePurpose = "signup" | "reset" | "phone";

// --- Identidades ---------------------------------------------------------------

export async function findIdentity(
  provider: AuthProvider,
  subject: string
): Promise<AuthIdentity | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select()
    .from(authIdentities)
    .where(
      and(eq(authIdentities.provider, provider), eq(authIdentities.subject, subject))
    )
    .limit(1);
  return rows[0];
}

async function createIdentity(
  provider: AuthProvider,
  subject: string,
  openId: string,
  passwordHash?: string | null
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  // Corrida benigna (dois primeiros logins simultâneos): o índice único
  // (provider, subject) garante uma só linha; o duplicado perde e relê.
  await db
    .insert(authIdentities)
    .values({ provider, subject, openId, passwordHash: passwordHash ?? null })
    .onDuplicateKeyUpdate({ set: { updatedAt: new Date() } });
}

export async function setIdentityPassword(
  subject: string,
  passwordHash: string
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  await db
    .update(authIdentities)
    .set({ passwordHash })
    .where(
      and(eq(authIdentities.provider, "email"), eq(authIdentities.subject, subject))
    );
}

/** Conta mais antiga (menor id) com este e-mail, comparação case-insensitive. */
async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select()
    .from(users)
    .where(sql`LOWER(${users.email}) = ${email.toLowerCase()}`)
    .orderBy(asc(users.id))
    .limit(1);
  return rows[0];
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function makeOpenId(provider: AuthProvider, subject: string): string {
  // Google/Apple mantêm o formato legado `provider:sub` (compatível com as
  // contas existentes). E-mail usa id aleatório — o e-mail não cabe/não deve
  // virar chave (PII em todas as tabelas keyed por openId).
  if (provider === "email") return `email:${randomBytes(16).toString("hex")}`;
  return `${provider}:${subject}`;
}

export interface ResolvedAccount {
  openId: string;
  /** true quando uma conta nova foi criada (vs. login/vinculação em existente). */
  isNew: boolean;
}

/**
 * Resolve a credencial para a conta canônica, criando/vinculando quando preciso:
 *   1. identidade já registrada → conta dela
 *   2. legado: users.openId = `provider:sub` (contas pré-auth_identities) → backfill
 *   3. e-mail verificado bate com conta existente → vincula nesta conta
 *   4. sessão anônima ativa (`linkToOpenId`) → anexa a credencial à conta
 *      anônima que JÁ existe — o openId não muda, nada migra
 *   5. cria conta nova
 *
 * Nota sobre a ordem 3 vs 4: o invariante "mesmo e-mail verificado = mesma
 * conta" vence a vinculação anônima. Se o login já tem conta própria, o
 * usuário entra NELA (borda de merge do spec — os dados locais anônimos
 * permanecem no aparelho sob a chave da conta anônima; o lado servidor
 * expira no expurgo de contas anônimas abandonadas).
 */
export async function resolveAccount(input: {
  provider: AuthProvider;
  subject: string;
  email?: string | null;
  emailVerified?: boolean;
  name?: string | null;
  passwordHash?: string | null;
  /** openId da conta ANÔNIMA autenticada no request — alvo da vinculação. */
  linkToOpenId?: string | null;
}): Promise<ResolvedAccount> {
  const db = await getDb();
  if (!db) {
    // Sem banco (dev local sem DATABASE_URL): degrada para o comportamento
    // legado — sessão keyed por provider:sub, sem vinculação.
    console.warn("[Auth] Database unavailable; skipping identity resolution");
    return { openId: makeOpenId(input.provider, input.subject), isNew: false };
  }

  const existing = await findIdentity(input.provider, input.subject);
  if (existing) return { openId: existing.openId, isNew: false };

  // Contas legadas (anteriores à tabela de identidades)
  if (input.provider === "google" || input.provider === "apple") {
    const legacy = await getUserByOpenId(`${input.provider}:${input.subject}`);
    if (legacy) {
      await createIdentity(input.provider, input.subject, legacy.openId);
      return { openId: legacy.openId, isNew: false };
    }
  }

  // Vinculação por e-mail VERIFICADO — nunca por e-mail autodeclarado.
  if (input.email && input.emailVerified) {
    const match = await getUserByEmail(input.email);
    if (match) {
      await createIdentity(
        input.provider,
        input.subject,
        match.openId,
        input.passwordHash
      );
      // Corrida: outro request pode ter criado a identidade primeiro,
      // possivelmente apontando para outra conta — releia a verdade.
      const settled = await findIdentity(input.provider, input.subject);
      return { openId: settled?.openId ?? match.openId, isNew: false };
    }
  }

  // Upgrade da conta anônima: anexa a identidade ao openId que a sessão já
  // usa. Só quando o alvo é de fato uma conta anônima (defesa em profundidade
  // — quem chama já filtra por loginMethod, mas o parâmetro não é confiável
  // por construção).
  if (input.linkToOpenId) {
    const target = await getUserByOpenId(input.linkToOpenId);
    if (target?.loginMethod === "anonymous") {
      await createIdentity(
        input.provider,
        input.subject,
        target.openId,
        input.passwordHash
      );
      // Corrida: outro request pode ter registrado a identidade primeiro,
      // possivelmente para outra conta — releia a verdade.
      const settled = await findIdentity(input.provider, input.subject);
      const openId = settled?.openId ?? target.openId;
      if (openId === target.openId) {
        // A conta deixa de ser anônima: método real, e-mail verificado e nome
        // (só preenche vazios — nome editado no app tem precedência).
        await upsertUser({
          openId,
          loginMethod: input.provider,
          lastSignedIn: new Date(),
          ...(input.emailVerified && input.email && !target.email
            ? { email: input.email }
            : {}),
          ...(!target.name && input.name ? { name: input.name } : {}),
        });
      }
      return { openId, isNew: false };
    }
  }

  const openId = makeOpenId(input.provider, input.subject);
  // E-mail só é persistido quando verificado — users.email é a CHAVE de
  // vinculação (getUserByEmail), então gravar um e-mail não verificado deixaria
  // um atacante "plantar" o e-mail da vítima e capturar a vinculação futura.
  const safeEmail = input.emailVerified ? input.email ?? null : null;
  await upsertUser({
    openId,
    name: input.name ?? null,
    email: safeEmail,
    loginMethod: input.provider,
    lastSignedIn: new Date(),
  });

  // Race de primeiro login: se um request concorrente já inseriu uma conta com
  // o mesmo e-mail (índice único em users.email), o upsert acima foi absorvido
  // como UPDATE daquela linha e NÃO existe users row para `openId`. Detecta e
  // vincula na conta existente em vez de criar uma identidade órfã.
  if (safeEmail) {
    const created = await getUserByOpenId(openId);
    if (!created) {
      const match = await getUserByEmail(safeEmail);
      if (match) {
        await createIdentity(
          input.provider,
          input.subject,
          match.openId,
          input.passwordHash
        );
        const settled = await findIdentity(input.provider, input.subject);
        return { openId: settled?.openId ?? match.openId, isNew: false };
      }
    }
  }

  await createIdentity(input.provider, input.subject, openId, input.passwordHash);
  const settled = await findIdentity(input.provider, input.subject);
  return { openId: settled?.openId ?? openId, isNew: true };
}

/**
 * Throttle por destino (e-mail/telefone), independente de IP: retorna false se
 * já existe um código ativo criado há menos de `cooldownMs`. É a defesa real
 * contra bombing de OTP/e-mail — o limite por IP é contornável forjando
 * X-Forwarded-For, este não.
 */
export async function canSendCode(
  purpose: CodePurpose,
  target: string,
  cooldownMs: number
): Promise<boolean> {
  const db = await getDb();
  if (!db) return true;
  const rows = await db
    .select()
    .from(authCodes)
    .where(and(eq(authCodes.purpose, purpose), eq(authCodes.target, target)))
    .limit(1);
  const row = rows[0];
  if (!row) return true;
  return Date.now() - row.createdAt.getTime() >= cooldownMs;
}

// --- Códigos de verificação ------------------------------------------------------

const CODE_TTL_MS = 15 * 60 * 1000; // 15 minutos
const MAX_CODE_ATTEMPTS = 5;

export function hashCode(target: string, code: string): string {
  return createHash("sha256").update(`${target}:${code}`).digest("hex");
}

export function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/** Cria (ou substitui) o código ativo para (purpose, target). */
export async function putAuthCode(
  purpose: CodePurpose,
  target: string,
  code: string,
  payload?: Record<string, unknown> | null
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  const values = {
    purpose,
    target,
    codeHash: hashCode(target, code),
    payload: payload ?? null,
    attempts: 0,
    expiresAt: new Date(Date.now() + CODE_TTL_MS),
  };
  await db
    .insert(authCodes)
    .values(values)
    .onDuplicateKeyUpdate({
      set: {
        codeHash: values.codeHash,
        payload: values.payload,
        attempts: 0,
        expiresAt: values.expiresAt,
        createdAt: new Date(),
      },
    });
}

export type CodeCheck =
  | { ok: true; row: AuthCode }
  | { ok: false; reason: "not_found" | "expired" | "too_many_attempts" | "mismatch" };

/**
 * Confere o código informado. Incrementa `attempts` em erro e apaga a linha em
 * acerto (single-use). Não distinguir os motivos na resposta HTTP — o cliente
 * recebe sempre "código inválido ou expirado".
 */
export async function consumeAuthCode(
  purpose: CodePurpose,
  target: string,
  code: string
): Promise<CodeCheck> {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");

  const rows = await db
    .select()
    .from(authCodes)
    .where(and(eq(authCodes.purpose, purpose), eq(authCodes.target, target)))
    .limit(1);
  const row = rows[0];
  if (!row) return { ok: false, reason: "not_found" };

  if (row.expiresAt.getTime() < Date.now()) {
    await db.delete(authCodes).where(eq(authCodes.id, row.id));
    return { ok: false, reason: "expired" };
  }
  if (row.attempts >= MAX_CODE_ATTEMPTS) {
    return { ok: false, reason: "too_many_attempts" };
  }
  if (row.codeHash !== hashCode(target, code)) {
    await db
      .update(authCodes)
      .set({ attempts: row.attempts + 1 })
      .where(eq(authCodes.id, row.id));
    return { ok: false, reason: "mismatch" };
  }

  await db.delete(authCodes).where(eq(authCodes.id, row.id));
  return { ok: true, row };
}
