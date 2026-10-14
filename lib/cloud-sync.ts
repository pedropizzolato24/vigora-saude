/**
 * cloud-sync.ts
 *
 * Per-account backup of the app state to the server, keyed by the user's
 * Google account (openId, resolved server-side from the session). Lets a user
 * reinstall the app and recover their anamnesis, emergency contacts, alarms,
 * settings and health metrics by logging back in.
 *
 * Conflict resolution is last-write-wins via `dataUpdatedAt` (epoch ms of the
 * last local data change), compared by AppContext when reconciling on login.
 *
 * Talks to the `userData` tRPC router over plain HTTP (same approach as
 * monitoring-service) so it can run imperatively from AppContext without React
 * Query hooks. Calls no-op when there's no auth session yet.
 */
import { Platform } from "react-native";
import { getApiBaseUrl } from "@/constants/oauth";
import * as Auth from "./_core/auth";
import type {
  Alarm,
  AnamnesesData,
  AppSettings,
  EmergencyContact,
  HealthMetric,
  UserProfile,
} from "./app-context";

const FETCH_TIMEOUT_MS = 15000;

export interface CloudSnapshot {
  anamnesis: AnamnesesData | null;
  emergencyContacts: EmergencyContact[];
  alarms: Alarm[];
  settings: AppSettings | null;
  healthMetrics: HealthMetric[];
  profile: UserProfile | null;
  dataUpdatedAt: number;
}

async function fetchWithTimeout(url: string, options?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fuso IANA do aparelho (ex.: "America/Rio_Branco"). O servidor guarda para
 * calcular os horários dos alarmes desta conta. Em ROM enxuta sem dados de ICU o
 * Intl pode não resolver: a chave simplesmente não vai e o servidor mantém o que
 * já tinha (ou cai em Brasília).
 */
function deviceTimezone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch (err) {
    console.warn("[CloudSync] fuso do aparelho indisponível:", err instanceof Error ? err.name : typeof err);
    return null;
  }
}

/** Bearer header on native; cookie auth on web. Returns null when unauthenticated. */
async function buildAuthHeaders(): Promise<Record<string, string> | null> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (Platform.OS !== "web") {
    const token = await Auth.getSessionToken();
    if (!token) return null;
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

/** Parse superjson tRPC response: {result: {data: {json: {...}}}} */
function parseSuperjsonResponse(data: any): any {
  const resultData = data?.result?.data;
  return resultData?.json ?? resultData ?? null;
}

/**
 * Fetch the stored snapshot for the logged-in user. Returns null when there's
 * no session, no stored row, or the request fails — callers treat null as
 * "nothing to restore".
 */
export async function pullCloudData(): Promise<CloudSnapshot | null> {
  const headers = await buildAuthHeaders();
  if (!headers) return null;

  const baseUrl = getApiBaseUrl();
  const params = encodeURIComponent(JSON.stringify({ json: null }));
  const url = `${baseUrl}/api/trpc/userData.get?input=${params}`;

  try {
    const res = await fetchWithTimeout(url, { headers, credentials: "include" });
    if (!res.ok) {
      console.warn("[CloudSync] pull failed:", res.status);
      return null;
    }
    const data = await res.json();
    const parsed = parseSuperjsonResponse(data);
    if (!parsed) return null;
    return {
      anamnesis: (parsed.anamnesis ?? null) as AnamnesesData | null,
      emergencyContacts: (parsed.emergencyContacts ?? []) as EmergencyContact[],
      alarms: (parsed.alarms ?? []) as Alarm[],
      settings: (parsed.settings ?? null) as AppSettings | null,
      healthMetrics: (parsed.healthMetrics ?? []) as HealthMetric[],
      profile: (parsed.profile ?? null) as UserProfile | null,
      dataUpdatedAt: typeof parsed.dataUpdatedAt === "number" ? parsed.dataUpdatedAt : 0,
    };
  } catch (err: any) {
    const msg = err?.name === "AbortError" ? "timeout" : err?.message ?? String(err);
    console.warn("[CloudSync] pull error:", msg);
    return null;
  }
}

/**
 * Push a snapshot to the server. No-ops when unauthenticated. Best-effort:
 * failures are logged and swallowed (the local AsyncStorage copy is the source
 * of truth until the next successful sync).
 */
/**
 * Trava os envios durante o logout. O userData.put conta como sinal de vida do
 * aparelho no servidor: um backup debounced (3 s) que saísse depois do
 * deviceSignedOut desfaria a pausa "saiu da conta". Ligada pelo logout
 * (hooks/use-auth.ts) e desligada quando a conta já foi descartada.
 */
let pushBlocked = false;

export function setCloudPushBlocked(blocked: boolean): void {
  pushBlocked = blocked;
}

export function isCloudPushBlocked(): boolean {
  return pushBlocked;
}

export async function pushCloudData(snapshot: CloudSnapshot): Promise<boolean> {
  if (pushBlocked) {
    console.warn("[CloudSync] push adiado: logout em andamento");
    return false;
  }
  const headers = await buildAuthHeaders();
  if (!headers) return false;

  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}/api/trpc/userData.put`;
  const timezone = deviceTimezone();

  try {
    const res = await fetchWithTimeout(url, {
      method: "POST",
      headers,
      credentials: "include",
      body: JSON.stringify({ json: timezone ? { ...snapshot, timezone } : snapshot }),
    });
    if (!res.ok) {
      console.warn("[CloudSync] push failed:", res.status);
      return false;
    }
    return true;
  } catch (err: any) {
    const msg = err?.name === "AbortError" ? "timeout" : err?.message ?? String(err);
    console.warn("[CloudSync] push error:", msg);
    return false;
  }
}
