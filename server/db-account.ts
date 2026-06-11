/**
 * db-account.ts
 *
 * Account elimination (LGPD Art. 18, VI). A single transactional purge of every
 * record tied to an account, across both the openId-keyed tables and the
 * device-keyed monitoring tables (reached via app_users.openId -> deviceId).
 *
 * The canonical `users` row is deleted LAST so that, the instant the transaction
 * commits, every outstanding session for the account stops working:
 * authenticateRequest reloads the user from the DB on every request and 403s
 * when it's gone (see _core/sdk.ts). That gives us "log out everywhere" for free
 * and satisfies the post-incident containment requirement too.
 */
import { eq, inArray, or } from "drizzle-orm";
import {
  alarmEvents,
  appUsers,
  authCodes,
  authIdentities,
  caregiverLinks,
  deviceHeartbeat,
  linkInvites,
  pushTokens,
  syncedAlarms,
  userData,
  users,
  warningLog,
} from "../drizzle/schema";
import { getDb, getUserByOpenId } from "./db";

export async function deleteAccountData(
  openId: string,
): Promise<{ deletedDevices: number }> {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");

  // Resolve the account's contacts (to clear any pending auth codes) and its
  // device ids (to clear device-keyed monitoring data) BEFORE the transaction.
  const user = await getUserByOpenId(openId);
  const deviceRows = await db
    .select({ deviceId: appUsers.deviceId })
    .from(appUsers)
    .where(eq(appUsers.openId, openId));
  const deviceIds = deviceRows.map((r) => r.deviceId);
  const codeTargets = [user?.email, user?.phone].filter(
    (t): t is string => !!t,
  );

  await db.transaction(async (tx) => {
    // Device-keyed tables (heartbeat, alarm schedule + event log, warning log).
    if (deviceIds.length > 0) {
      await tx.delete(syncedAlarms).where(inArray(syncedAlarms.deviceId, deviceIds));
      await tx.delete(deviceHeartbeat).where(inArray(deviceHeartbeat.deviceId, deviceIds));
      await tx.delete(alarmEvents).where(inArray(alarmEvents.deviceId, deviceIds));
      await tx.delete(warningLog).where(inArray(warningLog.deviceId, deviceIds));
    }

    // openId-keyed tables.
    await tx.delete(appUsers).where(eq(appUsers.openId, openId));
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

  return { deletedDevices: deviceIds.length };
}
