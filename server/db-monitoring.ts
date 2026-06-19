/**
 * db-monitoring.ts
 *
 * Database query helpers for the server-side alarm monitoring system.
 * Handles: device registration, alarm sync, heartbeat, alarm events, warning log.
 */
import { and, desc, eq, gte, inArray, isNull, lt, lte, or } from "drizzle-orm";
import { getDb } from "./db";
import { pickPendingEvent } from "./_core/pick-pending-event";
import {
  alarmEvents,
  appUsers,
  deviceHeartbeat,
  EmergencyContactRecord,
  InsertAlarmEvent,
  syncedAlarms,
  warningLog,
} from "../drizzle/schema";

// --- App Users ----------------------------------------------------------------

export async function upsertAppUser(data: {
  deviceId: string;
  openId: string;
  userName?: string;
  emergencyContacts?: EmergencyContactRecord[];
  lastLocation?: string;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const values = {
    deviceId: data.deviceId,
    openId: data.openId,
    userName: data.userName ?? null,
    emergencyContacts: data.emergencyContacts ?? [],
    lastLocation: data.lastLocation ?? null,
    lastLocationAt: data.lastLocation ? new Date() : undefined,
  };

  await db
    .insert(appUsers)
    .values(values)
    .onDuplicateKeyUpdate({
      set: {
        openId: values.openId,
        userName: values.userName,
        emergencyContacts: values.emergencyContacts,
        ...(data.lastLocation
          ? { lastLocation: data.lastLocation, lastLocationAt: new Date() }
          : {}),
      },
    });
}

export async function getAppUser(deviceId: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(appUsers)
    .where(eq(appUsers.deviceId, deviceId))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Returns the appUsers row only if (deviceId, openId) match.
 * Used by protected procedures to enforce per-user ownership of devices.
 */
export async function getAppUserForOwner(
  deviceId: string,
  openId: string
) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(appUsers)
    .where(and(eq(appUsers.deviceId, deviceId), eq(appUsers.openId, openId)))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Throws if the deviceId is registered to a different owner.
 * Returns true if registered to this owner OR not yet registered (free to claim via register()).
 * Used as an authorization check before mutating device-scoped data.
 */
export async function assertDeviceOwnership(
  deviceId: string,
  openId: string
): Promise<void> {
  const db = await getDb();
  if (!db) return; // No DB = dev mode, allow
  const rows = await db
    .select({ openId: appUsers.openId })
    .from(appUsers)
    .where(eq(appUsers.deviceId, deviceId))
    .limit(1);
  if (rows.length === 0) {
    throw new Error("DEVICE_NOT_REGISTERED");
  }
  const owner = rows[0].openId;
  if (owner !== null && owner !== openId) {
    throw new Error("DEVICE_OWNED_BY_ANOTHER_USER");
  }
}

// --- Synced Alarms ------------------------------------------------------------

export async function upsertSyncedAlarm(data: {
  deviceId: string;
  alarmId: string;
  time: string;
  description: string;
  enabled: boolean;
  repeat: "daily" | "weekdays" | "weekends" | "custom";
  customDays?: number[];
}): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db
    .insert(syncedAlarms)
    .values(data)
    .onDuplicateKeyUpdate({
      set: {
        time: data.time,
        description: data.description,
        enabled: data.enabled,
        repeat: data.repeat,
        customDays: data.customDays ?? [],
      },
    });
}

export async function deleteSyncedAlarm(deviceId: string, alarmId: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .delete(syncedAlarms)
    .where(
      and(eq(syncedAlarms.deviceId, deviceId), eq(syncedAlarms.alarmId, alarmId))
    );
}

export async function getSyncedAlarms(deviceId: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(syncedAlarms).where(eq(syncedAlarms.deviceId, deviceId));
}

export async function replaceAllSyncedAlarms(
  deviceId: string,
  alarms: Array<{
    alarmId: string;
    time: string;
    description: string;
    enabled: boolean;
    repeat: "daily" | "weekdays" | "weekends" | "custom";
    customDays?: number[];
  }>
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  // Delete all existing alarms for this device
  await db.delete(syncedAlarms).where(eq(syncedAlarms.deviceId, deviceId));

  if (alarms.length === 0) return;

  // Insert all new alarms
  await db.insert(syncedAlarms).values(
    alarms.map((a) => ({
      deviceId,
      alarmId: a.alarmId,
      time: a.time,
      description: a.description,
      enabled: a.enabled,
      repeat: a.repeat,
      customDays: a.customDays ?? [],
    }))
  );
}

// --- Device Heartbeat ---------------------------------------------------------

export async function recordHeartbeat(deviceId: string, appVersion?: string): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db
    .insert(deviceHeartbeat)
    .values({ deviceId, lastSeenAt: new Date(), appVersion: appVersion ?? null })
    .onDuplicateKeyUpdate({
      set: { lastSeenAt: new Date(), appVersion: appVersion ?? null },
    });
}

export async function getLastHeartbeat(deviceId: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(deviceHeartbeat)
    .where(eq(deviceHeartbeat.deviceId, deviceId))
    .limit(1);
  return rows[0] ?? null;
}

/** Returns all devices that haven't sent a heartbeat in the last `thresholdMinutes` minutes */
export async function getInactiveDevices(thresholdMinutes: number) {
  const db = await getDb();
  // Fail-closed: a DB outage must NOT look like "0 inactive devices, all good"
  // — that would silently disarm the dead man's switch. Throw so the job's
  // catch records the failure and /api/health turns unhealthy.
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  const cutoff = new Date(Date.now() - thresholdMinutes * 60 * 1000);
  return db
    .select()
    .from(deviceHeartbeat)
    .where(lte(deviceHeartbeat.lastSeenAt, cutoff));
}

// --- Alarm Events -------------------------------------------------------------

export async function createAlarmEvent(data: InsertAlarmEvent): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  // Idempotency: return existing row if (deviceId, alarmId, scheduledAt) already exists.
  // Prevents duplicate pending events when createEvent is called multiple times
  // (e.g., startup effect + respond-and-recreate on the same deadline).
  const existing = await db
    .select({ id: alarmEvents.id })
    .from(alarmEvents)
    .where(
      and(
        eq(alarmEvents.deviceId, data.deviceId),
        eq(alarmEvents.alarmId, data.alarmId),
        eq(alarmEvents.scheduledAt, data.scheduledAt as Date)
      )
    )
    .limit(1);
  if (existing.length > 0) return existing[0].id;

  const result = await db.insert(alarmEvents).values(data);
  return (result as any).insertId as number;
}

export async function updateAlarmEventStatus(
  id: number,
  status: "responded" | "missed" | "not_sent"
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(alarmEvents)
    .set({ status, resolvedAt: new Date() })
    .where(eq(alarmEvents.id, id));
}

export async function updateAlarmEventStatusByAlarmId(
  deviceId: string,
  alarmId: string,
  scheduledAt: Date,
  status: "responded" | "missed" | "not_sent"
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  // Resolve the pending event whose scheduledAt is closest to the reference
  // time (clients send "now"). With check-in this picks today's event over
  // tomorrow's; the old query had no ORDER BY and could resolve an arbitrary
  // pending event — marking tomorrow's check-in done and suppressing its alert.
  const pending = await db
    .select()
    .from(alarmEvents)
    .where(
      and(
        eq(alarmEvents.deviceId, deviceId),
        eq(alarmEvents.alarmId, alarmId),
        eq(alarmEvents.status, "pending")
      )
    );

  const target = pickPendingEvent(pending, scheduledAt);
  if (!target) return;

  // When the client confirms a missed event it has already escalated client-side.
  // Set warningSent=true so Step 3 of the monitoring job doesn't double-escalate.
  const warningSent = status === "missed";

  await db
    .update(alarmEvents)
    .set({ status, resolvedAt: new Date(), warningSent })
    .where(eq(alarmEvents.id, target.id));
}

/**
 * Returns all pending alarm events whose scheduledAt is older than `gracePeriodMinutes`.
 * These are alarms that fired but the device never confirmed.
 */
export async function getExpiredPendingEvents(gracePeriodMinutes: number) {
  const db = await getDb();
  if (!db) return [];
  const cutoff = new Date(Date.now() - gracePeriodMinutes * 60 * 1000);
  return db
    .select()
    .from(alarmEvents)
    .where(
      and(
        eq(alarmEvents.status, "pending"),
        lte(alarmEvents.scheduledAt, cutoff)
      )
    );
}

/**
 * Returns check-in alarm events that were missed (status = 'missed' | 'not_sent')
 * and haven't had a server-side warning sent yet (warningSent = false).
 * Scoped to a single alarmId (e.g. 'checkin-daily') to avoid escalating
 * every missed medication alarm via the server cascade.
 * lookbackHours caps how far back we search to avoid re-escalating stale events.
 */
export async function getMissedCheckinEvents(alarmId: string, lookbackHours: number) {
  const db = await getDb();
  if (!db) return [];
  const cutoff = new Date(Date.now() - lookbackHours * 60 * 60 * 1000);
  return db
    .select()
    .from(alarmEvents)
    .where(
      and(
        eq(alarmEvents.alarmId, alarmId),
        inArray(alarmEvents.status, ["missed", "not_sent"]),
        eq(alarmEvents.warningSent, false),
        gte(alarmEvents.scheduledAt, cutoff)
      )
    );
}

export async function markEventWarningSent(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(alarmEvents)
    .set({ warningSent: true })
    .where(eq(alarmEvents.id, id));
}

export async function getAlarmEventHistory(deviceId: string, limit = 50) {
  const db = await getDb();
  if (!db) return [];
  // Mais recentes primeiro: com ASC + limit, eventos antigos monopolizavam a
  // janela e os disparos novos nunca apareciam no histórico do app.
  return db
    .select()
    .from(alarmEvents)
    .where(eq(alarmEvents.deviceId, deviceId))
    .orderBy(desc(alarmEvents.scheduledAt))
    .limit(limit);
}

// --- Warning Log --------------------------------------------------------------

/**
 * Inserts a placeholder warning row before the send loop begins.
 * Returns the inserted row ID, or null if DB is unavailable.
 * Callers must call updateWarningResult() after sending to fill in actual counts.
 * Claiming before sending closes the TOCTOU race: a concurrent run that reads
 * warningHistory after this insert will see the row and skip its own send.
 */
export async function claimWarning(data: {
  deviceId: string;
  level: number;
  offlineHours: number;
  locationIncluded: boolean;
}): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db
    .insert(warningLog)
    .values({ ...data, contactsReached: 0, sentAt: new Date() });
  return (result as any).insertId as number;
}

export async function updateWarningResult(
  id: number,
  contactsReached: number,
  locationIncluded: boolean
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(warningLog)
    .set({ contactsReached, locationIncluded })
    .where(eq(warningLog.id, id));
}

/**
 * Delete a warning_log row. Used to release a claim that reached NOBODY, so the
 * next job run retries the alert in ~5 min instead of letting the failed
 * attempt occupy the dedup slot for MIN_WARNING_INTERVAL_HOURS.
 */
export async function releaseWarning(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(warningLog).where(eq(warningLog.id, id));
}

export async function getWarningHistory(deviceId: string, limit = 20) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(warningLog)
    .where(eq(warningLog.deviceId, deviceId))
    .orderBy(warningLog.sentAt)
    .limit(limit);
}

// --- Data retention / purge --------------------------------------------------
// LGPD minimization (Art. 6, III / Art. 15-16): behavioral and location data
// must not be kept indefinitely. Conservative defaults, tunable via env without
// a redeploy. Location (most sensitive) is dropped sooner than alarm history.

function retentionDays(envKey: string, fallback: number): number {
  const raw = process.env[envKey];
  if (raw) {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return fallback;
}

/**
 * Delete behavioral/location data older than the retention window. Idempotent
 * and safe to run on a daily cadence. Returns affected-row counts for logging.
 */
export async function purgeStaleData(now: number = Date.now()): Promise<{
  alarmEvents: number;
  warningLog: number;
  locationsCleared: number;
}> {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");

  const dayMs = 24 * 60 * 60 * 1000;
  const eventsCutoff = new Date(now - retentionDays("RETENTION_EVENTS_DAYS", 180) * dayMs);
  const locationCutoff = new Date(now - retentionDays("RETENTION_LOCATION_DAYS", 30) * dayMs);

  const affected = (r: unknown): number =>
    (r as Array<{ affectedRows?: number }>)?.[0]?.affectedRows ?? 0;

  const ev = await db.delete(alarmEvents).where(lt(alarmEvents.createdAt, eventsCutoff));
  const wl = await db.delete(warningLog).where(lt(warningLog.sentAt, eventsCutoff));
  // Stale GPS: blank the location fields rather than deleting the device row.
  const loc = await db
    .update(appUsers)
    .set({ lastLocation: null, lastLocationAt: null })
    .where(lt(appUsers.lastLocationAt, locationCutoff));

  return {
    alarmEvents: affected(ev),
    warningLog: affected(wl),
    locationsCleared: affected(loc),
  };
}
