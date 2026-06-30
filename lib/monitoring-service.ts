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
import { nextAlarmFireMs } from "./alarm-fire-times";
import * as Auth from "./_core/auth";

const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// --- Low-level fetch helper with retry --------------------------------------

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 2000;
const FETCH_TIMEOUT_MS = 15000;

/** Fetch with timeout to avoid hanging on slow/dead connections */
async function fetchWithTimeout(
  url: string,
  options?: RequestInit
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Wait ms milliseconds */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Parse superjson tRPC response: {result: {data: {json: {...}}}} */
function parseSuperjsonResponse(data: any): any {
  const resultData = data?.result?.data;
  return resultData?.json ?? resultData ?? null;
}

/**
 * Build request headers with optional Bearer token for native auth.
 * Web platform uses cookie-based auth (credentials: include).
 * Returns null when on native + no session token: caller must abort.
 */
async function buildAuthHeaders(): Promise<Record<string, string> | null> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (Platform.OS !== "web") {
    const token = await Auth.getSessionToken();
    if (!token) return null; // not authenticated yet — skip
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

async function trpcMutation(
  procedure: string,
  input: unknown
): Promise<any> {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}/api/trpc/${procedure}`;

  const headers = await buildAuthHeaders();
  if (!headers) {
    console.log(`[Monitoring] POST ${procedure} skipped: no auth session`);
    return null;
  }

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        console.log(
          `[Monitoring] POST ${procedure} retry ${attempt}/${MAX_RETRIES}`
        );
        await delay(RETRY_DELAY_MS * attempt);
      } else {
        console.log(`[Monitoring] POST ${procedure} -> ${url}`);
      }
      const res = await fetchWithTimeout(url, {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify({ json: input }),
      });
      console.log(`[Monitoring] POST ${procedure} status: ${res.status}`);
      if (!res.ok) {
        const errText = await res.text().catch(() => "(no body)");
        console.warn(
          `[Monitoring] POST ${procedure} failed: ${res.status} ${errText}`
        );
        // Retry on 5xx server errors or network-like errors
        if (res.status >= 500 && attempt < MAX_RETRIES) continue;
        return null;
      }
      const data = await res.json();
      return parseSuperjsonResponse(data);
    } catch (err: any) {
      const msg = err?.name === "AbortError" ? "timeout" : err?.message ?? String(err);
      console.error(
        `[Monitoring] POST ${procedure} error (attempt ${attempt + 1}):`,
        msg
      );
      if (attempt >= MAX_RETRIES) return null;
    }
  }
  return null;
}

async function trpcQuery(
  procedure: string,
  input: unknown
): Promise<any> {
  const baseUrl = getApiBaseUrl();
  const params = encodeURIComponent(JSON.stringify({ json: input }));
  const url = `${baseUrl}/api/trpc/${procedure}?input=${params}`;

  const headers = await buildAuthHeaders();
  if (!headers) {
    console.log(`[Monitoring] GET ${procedure} skipped: no auth session`);
    return null;
  }

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        console.log(
          `[Monitoring] GET ${procedure} retry ${attempt}/${MAX_RETRIES}`
        );
        await delay(RETRY_DELAY_MS * attempt);
      } else {
        console.log(
          `[Monitoring] GET ${procedure} -> ${url.substring(0, 120)}...`
        );
      }
      const res = await fetchWithTimeout(url, { headers, credentials: "include" });
      console.log(`[Monitoring] GET ${procedure} status: ${res.status}`);
      if (!res.ok) {
        const errText = await res.text().catch(() => "(no body)");
        console.warn(
          `[Monitoring] GET ${procedure} failed: ${res.status} ${errText}`
        );
        if (res.status >= 500 && attempt < MAX_RETRIES) continue;
        return null;
      }
      const data = await res.json();
      return parseSuperjsonResponse(data);
    } catch (err: any) {
      const msg = err?.name === "AbortError" ? "timeout" : err?.message ?? String(err);
      console.error(
        `[Monitoring] GET ${procedure} error (attempt ${attempt + 1}):`,
        msg
      );
      if (attempt >= MAX_RETRIES) return null;
    }
  }
  return null;
}

// --- Device Registration ------------------------------------------------------

export async function registerDevice(options: {
  userName?: string;
  emergencyContacts?: Array<{
    id: string;
    name: string;
    phone: string;
    relation: string;
    whatsapp: boolean;
    /** Optional email for fallback notifications */
    email?: string;
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

// --- Heartbeat ----------------------------------------------------------------

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

export function startHeartbeat(
  getLocation?: () => Promise<string | undefined>
): void {
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

// --- Alarm Sync ---------------------------------------------------------------

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

  // Pré-registra o PRÓXIMO disparo esperado de cada alarme como evento pendente.
  // Assim o servidor sabe que o alarme era esperado mesmo se ele NÃO tocar (Doze/
  // app morto) — e o dead man's switch escala e o histórico não fica vazio.
  // Idempotente no servidor por (deviceId, alarmId, scheduledAt) canônico.
  for (const a of alarms) {
    if (!a.enabled) continue;
    const fireMs = nextAlarmFireMs(a);
    if (fireMs != null) {
      await createPendingAlarmEvent(a, new Date(fireMs)).catch(() => {});
    }
  }
}

// --- Alarm Events -------------------------------------------------------------

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
  const result = await trpcQuery("monitoring.getHistory", {
    deviceId,
    limit,
  });
  return result?.events ?? [];
}

/**
 * Get warning log from server.
 */
export async function getWarningLog(limit = 20): Promise<any[]> {
  const deviceId = await getDeviceId();
  const result = await trpcQuery("monitoring.getWarnings", {
    deviceId,
    limit,
  });
  return result?.warnings ?? [];
}

/**
 * Get monitoring status summary for the settings panel.
 */
export async function getMonitoringStatus(): Promise<{
  lastCheckIn: string | null;
  syncedAlarmCount: number;
  enabledAlarmCount: number;
  recentEvents: {
    respondedCount: number;
    missedCount: number;
    notSentCount: number;
  };
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
 *
 * Para evitar o falso "Alarmes Perdidos" em toda abertura do app:
 *  - só conta eventos das últimas 48h (eventos antigos não são novidade);
 *  - ignora o check-in diário ('checkin-daily'), que tem fluxo/escalação
 *    próprios e pode deixar eventos pendentes órfãos no servidor;
 *  - lembra (AsyncStorage) o evento mais recente já exibido, para que o
 *    mesmo aviso não reapareça em aberturas seguintes.
 */
const OFFLINE_ALARMS_SEEN_KEY = "vigora_offline_alarms_seen_until";
const OFFLINE_ALARMS_WINDOW_MS = 48 * 60 * 60 * 1000;
const CHECKIN_ALARM_ID = "checkin-daily";

export async function checkOfflineAlarms(
  alarms: Alarm[]
): Promise<{
  notSentCount: number;
  missedCount: number;
}> {
  const history = await getAlarmHistory(200);

  const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
  const seenUntilRaw = await AsyncStorage.getItem(OFFLINE_ALARMS_SEEN_KEY).catch(() => null);
  const seenUntil = seenUntilRaw ? Number(seenUntilRaw) : 0;
  const windowStart = Date.now() - OFFLINE_ALARMS_WINDOW_MS;

  const isRelevant = (e: any): boolean => {
    if (e.alarmId === CHECKIN_ALARM_ID) return false;
    const ts = new Date(e.scheduledAt ?? e.createdAt ?? 0).getTime();
    if (!Number.isFinite(ts) || ts <= 0) return false;
    return ts > windowStart && ts > seenUntil;
  };

  const relevant = history.filter(isRelevant);
  const notSent = relevant.filter((e) => e.status === "not_sent");
  const missed = relevant.filter((e) => e.status === "missed");

  // Marca os eventos atuais como vistos para não repetir o aviso amanhã.
  const newestTs = relevant.reduce((max, e) => {
    const ts = new Date(e.scheduledAt ?? e.createdAt ?? 0).getTime();
    return Number.isFinite(ts) && ts > max ? ts : max;
  }, seenUntil);
  if (newestTs > seenUntil) {
    await AsyncStorage.setItem(OFFLINE_ALARMS_SEEN_KEY, String(newestTs)).catch(() => {});
  }

  return { notSentCount: notSent.length, missedCount: missed.length };
}
