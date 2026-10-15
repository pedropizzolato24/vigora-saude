/**
 * db-managed-alarm-list.ts
 *
 * Persistência da lista gerenciada (tabela `managed_alarm_lists`, ver
 * drizzle/schema.ts): uma linha por idoso com acordo ativo, versionada.
 *
 *  - `version` sobe a cada gravação do cuidador; a gravação é um
 *    `UPDATE … WHERE version = baseVersion`, então duas gravações em cima da mesma
 *    versão não se sobrescrevem: a segunda não acha linha e vira conflito.
 *  - `appliedVersion`/`appliedAlarms`/`failedAlarmIds` são o que o celular
 *    confirmou. O servidor só cobra (dead man's switch) o que foi confirmado.
 *  - `updatedAt` é o momento da última gravação do cuidador: o ack e a marca da
 *    notificação de reserva NÃO o mexem (o MySQL só pula o `ON UPDATE` quando a
 *    coluna aparece no SET, por isso elas se copiam para si mesmas).
 *
 * Leituras devolvem null/[] sem banco; escritas lançam `DATABASE_UNAVAILABLE`.
 */
import { and, eq, lt, sql } from "drizzle-orm";
import { managedAlarmLists, type ManagedAlarmListRow } from "../drizzle/schema";
import { VISIBLE_NOTICE_DELAY_MINUTES, type ManagedAlarm } from "../shared/managed-alarm.js";
import { getDb } from "./db";

/** A versão que o cuidador via já não é a atual (outro cuidador/aba gravou antes, ou a lista acabou). */
export class ManagedListConflictError extends Error {
  constructor(message = "A lista mudou.") {
    super(message);
    this.name = "ManagedListConflictError";
  }
}

function affectedRows(res: unknown): number {
  return (
    (res as { affectedRows?: number }).affectedRows ??
    (res as Array<{ affectedRows?: number }>)[0]?.affectedRows ??
    0
  );
}

export async function getManagedList(monitoredOpenId: string): Promise<ManagedAlarmListRow | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(managedAlarmLists)
    .where(eq(managedAlarmLists.monitoredOpenId, monitoredOpenId))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Grava a lista nova em cima de `baseVersion` e devolve a nova versão.
 * `ManagedListConflictError` se a versão atual já não é `baseVersion` (ou se a
 * lista não existe mais).
 */
export async function writeManagedList(
  monitoredOpenId: string,
  baseVersion: number,
  alarms: ManagedAlarm[],
  updatedByOpenId: string,
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  const res = await db
    .update(managedAlarmLists)
    .set({ version: baseVersion + 1, alarms, updatedByOpenId })
    .where(
      and(
        eq(managedAlarmLists.monitoredOpenId, monitoredOpenId),
        eq(managedAlarmLists.version, baseVersion),
      ),
    );
  if (affectedRows(res) === 0) throw new ManagedListConflictError();
  return baseVersion + 1;
}

/**
 * O celular confirma que agendou a `version`. Só vale se for a versão ATUAL da
 * lista e maior que a já confirmada: então `appliedAlarms` vira a lista dessa
 * versão (cópia de `alarms`, no mesmo comando, sem janela para outra gravação
 * entrar no meio) e `failedAlarmIds` os que o sistema recusou. Ack de versão
 * velha, de versão que já foi superada ou de lista que não existe é ignorado.
 * Devolve se gravou.
 */
export async function recordManagedAck(
  monitoredOpenId: string,
  version: number,
  failedAlarmIds: string[],
): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  const res = await db
    .update(managedAlarmLists)
    .set({
      appliedVersion: version,
      appliedAlarms: sql`${managedAlarmLists.alarms}`,
      failedAlarmIds: [...new Set(failedAlarmIds)],
      appliedAt: new Date(),
      updatedAt: sql`${managedAlarmLists.updatedAt}`,
    })
    .where(
      and(
        eq(managedAlarmLists.monitoredOpenId, monitoredOpenId),
        eq(managedAlarmLists.version, version),
        lt(managedAlarmLists.appliedVersion, version),
      ),
    );
  return affectedRows(res) > 0;
}

/**
 * Listas cuja versão o celular ainda não confirmou há mais de 10 minutos e para
 * as quais ainda não foi mandada a notificação visível de reserva.
 */
export async function getListsNeedingVisibleNotice(now: Date): Promise<ManagedAlarmListRow[]> {
  const db = await getDb();
  if (!db) return [];
  const cutoff = new Date(now.getTime() - VISIBLE_NOTICE_DELAY_MINUTES * 60 * 1000);
  return db
    .select()
    .from(managedAlarmLists)
    .where(
      and(
        lt(managedAlarmLists.appliedVersion, managedAlarmLists.version),
        lt(managedAlarmLists.visibleNoticeSentForVersion, managedAlarmLists.version),
        lt(managedAlarmLists.updatedAt, cutoff),
      ),
    );
}

/** Marca que a notificação visível da `version` já saiu (nunca volta atrás). */
export async function markVisibleNoticeSent(monitoredOpenId: string, version: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  await db
    .update(managedAlarmLists)
    .set({ visibleNoticeSentForVersion: version, updatedAt: sql`${managedAlarmLists.updatedAt}` })
    .where(
      and(
        eq(managedAlarmLists.monitoredOpenId, monitoredOpenId),
        lt(managedAlarmLists.visibleNoticeSentForVersion, version),
      ),
    );
}
