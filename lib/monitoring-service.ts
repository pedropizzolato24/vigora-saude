/**
 * monitoring-service.ts
 *
 * Client-side service that communicates with the server monitoring system.
 *
 * Responsibilities:
 * 1. Register device on first launch
 * 2. Send heartbeat every 5 minutes while app is active
 * 3. Sync alarm list whenever it changes
 * 4. Create pending alarm events before each alarm fires
 * 5. Confirm alarm events (responded / missed / not_sent)
 * 6. Detect "not_sent" alarms when device comes back online
 */
import { AppState, AppStateStatus, Platform } from "react-native";
import { getDeviceId } from "./device-id";
import { getApiBaseUrl } from "@/constants/oauth";
import { Alarm } from "./app-context";

const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// ─── Low-level fetch helper ───────────────────────────────────────────────────

async function trpcMutation(procedure: string, input: unknown): Promise<any> {
  try {
    const url = `${getApiBaseUrl()}/api/trpc/${procedure}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ json: input }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return (data as any)?.result?.data ?? null;
  } catch {
    return null;
  }
}

async function trpcQuery(procedure: string, input: unknown): Promise<any> {
  try {
    const params = encodeURIComponent(JSON.stringify({ json: input }));
    const url = `${getApiBaseUrl()}/api/trpc/${procedure}?input=${params}`;
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) return null;
    const data = await res.json();
    return (data as any)?.result?.data ?? null;
  } catch {
    return null;
  }
}

// ─── Device Registration ──────────────────────────────────────────────────────

export async function registerDevice(options: {
  userName?: string;
  emergencyContacts?: Array<{
    id: string;
    name: string;
    phone: string;
    relation: string;
    whatsapp: boolean;
  }>;
  lastLocation?: string;
}): Promise<void> {
  const deviceId = await getDeviceId();
  await trpcMutation("monitoring.register", {
    deviceId,
    userName: options.userName,
    emergencyContacts: options.emergencyContacts,
    lastLocation: options.lastLocation,
  });
  console.log("[Monitoring] Device registered:", deviceId);
}

// ─── Heartbeat ────────────────────────────────────────────────────────────────

let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let appStateSubscription: { remove: () => void } | null = null;

async function sendHeartbeat(location?: string): Promise<void> {
  const deviceId = await getDeviceId();
  await trpcMutation("monitoring.heartbeat", {
    deviceId,
    appVersion: "1.0.0",
    lastLocation: location,
  });
  console.log("[Monitoring] Heartbeat sent");
}

export function startHeartbeat(getLocation?: () => Promise<string | undefined>): void {
  if (heartbeatTimer) return; // Already running

  // Send immediately
  (async () => {
    const loc = getLocation ? await getLocation() : undefined;
    await sendHeartbeat(loc);
  })();

  // Then every 5 minutes
  heartbeatTimer = setInterval(async () => {
    const loc = getLocation ? await getLocation() : undefined;
    await sendHeartbeat(loc);
  }, HEARTBEAT_INTERVAL_MS);

  // Also send when app comes to foreground
  appStateSubscription = AppState.addEventListener(
    "change",
    async (state: AppStateStatus) => {
      if (state === "active") {
        const loc = getLocation ? await getLocation() : undefined;
        await sendHeartbeat(loc);
      }
    }
  );

  console.log("[Monitoring] Heartbeat service started");
}

export function stopHeartbeat(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  if (appStateSubscription) {
    appStateSubscription.remove();
    appStateSubscription = null;
  }
  console.log("[Monitoring] Heartbeat service stopped");
}

// ─── Alarm Sync ───────────────────────────────────────────────────────────────

export async function syncAlarmsToServer(alarms: Alarm[]): Promise<void> {
  const deviceId = await getDeviceId();
  const payload = alarms
    .filter((a) => a.enabled)
    .map((a) => ({
      alarmId: a.id,
      time: a.time,
      description: a.description,
      enabled: a.enabled,
      repeat: a.repeat,
      customDays: a.customDays,
    }));

  await trpcMutation("monitoring.syncAlarms", {
    deviceId,
    alarms: payload,
  });
  console.log(`[Monitoring] Synced ${payload.length} alarms to server`);
}

// ─── Alarm Events ─────────────────────────────────────────────────────────────

/**
 * Create a pending alarm event on the server.
 * Call this when an alarm is about to fire (e.g., in alarm-notification-handler).
 */
export async function createPendingAlarmEvent(
  alarm: Alarm,
  scheduledAt: Date
): Promise<void> {
  const deviceId = await getDeviceId();
  await trpcMutation("monitoring.createEvent", {
    deviceId,
    alarmId: alarm.id,
    alarmDescription: alarm.description || alarm.time,
    scheduledAt: scheduledAt.toISOString(),
  });
  console.log(`[Monitoring] Created pending event for alarm ${alarm.id}`);
}

/**
 * Confirm an alarm event as responded.
 * Call this when the user dismisses or snoozes the alarm.
 */
export async function confirmAlarmResponded(
  alarm: Alarm,
  scheduledAt: Date
): Promise<void> {
  const deviceId = await getDeviceId();
  await trpcMutation("monitoring.confirmEvent", {
    deviceId,
    alarmId: alarm.id,
    scheduledAt: scheduledAt.toISOString(),
    status: "responded",
  });
  console.log(`[Monitoring] Alarm ${alarm.id} confirmed as responded`);
}

/**
 * Confirm an alarm event as missed (user didn't respond within timeout).
 * Call this when the alarm-ring countdown reaches 0 without user interaction.
 */
export async function confirmAlarmMissed(
  alarm: Alarm,
  scheduledAt: Date
): Promise<void> {
  const deviceId = await getDeviceId();
  await trpcMutation("monitoring.confirmEvent", {
    deviceId,
    alarmId: alarm.id,
    scheduledAt: scheduledAt.toISOString(),
    status: "missed",
  });
  console.log(`[Monitoring] Alarm ${alarm.id} confirmed as missed`);
}

/**
 * Get alarm event history from server.
 */
export async function getAlarmHistory(limit = 50): Promise<any[]> {
  const deviceId = await getDeviceId();
  const result = await trpcQuery("monitoring.getHistory", { deviceId, limit });
  return result?.events ?? [];
}

/**
 * Get warning log from server.
 */
export async function getWarningLog(limit = 20): Promise<any[]> {
  const deviceId = await getDeviceId();
  const result = await trpcQuery("monitoring.getWarnings", { deviceId, limit });
  return result?.warnings ?? [];
}

/**
 * Get monitoring status summary for the settings panel.
 */
export async function getMonitoringStatus(): Promise<{
  lastCheckIn: string | null;
  syncedAlarmCount: number;
  enabledAlarmCount: number;
  recentEvents: { respondedCount: number; missedCount: number; notSentCount: number };
} | null> {
  const deviceId = await getDeviceId();
  const result = await trpcQuery("monitoring.getStatus", { deviceId });
  return result ?? null;
}

/**
 * Check for alarms that were missed while device was offline.
 * Call this on app startup to detect "not_sent" events retroactively.
 * The server handles this automatically via the monitoring job,
 * but this function updates the local UI state.
 */
export async function checkOfflineAlarms(alarms: Alarm[]): Promise<{
  notSentCount: number;
  missedCount: number;
}> {
  const history = await getAlarmHistory(100);
  const notSentCount = history.filter((e) => e.status === "not_sent").length;
  const missedCount = history.filter((e) => e.status === "missed").length;
  return { notSentCount, missedCount };
}
