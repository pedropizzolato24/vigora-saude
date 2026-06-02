/**
 * db-links.ts
 *
 * Database query helpers for the monitored <-> caregiver linking system.
 * Pure code helpers (code generation/validation) live in links-code.ts; the
 * tRPC routes live in routers-links.ts.
 *
 * Returns early (no-op / null / []) when the DB is unavailable, matching the
 * convention in db-monitoring.ts so dev without a DATABASE_URL doesn't crash.
 */
import { and, desc, eq, gt, inArray, isNull } from "drizzle-orm";
import { getDb } from "./db";
import { alarmEvents, appUsers, caregiverLinks, linkInvites, warningLog } from "../drizzle/schema";

// --- Invites ------------------------------------------------------------------

export async function createInvite(data: {
  code: string;
  createdByOpenId: string;
  createdByRole: "monitored" | "caregiver";
  expiresAt: Date;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(linkInvites).values({
    code: data.code,
    createdByOpenId: data.createdByOpenId,
    createdByRole: data.createdByRole,
    expiresAt: data.expiresAt,
  });
}

/** Returns the most recent invite row for `code`, or null. */
export async function getInviteByCode(code: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(linkInvites)
    .where(eq(linkInvites.code, code))
    .orderBy(desc(linkInvites.id))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Atomically mark an invite as consumed. The WHERE clause only matches an
 * invite that is still unconsumed and unexpired, so two concurrent redemptions
 * race here and exactly one wins (rowsAffected === 1). This closes the TOCTOU
 * between getInviteByCode() and the link write — same claim-before-act pattern
 * used by claimWarning() in db-monitoring.ts.
 *
 * Returns true if this caller claimed the invite.
 */
export async function consumeInviteByCode(
  code: string,
  consumedByOpenId: string,
  now: Date
): Promise<boolean> {
  const db = await getDb();
  if (!db) return true; // dev mode (no DB): allow
  const res = await db
    .update(linkInvites)
    .set({ consumedAt: now, consumedByOpenId })
    .where(
      and(
        eq(linkInvites.code, code),
        isNull(linkInvites.consumedAt),
        gt(linkInvites.expiresAt, now)
      )
    );
  const affected =
    (res as any).affectedRows ?? (res as any)[0]?.affectedRows ?? 0;
  return affected > 0;
}

// --- Links --------------------------------------------------------------------

/**
 * Create (or re-activate) the link for a (caregiver, monitored) pair. Upsert on
 * the unique pair key so re-linking after a revoke flips the existing row back
 * to active instead of leaving a duplicate.
 */
export async function upsertActiveLink(data: {
  caregiverOpenId: string;
  monitoredOpenId: string;
  method: "code" | "qr" | "invite_link";
  displayName?: string | null;
  relationship?: string | null;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const set = {
    method: data.method,
    displayName: data.displayName ?? null,
    relationship: data.relationship ?? null,
    status: "active" as const,
    revokedAt: null,
  };
  await db
    .insert(caregiverLinks)
    .values({
      caregiverOpenId: data.caregiverOpenId,
      monitoredOpenId: data.monitoredOpenId,
      ...set,
    })
    .onDuplicateKeyUpdate({ set });
}

/** The caregiver's single active link, or null. */
export async function getActiveLinkForCaregiver(caregiverOpenId: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(caregiverLinks)
    .where(
      and(
        eq(caregiverLinks.caregiverOpenId, caregiverOpenId),
        eq(caregiverLinks.status, "active")
      )
    )
    .limit(1);
  return rows[0] ?? null;
}

/** All caregivers actively linked to a monitored person. */
export async function getActiveCaregiversForMonitored(monitoredOpenId: string) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(caregiverLinks)
    .where(
      and(
        eq(caregiverLinks.monitoredOpenId, monitoredOpenId),
        eq(caregiverLinks.status, "active")
      )
    );
}

/** The active link for a specific pair, or null. */
export async function getActiveLinkForPair(
  caregiverOpenId: string,
  monitoredOpenId: string
) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(caregiverLinks)
    .where(
      and(
        eq(caregiverLinks.caregiverOpenId, caregiverOpenId),
        eq(caregiverLinks.monitoredOpenId, monitoredOpenId),
        eq(caregiverLinks.status, "active")
      )
    )
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Throws "LINK_NOT_FOUND" if there is no active link between the pair. Used as
 * the authorization gate before any caregiver reads monitored health data.
 */
export async function assertActiveLink(
  caregiverOpenId: string,
  monitoredOpenId: string
): Promise<void> {
  const db = await getDb();
  if (!db) return; // dev mode: allow
  const link = await getActiveLinkForPair(caregiverOpenId, monitoredOpenId);
  if (!link) throw new Error("LINK_NOT_FOUND");
}

// --- Scoped monitored-data reads (caregiver side, Fase 4) ---------------------

/**
 * Devices owned by a monitored account, most recently updated first. The first
 * row is treated as the monitored person's primary device for live data
 * (heartbeat, location, alarm events).
 */
export async function getDevicesForOwner(openId: string) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(appUsers)
    .where(eq(appUsers.openId, openId))
    .orderBy(desc(appUsers.updatedAt));
}

/** Recent missed / not-sent alarm events for a device (newest first). */
export async function getRecentMissedEventsForDevice(deviceId: string, limit = 30) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(alarmEvents)
    .where(
      and(
        eq(alarmEvents.deviceId, deviceId),
        inArray(alarmEvents.status, ["missed", "not_sent"])
      )
    )
    .orderBy(desc(alarmEvents.scheduledAt))
    .limit(limit);
}

/** Recent escalation warnings for a device (newest first). */
export async function getRecentWarningsForDevice(deviceId: string, limit = 20) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(warningLog)
    .where(eq(warningLog.deviceId, deviceId))
    .orderBy(desc(warningLog.sentAt))
    .limit(limit);
}

/** Revoke the active link for a pair (kept for audit; excluded from access). */
export async function revokeLink(
  caregiverOpenId: string,
  monitoredOpenId: string
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(caregiverLinks)
    .set({ status: "revoked", revokedAt: new Date() })
    .where(
      and(
        eq(caregiverLinks.caregiverOpenId, caregiverOpenId),
        eq(caregiverLinks.monitoredOpenId, monitoredOpenId)
      )
    );
}
