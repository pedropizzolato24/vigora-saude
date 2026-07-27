/**
 * create-alarm-event-dedup.test.ts
 *
 * createAlarmEvent: um único pending FUTURO por (openId, alarmId).
 * O cliente pré-registra o próximo disparo a cada sync; editar o horário do
 * alarme várias vezes acumulava um pending por horário — e cada um expirava
 * depois e escalava um "alarme perdido" de um horário que não existe mais.
 * Regras:
 *  - (openId, alarmId, scheduledAt) idêntico → devolve a linha existente.
 *  - pending futuro existente com OUTRO horário → atualiza in-place (e apaga
 *    duplicatas herdadas), sem criar linha nova.
 *  - pendings com scheduledAt no PASSADO ficam intocados (disparos reais
 *    esperando o monitoring-job resolver).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// Fila de resultados de SELECT, consumida na ordem em que as queries rodam.
let selectResults: Array<Array<{ id: number }>> = [];
const updates: Array<Record<string, unknown>> = [];
const deletes: number[] = [];
const inserts: Array<Record<string, unknown>> = [];

const fakeDb = {
  select: () => {
    const chain: any = {
      from: () => chain,
      where: () => chain,
      limit: () => Promise.resolve(selectResults.shift() ?? []),
      then: (res: any, rej: any) =>
        Promise.resolve(selectResults.shift() ?? []).then(res, rej),
    };
    return chain;
  },
  update: () => ({
    set: (values: Record<string, unknown>) => ({
      where: () => {
        updates.push(values);
        return Promise.resolve([{ affectedRows: 1 }]);
      },
    }),
  }),
  delete: () => ({
    where: () => {
      deletes.push(1);
      return Promise.resolve([{ affectedRows: 1 }]);
    },
  }),
  insert: () => ({
    values: (values: Record<string, unknown>) => {
      inserts.push(values);
      return Promise.resolve({ insertId: 42 });
    },
  }),
};

vi.mock("../server/db", () => ({
  getDb: vi.fn(async () => fakeDb),
}));

import { createAlarmEvent } from "../server/db-monitoring";

const FUTURE = new Date(Date.now() + 12 * 60 * 60 * 1000);
const PAST = new Date(Date.now() - 60 * 60 * 1000);

const baseEvent = {
  openId: "user-1",
  alarmId: "alarm-1",
  alarmDescription: "Remédio da pressão",
  scheduledAt: FUTURE,
  status: "pending" as const,
};

beforeEach(() => {
  selectResults = [];
  updates.length = 0;
  deletes.length = 0;
  inserts.length = 0;
});

describe("createAlarmEvent — dedup de pending futuro", () => {
  it("mesmo (openId, alarmId, scheduledAt) → devolve a linha existente, sem insert", async () => {
    selectResults = [[{ id: 7 }]]; // match exato

    const id = await createAlarmEvent(baseEvent);

    expect(id).toBe(7);
    expect(inserts).toHaveLength(0);
    expect(updates).toHaveLength(0);
  });

  it("pending futuro com outro horário → atualiza in-place e apaga duplicatas, sem insert", async () => {
    selectResults = [
      [], // sem match exato
      [{ id: 3 }, { id: 9 }], // dois pendings futuros herdados
    ];

    const id = await createAlarmEvent(baseEvent);

    expect(id).toBe(3);
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      scheduledAt: FUTURE,
      alarmDescription: "Remédio da pressão",
    });
    expect(deletes).toHaveLength(1); // o id 9 extra
    expect(inserts).toHaveLength(0);
  });

  it("sem pending futuro existente → insere normalmente", async () => {
    selectResults = [[], []]; // sem exato, sem futuros

    const id = await createAlarmEvent(baseEvent);

    expect(id).toBe(42);
    expect(inserts).toHaveLength(1);
    expect(updates).toHaveLength(0);
  });

  it("scheduledAt no PASSADO nunca dispara o dedup (não toca pendings vencidos)", async () => {
    selectResults = [[]]; // só a checagem exata roda

    const id = await createAlarmEvent({ ...baseEvent, scheduledAt: PAST });

    expect(id).toBe(42);
    expect(inserts).toHaveLength(1);
    expect(updates).toHaveLength(0);
    expect(deletes).toHaveLength(0);
    // A fila de SELECTs futura não foi consumida — a query de pendings futuros
    // nem chegou a rodar.
    expect(selectResults).toHaveLength(0);
  });
});
