/**
 * db-alarm-management.ts
 *
 * Persistência do acordo "o cuidador cuida dos alarmes do idoso" (tabela
 * `alarm_management`, ver drizzle/schema.ts). Regra central: no máximo UM pedido
 * `pending` ou acordo `active` por idoso. Quem decide isso é o banco, em
 * transação: toda função que muda o acordo de um idoso começa travando a linha
 * dele em `users` (`SELECT … FOR UPDATE`), então dois pedidos ao mesmo tempo, ou
 * um aceite junto de um cancelamento, entram um de cada vez. Não existe índice
 * único que impeça a duplicata (a migração só adiciona), por isso a trava.
 *
 * Leituras devolvem null/[] sem banco, como o resto dos db-*.ts; escritas
 * lançam `DATABASE_UNAVAILABLE` (calar faria o usuário achar que parou o acordo).
 */
import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, lt, ne, or } from "drizzle-orm";
import {
  alarmManagement,
  managedAlarmLists,
  users,
  type AlarmManagementRow,
} from "../drizzle/schema";
import { MANAGEMENT_REQUEST_TTL_DAYS, type ManagedAlarm } from "../shared/managed-alarm.js";
import { getDb } from "./db";

export type EndedReason = NonNullable<AlarmManagementRow["endedReason"]>;

const OPEN_STATUSES: Array<AlarmManagementRow["status"]> = ["pending", "active"];

function affectedRows(res: unknown): number {
  return (
    (res as { affectedRows?: number }).affectedRows ??
    (res as Array<{ affectedRows?: number }>)[0]?.affectedRows ??
    0
  );
}

// --- Leituras --------------------------------------------------------------------

/** Pedido pendente ou acordo ativo do idoso. */
export async function getOpenManagementForMonitored(
  monitoredOpenId: string,
): Promise<AlarmManagementRow | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(alarmManagement)
    .where(
      and(
        eq(alarmManagement.monitoredOpenId, monitoredOpenId),
        inArray(alarmManagement.status, OPEN_STATUSES),
      ),
    )
    .orderBy(desc(alarmManagement.id))
    .limit(1);
  return rows[0] ?? null;
}

/** Só o acordo ativo do idoso (o pedido pendente não conta). */
export async function getActiveManagementForMonitored(
  monitoredOpenId: string,
): Promise<AlarmManagementRow | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(alarmManagement)
    .where(
      and(
        eq(alarmManagement.monitoredOpenId, monitoredOpenId),
        eq(alarmManagement.status, "active"),
      ),
    )
    .orderBy(desc(alarmManagement.id))
    .limit(1);
  return rows[0] ?? null;
}

/** Pedido pendente ou acordo ativo que ESTE cuidador abriu. */
export async function getOpenManagementForCaregiver(
  caregiverOpenId: string,
): Promise<AlarmManagementRow | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(alarmManagement)
    .where(
      and(
        eq(alarmManagement.caregiverOpenId, caregiverOpenId),
        inArray(alarmManagement.status, OPEN_STATUSES),
      ),
    )
    .orderBy(desc(alarmManagement.id))
    .limit(1);
  return rows[0] ?? null;
}

/** Pedidos pendentes há mais de 7 dias (o job os encerra como `expired`). */
export async function getExpiredManagementRequests(now: Date): Promise<AlarmManagementRow[]> {
  const db = await getDb();
  if (!db) return [];
  const cutoff = new Date(now.getTime() - MANAGEMENT_REQUEST_TTL_DAYS * 24 * 60 * 60 * 1000);
  return db
    .select()
    .from(alarmManagement)
    .where(and(eq(alarmManagement.status, "pending"), lt(alarmManagement.requestedAt, cutoff)))
    .orderBy(alarmManagement.id);
}

/** Todo o histórico em que a conta aparece, como idoso OU como cuidador (exportação, LGPD Art. 18 V). Mais recente primeiro. */
export async function getManagementHistory(openId: string): Promise<AlarmManagementRow[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(alarmManagement)
    .where(or(eq(alarmManagement.monitoredOpenId, openId), eq(alarmManagement.caregiverOpenId, openId)))
    .orderBy(desc(alarmManagement.id));
}

// --- Escritas (sempre em transação, com a linha do idoso travada) -----------------

/** Trava a linha do idoso em `users`: serializa tudo que muda o acordo dele. */
type Tx = Parameters<Parameters<NonNullable<Awaited<ReturnType<typeof getDb>>>["transaction"]>[0]>[0];
async function lockMonitored(tx: Tx, monitoredOpenId: string): Promise<void> {
  await tx
    .select({ id: users.id })
    .from(users)
    .where(eq(users.openId, monitoredOpenId))
    .limit(1)
    .for("update");
}

/**
 * O cuidador pede para cuidar dos alarmes do idoso. `CONFLICT` se o idoso já
 * tem pedido pendente ou acordo ativo (inclusive quando dois pedidos chegam ao
 * mesmo tempo: o segundo espera a trava e então vê o primeiro).
 */
export async function createManagementRequest(
  caregiverOpenId: string,
  monitoredOpenId: string,
): Promise<AlarmManagementRow> {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  return db.transaction(async (tx) => {
    await lockMonitored(tx, monitoredOpenId);
    const open = await tx
      .select({ id: alarmManagement.id })
      .from(alarmManagement)
      .where(
        and(
          eq(alarmManagement.monitoredOpenId, monitoredOpenId),
          inArray(alarmManagement.status, OPEN_STATUSES),
        ),
      )
      .limit(1);
    if (open.length > 0) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "Já existe um pedido ou acordo para esta pessoa.",
      });
    }
    await tx.insert(alarmManagement).values({ monitoredOpenId, caregiverOpenId, status: "pending" });
    // Relê a linha criada (a trava garante que é a única pendente deste idoso).
    const [row] = await tx
      .select()
      .from(alarmManagement)
      .where(
        and(
          eq(alarmManagement.monitoredOpenId, monitoredOpenId),
          eq(alarmManagement.status, "pending"),
        ),
      )
      .orderBy(desc(alarmManagement.id))
      .limit(1);
    return row;
  });
}

/**
 * O idoso aceita: o pedido vira `active` e nasce a lista gerenciada na versão 1,
 * já confirmada (`appliedVersion = 1`, `appliedAlarms` = a própria lista). Tudo
 * ou nada. `CONFLICT` se o pedido deixou de estar pendente (cancelado ou vencido
 * enquanto o idoso lia o diálogo) ou não é deste idoso.
 */
export async function activateManagement(
  id: number,
  list: ManagedAlarm[],
  monitoredOpenId: string,
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  await db.transaction(async (tx) => {
    await lockMonitored(tx, monitoredOpenId);
    const now = new Date();
    const res = await tx
      .update(alarmManagement)
      .set({ status: "active", respondedAt: now })
      .where(
        and(
          eq(alarmManagement.id, id),
          eq(alarmManagement.monitoredOpenId, monitoredOpenId),
          eq(alarmManagement.status, "pending"),
        ),
      );
    if (affectedRows(res) === 0) {
      throw new TRPCError({ code: "CONFLICT", message: "Este pedido não está mais aberto." });
    }
    await tx.insert(managedAlarmLists).values({
      monitoredOpenId,
      version: 1,
      alarms: list,
      appliedVersion: 1,
      appliedAlarms: list,
      failedAlarmIds: [],
      appliedAt: now,
      updatedByOpenId: monitoredOpenId,
    });
  });
}

/**
 * Encerra o pedido/acordo com o motivo, apaga a lista gerenciada do idoso (a
 * lista no celular continua e volta a ser dele) e, se for recusa, registra
 * também `respondedAt`. Idempotente: acordo que já terminou não é tocado (o
 * motivo original fica, e uma lista de um acordo NOVO do mesmo idoso não é
 * apagada por engano).
 */
export async function endManagement(id: number, reason: EndedReason): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  const [current] = await db
    .select({ monitoredOpenId: alarmManagement.monitoredOpenId })
    .from(alarmManagement)
    .where(eq(alarmManagement.id, id))
    .limit(1);
  if (!current) return;

  await db.transaction(async (tx) => {
    await lockMonitored(tx, current.monitoredOpenId);
    const now = new Date();
    const res = await tx
      .update(alarmManagement)
      .set({
        status: "ended",
        endedReason: reason,
        endedAt: now,
        ...(reason === "declined" ? { respondedAt: now } : {}),
      })
      .where(and(eq(alarmManagement.id, id), ne(alarmManagement.status, "ended")));
    if (affectedRows(res) === 0) return;
    await tx.delete(managedAlarmLists).where(eq(managedAlarmLists.monitoredOpenId, current.monitoredOpenId));
  });
}
