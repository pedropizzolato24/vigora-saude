/**
 * monitoring-service.ts
 *
 * Client-side service that communicates with the server monitoring system.
 *
 * Responsibilities:
 * 1. Send heartbeat every 5 minutes while app is active (liveness da CONTA —
 *    o servidor chaveia tudo por openId; o deviceId vai só como metadado)
 * 2. Create pending alarm events before each alarm fires
 * 3. Confirm alarm events (responded / missed / not_sent)
 * 4. Detect "not_sent" alarms when device comes back online
 */
import { AppState, AppStateStatus, Platform } from "react-native";
import { isIgnoringBatteryOptimizations } from "expo-alarm-countdown";
import { getDeviceId } from "./device-id";
import { getApiBaseUrl } from "@/constants/oauth";
import { Alarm } from "./app-context";
import { nextAlarmFireMs } from "./alarm-fire-times";
import * as Auth from "./_core/auth";
import {
  enqueueConfirmation,
  dequeueConfirmation,
  listPendingConfirmations,
  type ConfirmationStatus,
} from "./pending-confirmations";

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
      if (Auth.isSessionExpiredStatus(res.status)) {
        // Sessão expirou (401): não adianta re-tentar. Limpa e manda relogar —
        // antes isso ficava mudo e o dead man's switch seguia desarmado.
        // 403 (device de outro usuário ao trocar de conta) NÃO desloga — cai no
        // tratamento de !res.ok abaixo e falha em silêncio. Ver isSessionExpiredStatus.
        await Auth.handleUnauthorized();
        return null;
      }
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
      if (Auth.isSessionExpiredStatus(res.status)) {
        // Só 401 desloga; 403 (posse de device) falha em silêncio. Ver POST acima.
        await Auth.handleUnauthorized();
        return null;
      }
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

// --- Heartbeat ----------------------------------------------------------------

let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let appStateSubscription: { remove: () => void } | null = null;

async function sendHeartbeat(location?: string): Promise<void> {
  // deviceId é só metadado de liveness (lastDeviceId) — nunca chave de posse.
  const deviceId = await getDeviceId();
  // Telemetria: reporta a isenção de bateria (Android). undefined fora do
  // Android → JSON.stringify descarta a chave e o servidor preserva o valor.
  const batteryExempt =
    Platform.OS === "android" ? await isIgnoringBatteryOptimizations() : undefined;
  await trpcMutation("monitoring.heartbeat", {
    lastDeviceId: deviceId,
    appVersion: "1.0.0",
    lastLocation: location,
    batteryExempt,
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
  // A agenda autoritativa por conta já sobe via cloud backup (userData.put);
  // a antiga monitoring.syncAlarms (tabela synced_alarms) foi eliminada.
  // O que o dead man's switch precisa é do EVENTO esperado:
  // pré-registra o PRÓXIMO disparo de cada alarme como evento pendente.
  // Assim o servidor sabe que o alarme era esperado mesmo se ele NÃO tocar
  // (Doze/app morto) — e o switch escala e o histórico não fica vazio.
  // Idempotente no servidor por (openId, alarmId, scheduledAt) canônico.
  for (const a of alarms) {
    if (!a.enabled) continue;
    const fireMs = nextAlarmFireMs(a);
    if (fireMs != null) {
      await createPendingAlarmEvent(a, new Date(fireMs)).catch(() => {});
    }
  }
  console.log(`[Monitoring] Pre-registered next fire for enabled alarms`);
}

// --- Alarm Events -------------------------------------------------------------

/**
 * Nome IANA do fuso do aparelho (ex.: "America/Rio_Branco"). Em ROM enxuta sem
 * dados de ICU o Intl pode não resolver o fuso — devolve null e o servidor cai
 * no fallback de Brasília em vez de gravar um valor inventado.
 */
function deviceTimezone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch (error) {
    console.warn('[Monitoring] fuso do aparelho indisponível:', error);
    return null;
  }
}

/**
 * Create a pending alarm event on the server.
 * Call this when an alarm is about to fire (e.g., in alarm-notification-handler).
 */
export async function createPendingAlarmEvent(
  alarm: Alarm,
  scheduledAt: Date
): Promise<void> {
  await trpcMutation("monitoring.createEvent", {
    alarmId: alarm.id,
    alarmDescription: alarm.description || alarm.time,
    scheduledAt: scheduledAt.toISOString(),
    // Fuso do aparelho: o servidor usa isso para mostrar ao cuidador o mesmo
    // horário que o idoso viu na tela. O Brasil tem quatro fusos — sem isso o
    // Acre recebia "23:00" para um alarme das 21:00.
    timezone: deviceTimezone(),
  });
  console.log(`[Monitoring] Created pending event for alarm ${alarm.id}`);
}

/**
 * Envia uma confirmação e só tira da fila local se o servidor aceitou.
 *
 * `trpcMutation` devolve `null` em TODA falha (sem sessão, 4xx, 5xx, timeout)
 * sem nunca lançar — por isso a decisão é pelo retorno, não por try/catch. O
 * que não sair fica na fila e é reenviado por flushPendingConfirmations.
 */
async function sendConfirmation(
  alarmId: string,
  scheduledAtIso: string,
  status: ConfirmationStatus
): Promise<void> {
  await enqueueConfirmation({ alarmId, scheduledAtIso, status });
  const result = await trpcMutation("monitoring.confirmEvent", {
    alarmId,
    scheduledAt: scheduledAtIso,
    status,
  });
  if (result === null) {
    console.warn(`[Monitoring] Confirmação de ${alarmId} não chegou — fica na fila`);
    return;
  }
  await dequeueConfirmation(alarmId, scheduledAtIso);
  console.log(`[Monitoring] Alarm ${alarmId} confirmed as ${status}`);
}

/**
 * Reenvia as confirmações que não chegaram ao servidor. Chamada no bootstrap
 * autenticado do MonitoringInitializer: é a rede de segurança para o idoso que
 * respondeu o alarme com a rede caída (ou com o app morrendo logo em seguida)
 * e cuja família seria avisada de um alarme perdido que não existiu.
 */
export async function flushPendingConfirmations(): Promise<void> {
  const pending = await listPendingConfirmations();
  if (pending.length === 0) return;
  console.log(`[Monitoring] Reenviando ${pending.length} confirmação(ões) pendente(s)`);
  for (const entry of pending) {
    const result = await trpcMutation("monitoring.confirmEvent", {
      alarmId: entry.alarmId,
      scheduledAt: entry.scheduledAtIso,
      status: entry.status,
    });
    if (result === null) continue; // próximo boot tenta de novo
    await dequeueConfirmation(entry.alarmId, entry.scheduledAtIso);
  }
}

/**
 * Confirm an alarm event as responded.
 * Call this when the user dismisses or snoozes the alarm.
 */
export async function confirmAlarmResponded(
  alarm: Alarm,
  scheduledAt: Date
): Promise<void> {
  await sendConfirmation(alarm.id, scheduledAt.toISOString(), "responded");
}

/**
 * Confirm an alarm event as missed (user didn't respond within timeout).
 * Call this when the alarm-ring countdown reaches 0 without user interaction.
 */
export async function confirmAlarmMissed(
  alarm: Alarm,
  scheduledAt: Date
): Promise<void> {
  await sendConfirmation(alarm.id, scheduledAt.toISOString(), "missed");
}

/**
 * Get alarm event history from server.
 */
export async function getAlarmHistory(limit = 50): Promise<any[]> {
  const result = await trpcQuery("monitoring.getHistory", { limit });
  return result?.events ?? [];
}

/**
 * Get warning log from server.
 */
export async function getWarningLog(limit = 20): Promise<any[]> {
  const result = await trpcQuery("monitoring.getWarnings", { limit });
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
  const result = await trpcQuery("monitoring.getStatus", {});
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
