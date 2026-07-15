/**
 * db-account.ts
 *
 * Account elimination (LGPD Art. 18, VI). A single transactional purge of every
 * record tied to an account. Todas as tabelas de domínio são chaveadas por
 * openId (ver docs/design/2026-07-12-monitoring-account-ownership.md), então a
 * exclusão não precisa mais resolver deviceIds.
 *
 * The canonical `users` row is deleted LAST so that, the instant the transaction
 * commits, every outstanding session for the account stops working:
 * authenticateRequest reloads the user from the DB on every request and 403s
 * when it's gone (see _core/sdk.ts). That gives us "log out everywhere" for free
 * and satisfies the post-incident containment requirement too.
 */
import { and, eq, inArray, isNull, lt, or } from "drizzle-orm";
import {
  accountLiveness,
  alarmEvents,
  authCodes,
  authIdentities,
  caregiverLinks,
  linkInvites,
  pushTokens,
  userData,
  users,
  warningLog,
} from "../drizzle/schema";
import { getDb, getUserByOpenId } from "./db";

export async function deleteAccountData(openId: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");

  // Resolve the account's contacts (to clear any pending auth codes) BEFORE
  // the transaction. Phone OTP codes are keyed by the digits-only number while
  // users.phone is stored with a leading '+', so include both.
  const user = await getUserByOpenId(openId);
  const phoneDigits = user?.phone?.replace(/\D/g, "");
  const codeTargets = [user?.email, user?.phone, phoneDigits].filter(
    (t): t is string => !!t,
  );

  await db.transaction(async (tx) => {
    // Monitoring data (all openId-keyed).
    await tx.delete(accountLiveness).where(eq(accountLiveness.openId, openId));
    await tx.delete(alarmEvents).where(eq(alarmEvents.openId, openId));
    await tx.delete(warningLog).where(eq(warningLog.openId, openId));

    // Account data.
    await tx.delete(userData).where(eq(userData.openId, openId));
    await tx.delete(pushTokens).where(eq(pushTokens.openId, openId));
    await tx.delete(authIdentities).where(eq(authIdentities.openId, openId));

    // Caregiver pairings: drop links where the account is on either side.
    await tx
      .delete(caregiverLinks)
      .where(
        or(
          eq(caregiverLinks.caregiverOpenId, openId),
          eq(caregiverLinks.monitoredOpenId, openId),
        ),
      );

    // Invite codes the account created or consumed.
    await tx
      .delete(linkInvites)
      .where(
        or(
          eq(linkInvites.createdByOpenId, openId),
          eq(linkInvites.consumedByOpenId, openId),
        ),
      );

    // Best-effort: clear any pending verification/reset/OTP codes for this
    // account's e-mail/phone (they're short-lived, but leave nothing behind).
    if (codeTargets.length > 0) {
      await tx.delete(authCodes).where(inArray(authCodes.target, codeTargets));
    }

    // Canonical account last — invalidates all sessions on commit.
    await tx.delete(users).where(eq(users.openId, openId));
  });
}

/**
 * Expurga contas ANÔNIMAS abandonadas (spec "Contas sem login", custo 1 +
 * Anexo B alavanca 3): sem login linkado e sem sinal de vida há mais de
 * RETENTION_ANON_DAYS (default 180), a conta some do dead man's switch e da
 * base (LGPD minimização — dado órfão irrecuperável pelo dono).
 *
 * Seguro contra expurgo indevido: o openId anônimo é determinístico
 * (`anon:<deviceId>`) — se o aparelho voltar, o mesmo openId é recriado e o
 * estado local por conta do app continua batendo.
 */
export async function purgeAbandonedAnonymousAccounts(
  now: number = Date.now(),
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");

  const raw = Number(process.env.RETENTION_ANON_DAYS);
  const days = Number.isFinite(raw) && raw > 0 ? raw : 180;
  const cutoff = new Date(now - days * 24 * 60 * 60 * 1000);

  // Abandonada = liveness velha, OU nunca pingou e a conta é antiga.
  const rows = await db
    .select({ openId: users.openId })
    .from(users)
    .leftJoin(accountLiveness, eq(accountLiveness.openId, users.openId))
    .where(
      and(
        eq(users.loginMethod, "anonymous"),
        or(
          lt(accountLiveness.lastSeenAt, cutoff),
          and(isNull(accountLiveness.id), lt(users.createdAt, cutoff)),
        ),
      ),
    );

  for (const row of rows) {
    await deleteAccountData(row.openId);
  }
  return rows.length;
}
