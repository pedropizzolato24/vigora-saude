/**
 * db-monitoring.ts
 *
 * Database query helpers for the server-side alarm monitoring system.
 * Posse de dados é SEMPRE por conta (openId) — nunca por aparelho. O deviceId
 * sobrevive apenas como metadado de liveness (account_liveness.lastDeviceId).
 * Ver docs/design/2026-07-12-monitoring-account-ownership.md.
 *
 * Handles: account liveness (heartbeat), alarm events, warning log, retention.
 */
import { and, desc, eq, gte, inArray, lt, lte, ne } from "drizzle-orm";
import { getDb } from "./db";
import { pickPendingEvent } from "./_core/pick-pending-event";
import {
  accountLiveness,
  alarmEvents,
  InsertAlarmEvent,
  warningLog,
} from "../drizzle/schema";

// --- Account Liveness -----------------------------------------------------------

/**
 * Registra "a conta deu sinal agora" — de qualquer aparelho. lastDeviceId e
 * localização são metadados opcionais; a localização só é sobrescrita quando
 * um valor novo chega (senão o último fix conhecido é preservado).
 */
export async function recordHeartbeat(
  openId: string,
  meta?: {
    appVersion?: string;
    lastDeviceId?: string;
    lastLocation?: string;
    batteryExempt?: boolean;
  }
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const now = new Date();
  const locationFields = meta?.lastLocation
    ? { lastLocation: meta.lastLocation, lastLocationAt: now }
    : {};
  // Só grava quando o cliente informou (Android). undefined = sem info (iOS/
  // clientes antigos) → preserva o último valor conhecido em vez de zerá-lo.
  const batteryFields =
    meta?.batteryExempt === undefined ? {} : { batteryExempt: meta.batteryExempt };

  await db
    .insert(accountLiveness)
    .values({
      openId,
      lastSeenAt: now,
      appVersion: meta?.appVersion ?? null,
      lastDeviceId: meta?.lastDeviceId ?? null,
      ...locationFields,
      ...batteryFields,
    })
    .onDuplicateKeyUpdate({
      set: {
        lastSeenAt: now,
        appVersion: meta?.appVersion ?? null,
        lastDeviceId: meta?.lastDeviceId ?? null,
        ...locationFields,
        ...batteryFields,
      },
    });
}

/** Linha de liveness da conta (lastSeenAt, localização), ou null. */
export async function getAccountLiveness(openId: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(accountLiveness)
    .where(eq(accountLiveness.openId, openId))
    .limit(1);
  return rows[0] ?? null;
}

/** Returns all accounts whose last sign of life is older than `thresholdMinutes`. */
export async function getInactiveAccounts(thresholdMinutes: number) {
  const db = await getDb();
  // Fail-closed: a DB outage must NOT look like "0 inactive accounts, all good"
  // — that would silently disarm the dead man's switch. Throw so the job's
  // catch records the failure and /api/health turns unhealthy.
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  const cutoff = new Date(Date.now() - thresholdMinutes * 60 * 1000);
  return db
    .select()
    .from(accountLiveness)
    .where(lte(accountLiveness.lastSeenAt, cutoff));
}

// --- Alarm Events -------------------------------------------------------------

export async function createAlarmEvent(data: InsertAlarmEvent): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  // Idempotency: return existing row if (openId, alarmId, scheduledAt) already exists.
  // Prevents duplicate pending events when createEvent is called multiple times
  // (e.g., startup effect + respond-and-recreate on the same deadline).
  const existing = await db
    .select({ id: alarmEvents.id })
    .from(alarmEvents)
    .where(
      and(
        eq(alarmEvents.openId, data.openId),
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

/**
 * Aplica um novo status ao evento de alarme casado por (openId, alarmId,
 * scheduledAt). Retorna o evento efetivamente transicionado, ou `null` quando
 * nada foi atualizado (sem DB, ou nenhum candidato casou — ex.: retry após a
 * transição já ter ocorrido). O caller usa esse retorno para agir SÓ na
 * transição real e ficar idempotente (ver o push ao cuidador em confirmEvent).
 */
export async function updateAlarmEventStatusByAlarmId(
  openId: string,
  alarmId: string,
  scheduledAt: Date,
  status: "responded" | "missed" | "not_sent"
): Promise<{ id: number } | null> {
  const db = await getDb();
  if (!db) return null;

  // Janela máxima entre o evento e a referência (o scheduledAt canônico do
  // disparo). Impede que uma confirmação atrasada de HOJE consuma o evento
  // pré-registrado de AMANHÃ (~24h) quando o de hoje já foi resolvido.
  const MAX_MATCH_WINDOW_MS = 12 * 60 * 60 * 1000;

  // Candidatos: sempre os pendentes. Para uma resposta do usuário
  // ("responded"), também considera eventos JÁ resolvidos como not_sent/missed
  // — o servidor pode ter marcado "não enviado/perdido" prematuramente (app
  // fechado ou resposta após o grace period) e o usuário de fato respondeu.
  // Sem isso, a resposta real caía no evento pendente de amanhã e o de hoje
  // ficava eternamente "Não enviado".
  const statusesToConsider: ("pending" | "not_sent" | "missed")[] =
    status === "responded" ? ["pending", "not_sent", "missed"] : ["pending"];

  const candidates = await db
    .select()
    .from(alarmEvents)
    .where(
      and(
        eq(alarmEvents.openId, openId),
        eq(alarmEvents.alarmId, alarmId),
        inArray(alarmEvents.status, statusesToConsider)
      )
    );

  const target = pickPendingEvent(candidates, scheduledAt, MAX_MATCH_WINDOW_MS);
  if (!target) return null;

  // When the client confirms a missed event it has already escalated client-side.
  // Set warningSent=true so Step 3 of the monitoring job doesn't double-escalate.
  // (Ao virar "responded" o evento sai do filtro de missed, então não re-escala.)
  //
  // ⚠️ NOTA DE DESIGN — este UM booleano coordena exatamente DOIS caminhos de
  // escalação: (1) cliente vivo (aqui + push ao cuidador em confirmEvent) e
  // (2) backstop do servidor (Passo 4 do monitoring-job, que só pega
  // warningSent=false). Enquanto forem só esses dois, o flag único basta para
  // não duplicar. Se um TERCEIRO caminho/canal for adicionado, o flag único
  // deixa de ser suficiente — será preciso trocar por flags por-canal
  // (ex.: whatsappSent / caregiverPushed) aqui, no Passo 4 e em confirmEvent.
  const warningSent = status === "missed";

  // Claim atômica: condiciona o UPDATE ao CONJUNTO de status aceito na seleção
  // (statusesToConsider), não ao valor exato lido. Duas chamadas concorrentes
  // (ex.: retry + original de confirmEvent) podem selecionar o mesmo candidato
  // pendente antes de qualquer commit; sem o guard, as duas "transicionariam" e
  // o caller mandaria push duplicado ao cuidador — só a que vence a corrida
  // afeta a linha (affectedRows>0). Mesmo padrão de consumeInviteByCode
  // (db-links.ts). Usar o CONJUNTO (em vez de eq ao status exato lido) importa
  // para "responded": ele existe para corrigir um not_sent/missed que o job
  // marcou prematuramente — exigir o valor exato quebraria essa correção se o
  // job virar o status entre o SELECT e este UPDATE (ex.: pending->missed no
  // limite do grace period), descartando uma resposta real do usuário. Para
  // "missed"/"not_sent" o conjunto é só ['pending'], então o efeito é idêntico
  // ao guard exato — a proteção contra push duplicado permanece intacta.
  const res = await db
    .update(alarmEvents)
    .set({ status, resolvedAt: new Date(), warningSent })
    .where(
      and(eq(alarmEvents.id, target.id), inArray(alarmEvents.status, statusesToConsider))
    );

  const affected =
    (res as { affectedRows?: number }).affectedRows ??
    (res as Array<{ affectedRows?: number }>)[0]?.affectedRows ??
    0;
  return affected > 0 ? { id: target.id } : null;
}

/**
 * Returns all pending alarm events whose scheduledAt is older than `gracePeriodMinutes`.
 * These are alarms that fired but the account never confirmed.
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

/**
 * Eventos de alarme de MEDICAÇÃO (não check-in) que ficaram "missed" — ou seja,
 * a conta estava ONLINE no horário (Passo 1 marca "missed" só se online) e
 * o usuário não respondeu — e ainda não foram escalados pelo servidor
 * (warningSent=false). Backstop do dead man's switch para quando a escalação no
 * cliente não completou (app morreu após o disparo). 'not_sent' (offline) NÃO
 * entra aqui — esse caso é coberto pelo aviso de conta offline (Passo 2).
 */
export async function getMissedMedicationEvents(checkinAlarmId: string, lookbackHours: number) {
  const db = await getDb();
  if (!db) return [];
  const cutoff = new Date(Date.now() - lookbackHours * 60 * 60 * 1000);
  return db
    .select()
    .from(alarmEvents)
    .where(
      and(
        ne(alarmEvents.alarmId, checkinAlarmId),
        eq(alarmEvents.status, "missed"),
        eq(alarmEvents.warningSent, false),
        gte(alarmEvents.scheduledAt, cutoff)
      )
    );
}

/**
 * True se a conta tem algum evento esperado que expirou SEM confirmação
 * ('missed' | 'not_sent') dentro da janela de look-back. Gate do Passo 2 do
 * monitoring-job: inatividade sozinha (logout, desinstalação, app em segundo
 * plano) não é sinal de perigo — só escala havendo evento não confirmado.
 * Fail-closed como getInactiveAccounts: sem DB, lança em vez de responder
 * "false" e silenciar o switch.
 */
export async function hasUnconfirmedEvents(
  openId: string,
  lookbackHours: number
): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  const cutoff = new Date(Date.now() - lookbackHours * 60 * 60 * 1000);
  const rows = await db
    .select({ id: alarmEvents.id })
    .from(alarmEvents)
    .where(
      and(
        eq(alarmEvents.openId, openId),
        inArray(alarmEvents.status, ["missed", "not_sent"]),
        gte(alarmEvents.scheduledAt, cutoff)
      )
    )
    .limit(1);
  return rows.length > 0;
}

export async function markEventWarningSent(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(alarmEvents)
    .set({ warningSent: true })
    .where(eq(alarmEvents.id, id));
}

export async function getAlarmEventHistory(openId: string, limit = 50) {
  const db = await getDb();
  if (!db) return [];
  // Mais recentes primeiro: com ASC + limit, eventos antigos monopolizavam a
  // janela e os disparos novos nunca apareciam no histórico do app.
  return db
    .select()
    .from(alarmEvents)
    .where(eq(alarmEvents.openId, openId))
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
  openId: string;
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

export async function getWarningHistory(openId: string, limit = 20) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(warningLog)
    .where(eq(warningLog.openId, openId))
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
  // Stale GPS: blank the location fields rather than deleting the liveness row.
  const loc = await db
    .update(accountLiveness)
    .set({ lastLocation: null, lastLocationAt: null })
    .where(lt(accountLiveness.lastLocationAt, locationCutoff));

  return {
    alarmEvents: affected(ev),
    warningLog: affected(wl),
    locationsCleared: affected(loc),
  };
}
