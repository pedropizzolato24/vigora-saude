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
import { and, desc, eq, gt, gte, inArray, isNull, lt, lte, ne, or } from "drizzle-orm";
import { getDb } from "./db";
import { pickPendingEvent } from "./_core/pick-pending-event";
import { LEGACY_CHECKIN_ALARM_ID, warningAnchor } from "./_core/event-kind";
import {
  accountLiveness,
  alarmChanges,
  alarmEvents,
  InsertAlarmEvent,
  managedAlarmLists,
  userData,
  users,
  warningLog,
} from "../drizzle/schema";
import { NO_SIGNAL_PAUSE_HOURS } from "../shared/managed-alarm";

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
        // Qualquer sinal retoma uma conta pausada pelo dead man's switch.
        dmsPausedReason: null,
        dmsPausedAt: null,
        pauseNoticeSentAt: null,
      },
    });
}

/**
 * "O aparelho deu sinal agora", vindo de uma chamada que já aconteceria de
 * qualquer jeito (backup, evento de alarme, token de push, ack). Renova o
 * `lastSeenAt` e RETOMA a conta se estava pausada (logout, app removido ou
 * 48 h sem sinal). Só o essencial: não toca localização, aparelho nem versão —
 * quem grava esses metadados é o heartbeat.
 *
 * NUNCA lança: o sinal é carona de outra chamada e não pode derrubá-la. Erro
 * vira log só com nome e código (a mensagem de um erro do drizzle traz os
 * parâmetros da query, inclusive o openId).
 */
export async function touchLiveness(openId: string): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    const now = new Date();
    await db
      .insert(accountLiveness)
      .values({ openId, lastSeenAt: now })
      .onDuplicateKeyUpdate({
        set: {
          lastSeenAt: now,
          dmsPausedReason: null,
          dmsPausedAt: null,
          pauseNoticeSentAt: null,
        },
      });
  } catch (err) {
    const e = err as { name?: string; code?: string; cause?: { code?: string } } | null;
    console.warn(
      "[Liveness] não foi possível registrar o sinal do aparelho:",
      `${e?.name ?? "Error"} ${e?.cause?.code ?? e?.code ?? ""}`.trim()
    );
  }
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

// --- Alarm Events -------------------------------------------------------------

export async function createAlarmEvent(data: InsertAlarmEvent): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  // Idempotency: return existing row if (openId, alarmId, scheduledAt) already exists.
  // Prevents duplicate pending events when createEvent is called multiple times
  // (e.g., startup effect + respond-and-recreate on the same deadline).
  const existing = await db
    .select({
      id: alarmEvents.id,
      status: alarmEvents.status,
      kind: alarmEvents.kind,
      graceMinutes: alarmEvents.graceMinutes,
    })
    .from(alarmEvents)
    .where(
      and(
        eq(alarmEvents.openId, data.openId),
        eq(alarmEvents.alarmId, data.alarmId),
        eq(alarmEvents.scheduledAt, data.scheduledAt as Date)
      )
    )
    .limit(1);
  if (existing.length > 0) {
    // Mudar só o atraso do check-in mantém o scheduledAt: o re-sync cai aqui.
    // Enquanto o evento está pendente, o prazo/tipo novos valem; resolvido
    // (confirmado, perdido…) não se mexe.
    const row = existing[0];
    const kind = data.kind ?? null;
    const graceMinutes = data.graceMinutes ?? null;
    if (
      row.status === "pending" &&
      ((row.kind ?? null) !== kind || (row.graceMinutes ?? null) !== graceMinutes)
    ) {
      await db.update(alarmEvents).set({ kind, graceMinutes }).where(eq(alarmEvents.id, row.id));
    }
    return row.id;
  }

  // Um único pending FUTURO por (openId, alarmId). O cliente pré-registra o
  // PRÓXIMO disparo a cada sync; editar o horário do alarme mudava o
  // scheduledAt e ACUMULAVA pendings — e cada um expirava depois e escalava um
  // "alarme perdido" de um horário que não existe mais. Reaproveita a linha
  // futura existente (e apaga duplicatas herdadas). Pendings com scheduledAt
  // no PASSADO ficam intocados: são disparos reais esperando o monitoring-job
  // resolver — apagá-los desarmaria o switch.
  const now = new Date();
  if ((data.scheduledAt as Date).getTime() > now.getTime()) {
    const futurePendings = await db
      .select({ id: alarmEvents.id })
      .from(alarmEvents)
      .where(
        and(
          eq(alarmEvents.openId, data.openId),
          eq(alarmEvents.alarmId, data.alarmId),
          eq(alarmEvents.status, "pending"),
          gt(alarmEvents.scheduledAt, now)
        )
      );
    if (futurePendings.length > 0) {
      const [keep, ...extras] = futurePendings;
      await db
        .update(alarmEvents)
        .set({
          scheduledAt: data.scheduledAt as Date,
          alarmDescription: data.alarmDescription,
          timezone: data.timezone ?? null,
          kind: data.kind ?? null,
          graceMinutes: data.graceMinutes ?? null,
        })
        .where(eq(alarmEvents.id, keep.id));
      if (extras.length > 0) {
        await db
          .delete(alarmEvents)
          .where(inArray(alarmEvents.id, extras.map((e) => e.id)));
      }
      return keep.id;
    }
  }

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
 * Apaga um evento pendente que nunca deveria ter acontecido — o alarme que o
 * pré-registrou foi desativado ou apagado antes do horário.
 *
 * Apagar, e não marcar um status novo: `alarm_events` é log de OCORRÊNCIAS, e
 * um disparo que o usuário desligou de propósito não ocorreu. Também evita
 * migração de enum e um estado novo para o app do cuidador renderizar.
 */
export async function deleteAlarmEvent(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(alarmEvents).where(eq(alarmEvents.id, id));
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
): Promise<{ id: number; timezone: string | null; kind: string | null } | null> {
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
  return affected > 0 ? { id: target.id, timezone: target.timezone, kind: target.kind ?? null } : null;
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
 * "É check-in" = kind 'checkin' (novo) OU o alarmId fixo do sistema antigo.
 * Evita escalar todo remédio perdido pela cascata do Passo 3.
 * lookbackHours caps how far back we search to avoid re-escalating stale events.
 */
export async function getMissedCheckinEvents(lookbackHours: number) {
  const db = await getDb();
  if (!db) return [];
  const cutoff = new Date(Date.now() - lookbackHours * 60 * 60 * 1000);
  return db
    .select()
    .from(alarmEvents)
    .where(
      and(
        or(eq(alarmEvents.kind, "checkin"), eq(alarmEvents.alarmId, LEGACY_CHECKIN_ALARM_ID)),
        inArray(alarmEvents.status, ["missed", "not_sent"]),
        eq(alarmEvents.warningSent, false),
        gte(alarmEvents.scheduledAt, cutoff)
      )
    );
}

/**
 * Eventos de alarme de MEDICAÇÃO (não check-in) que expiraram sem resposta —
 * "missed" (havia sinal de vida após o horário, ninguém respondeu) ou
 * "not_sent" (sem sinal de vida após o horário: celular desligado/sem conexão,
 * o alarme provavelmente nem tocou) — e ainda não foram escalados pelo servidor
 * (warningSent=false). Backstop do dead man's switch para quando a escalação no
 * cliente não completou. O Passo 4 usa o status para escolher a cópia certa
 * ("não respondeu" vs "não foi entregue"); a escada de inatividade do Passo 2
 * segue existindo como reforço progressivo (30min/2h/6h).
 */
export async function getMissedMedicationEvents(lookbackHours: number) {
  const db = await getDb();
  if (!db) return [];
  const cutoff = new Date(Date.now() - lookbackHours * 60 * 60 * 1000);
  return db
    .select()
    .from(alarmEvents)
    .where(
      and(
        ne(alarmEvents.alarmId, LEGACY_CHECKIN_ALARM_ID),
        or(isNull(alarmEvents.kind), ne(alarmEvents.kind, "checkin")),
        inArray(alarmEvents.status, ["missed", "not_sent"]),
        eq(alarmEvents.warningSent, false),
        gte(alarmEvents.scheduledAt, cutoff)
      )
    );
}

/**
 * Contas com pelo menos um evento esperado NÃO confirmado ('missed' |
 * 'not_sent') na janela de look-back, com a idade do MAIS ANTIGO deles.
 *
 * É o sinal que move a escada de escalação (Passo 2). Substituiu
 * `getInactiveAccounts` (removida) nesse papel porque "sem heartbeat" media a coisa
 * errada: o heartbeat só corre com o app em primeiro plano, então um idoso
 * que responde ao alarme e fecha o app fica "offline" para sempre — e, pior,
 * um que deixa o app ABERTO e não responde nunca entrava na lista, e a
 * família nunca era avisada. Já a idade do evento não confirmado é um sinal
 * real: o servidor sabe quando aquela resposta era esperada.
 *
 * Retorna o `oldestUnconfirmedAt` (a âncora mais antiga sem confirmação) —
 * é dele que sai a "idade" que define o nível do aviso. Para check-in a âncora
 * é o prazo de resposta (ver `warningAnchor`); para o resto, o disparo.
 */
export async function getAccountsWithUnconfirmedEvents(lookbackHours: number) {
  const db = await getDb();
  // Fail-closed: sem DB, lança em vez de responder
  // "nenhuma conta em perigo" e silenciar o switch.
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  const cutoff = new Date(Date.now() - lookbackHours * 60 * 60 * 1000);
  const rows = await db
    .select({
      openId: alarmEvents.openId,
      scheduledAt: alarmEvents.scheduledAt,
      kind: alarmEvents.kind,
      graceMinutes: alarmEvents.graceMinutes,
    })
    .from(alarmEvents)
    .where(
      and(
        inArray(alarmEvents.status, ["missed", "not_sent"]),
        gte(alarmEvents.scheduledAt, cutoff)
      )
    );

  // O mais antigo por conta, calculado em JS: a âncora do check-in depende do
  // prazo (grace + folga) e reaproveita as regras de event-kind.ts.
  const oldest = new Map<string, Date>();
  for (const r of rows) {
    const anchor = warningAnchor({ ...r, scheduledAt: new Date(r.scheduledAt) });
    const current = oldest.get(r.openId);
    if (!current || anchor < current) oldest.set(r.openId, anchor);
  }
  return [...oldest].map(([openId, oldestUnconfirmedAt]) => ({ openId, oldestUnconfirmedAt }));
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

/**
 * Avisos da conta, MAIS RECENTES PRIMEIRO.
 *
 * Era ASC — e com `limit` isso devolvia os avisos mais ANTIGOS. O Passo 2 do
 * monitoring-job usa esta lista (limit 10) para deduplicar ("já avisei neste
 * nível nas últimas MIN_WARNING_INTERVAL_HOURS?"). Passando de 10 linhas no
 * log, os avisos recentes nunca apareciam na janela, a dedup nunca casava e o
 * MESMO aviso saía a cada rodada do job — push no cuidador a cada 5 minutos
 * (feedback 27/07). Mesmo bug que já havia sido corrigido em
 * getAlarmEventHistory; aqui tem o agravante de se auto-alimentar: cada reenvio
 * insere mais uma linha e afunda ainda mais os avisos recentes.
 */
export async function getWarningHistory(openId: string, limit = 20) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(warningLog)
    .where(eq(warningLog.openId, openId))
    .orderBy(desc(warningLog.sentAt))
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
  alarmChanges: number;
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
  const ac = await db.delete(alarmChanges).where(lt(alarmChanges.createdAt, eventsCutoff));
  const wl = await db.delete(warningLog).where(lt(warningLog.sentAt, eventsCutoff));
  // Stale GPS: blank the location fields rather than deleting the liveness row.
  const loc = await db
    .update(accountLiveness)
    .set({ lastLocation: null, lastLocationAt: null })
    .where(lt(accountLiveness.lastLocationAt, locationCutoff));

  return {
    alarmEvents: affected(ev),
    alarmChanges: affected(ac),
    warningLog: affected(wl),
    locationsCleared: affected(loc),
  };
}

// --- Pausas do dead man's switch (Fase 4) -------------------------------------

export type DmsPauseReason = "logged_out" | "app_removed" | "no_signal";

function affectedRows(result: unknown): number {
  const r = result as { affectedRows?: number } | Array<{ affectedRows?: number }> | null;
  return (Array.isArray(r) ? r[0]?.affectedRows : r?.affectedRows) ?? 0;
}

/**
 * Pausa os disparos da conta. Só pausa conta que NÃO está pausada (não troca o
 * motivo de quem já está) e devolve `true` apenas quando pausou agora.
 *
 * Apaga os eventos PENDENTES FUTUROS (o servidor não cobra o que não vai
 * acontecer). Os que já venceram ficam: seguem a escada normal, porque o alarme
 * podia ter tocado antes da pausa.
 *
 * `pauseNoticeSentAt` zera: cada pausa tem o seu aviso aos cuidadores.
 */
export async function pauseDms(openId: string, reason: DmsPauseReason): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  const now = new Date();

  // Logout de quem nunca deu sinal não tem linha de liveness; o `set` é um no-op
  // para não mexer em lastSeenAt de quem já tem.
  await db
    .insert(accountLiveness)
    .values({ openId, lastSeenAt: now })
    .onDuplicateKeyUpdate({ set: { openId } });

  const claimed = await db
    .update(accountLiveness)
    .set({ dmsPausedReason: reason, dmsPausedAt: now, pauseNoticeSentAt: null })
    .where(and(eq(accountLiveness.openId, openId), isNull(accountLiveness.dmsPausedReason)));
  if (affectedRows(claimed) === 0) return false;

  await db
    .delete(alarmEvents)
    .where(
      and(
        eq(alarmEvents.openId, openId),
        eq(alarmEvents.status, "pending"),
        gt(alarmEvents.scheduledAt, now)
      )
    );
  return true;
}

// --- Pré-registro feito pelo servidor (Fase 4) --------------------------------

/**
 * Conta de idoso que o servidor pré-registra: não pausada e com sinal do
 * aparelho nas últimas 48 h (`NO_SIGNAL_PAUSE_HOURS`). Conta de cuidador não tem
 * alarmes. `managed` vem preenchido quando há acordo ativo: nesse caso só vale a
 * lista que o celular CONFIRMOU (`appliedAlarms`), nunca `user_data.alarms`.
 */
export type PreRegisterCandidate = {
  openId: string;
  alarms: unknown;
  timezone: string | null;
  managed: { appliedAlarms: unknown; failedAlarmIds: unknown } | null;
};

export async function getPreRegisterCandidates(now: Date): Promise<PreRegisterCandidate[]> {
  const db = await getDb();
  // Fail-closed, como getAccountsWithUnconfirmedEvents: sem banco o job tem que
  // contar a falha, não responder "nenhuma conta".
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  const cutoff = new Date(now.getTime() - NO_SIGNAL_PAUSE_HOURS * 60 * 60 * 1000);

  const rows = await db
    .select({
      openId: accountLiveness.openId,
      alarms: userData.alarms,
      timezone: userData.timezone,
      managedOpenId: managedAlarmLists.monitoredOpenId,
      appliedAlarms: managedAlarmLists.appliedAlarms,
      failedAlarmIds: managedAlarmLists.failedAlarmIds,
    })
    .from(accountLiveness)
    .innerJoin(users, eq(users.openId, accountLiveness.openId))
    .leftJoin(userData, eq(userData.openId, accountLiveness.openId))
    .leftJoin(managedAlarmLists, eq(managedAlarmLists.monitoredOpenId, accountLiveness.openId))
    .where(
      and(
        isNull(accountLiveness.dmsPausedReason),
        gte(accountLiveness.lastSeenAt, cutoff),
        or(isNull(users.userType), ne(users.userType, "caregiver"))
      )
    );

  return rows.map((r) => ({
    openId: r.openId,
    alarms: r.alarms ?? null,
    timezone: r.timezone ?? null,
    managed: r.managedOpenId
      ? { appliedAlarms: r.appliedAlarms, failedAlarmIds: r.failedAlarmIds }
      : null,
  }));
}

/**
 * Existe evento (de QUALQUER status) do mesmo alarme a até `windowMinutes` do
 * horário `at`, para os dois lados? É a regra "mesmo disparo, um evento só": o
 * fuso do aparelho pode diferir do guardado na conta (viagem, fuso ainda nulo) e
 * o servidor não pode criar um segundo evento que expiraria e acusaria a pessoa
 * à toa. Evento já resolvido conta: quem já respondeu não gera outro.
 */
export async function findEventNear(
  openId: string,
  alarmId: string,
  at: Date,
  windowMinutes: number
): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  const windowMs = windowMinutes * 60 * 1000;
  const rows = await db
    .select({ id: alarmEvents.id })
    .from(alarmEvents)
    .where(
      and(
        eq(alarmEvents.openId, openId),
        eq(alarmEvents.alarmId, alarmId),
        gte(alarmEvents.scheduledAt, new Date(at.getTime() - windowMs)),
        lte(alarmEvents.scheduledAt, new Date(at.getTime() + windowMs))
      )
    )
    .limit(1);
  return rows.length > 0;
}

/**
 * Registro de disparo feito PELO SERVIDOR. Antes de criar, confere a janela de
 * `findEventNear`; criar mesmo é o `createAlarmEvent` de sempre (idempotente, um
 * pendente futuro por alarme). Fica numa função à parte para não mudar a ordem
 * das consultas do `createAlarmEvent`, de que os testes dependem.
 */
export async function ensureServerAlarmEvent(
  data: InsertAlarmEvent,
  windowMinutes: number
): Promise<"created" | "exists"> {
  if (await findEventNear(data.openId, data.alarmId, data.scheduledAt as Date, windowMinutes)) {
    return "exists";
  }
  await createAlarmEvent(data);
  return "created";
}

/**
 * Apaga os eventos PENDENTES e FUTUROS dos alarmes dados. Usado para o alarme que
 * o celular não conseguiu agendar: o evento registrado antes da mudança venceria
 * sem tocar e acusaria a pessoa de não responder. Os que já venceram ficam.
 */
export async function deleteFuturePendingEvents(
  openId: string,
  alarmIds: string[],
  now: Date
): Promise<void> {
  if (alarmIds.length === 0) return;
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  await db
    .delete(alarmEvents)
    .where(
      and(
        eq(alarmEvents.openId, openId),
        inArray(alarmEvents.alarmId, alarmIds),
        eq(alarmEvents.status, "pending"),
        gt(alarmEvents.scheduledAt, now)
      )
    );
}
