/**
 * db-monitoring-pauses.test.ts
 *
 * Consultas das pausas do dead man's switch. As condições `where` são
 * renderizadas em SQL (MySqlDialect) porque o risco está nelas: apagar evento
 * que já venceu desarmaria o switch; pausar conta que já estava pausada trocaria
 * o motivo; aviso repetido acorda o cuidador à toa.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";

let selectResults: unknown[][] = [];
let updateAffected = 1;
let inTransaction = false;
let deleteFails = false;
const txLog: string[] = [];
const selectWheres: unknown[] = [];
const deleteWheres: unknown[] = [];
const updates: Array<{ values: Record<string, unknown>; where: unknown }> = [];
const upserts: Array<{ values: Record<string, unknown>; set: Record<string, unknown> }> = [];

const fakeDb = {
  select: () => {
    const chain: any = {
      from: () => chain,
      innerJoin: () => chain,
      leftJoin: () => chain,
      where: (condition: unknown) => {
        selectWheres.push(condition);
        return chain;
      },
      limit: () => Promise.resolve(selectResults.shift() ?? []),
      then: (res: any, rej: any) => Promise.resolve(selectResults.shift() ?? []).then(res, rej),
    };
    return chain;
  },
  update: () => ({
    set: (values: Record<string, unknown>) => ({
      where: (where: unknown) => {
        updates.push({ values, where });
        txLog.push(`update${inTransaction ? " (tx)" : ""}`);
        return Promise.resolve([{ affectedRows: updateAffected }]);
      },
    }),
  }),
  delete: () => ({
    where: (condition: unknown) => {
      deleteWheres.push(condition);
      txLog.push(`delete${inTransaction ? " (tx)" : ""}`);
      if (deleteFails) return Promise.reject(new Error("conexão caiu"));
      return Promise.resolve([{ affectedRows: 1 }]);
    },
  }),
  transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
    inTransaction = true;
    txLog.push("begin");
    try {
      const result = await fn(fakeDb);
      txLog.push("commit");
      return result;
    } catch (err) {
      txLog.push("rollback");
      throw err;
    } finally {
      inTransaction = false;
    }
  },
  insert: () => ({
    values: (values: Record<string, unknown>) => ({
      onDuplicateKeyUpdate: ({ set }: { set: Record<string, unknown> }) => {
        upserts.push({ values, set });
        return Promise.resolve([{ affectedRows: 1 }]);
      },
    }),
  }),
};

vi.mock("../server/db", () => ({
  getDb: vi.fn(async () => fakeDb),
}));

import {
  getExpiredPendingEvents,
  getPausesNeedingNotice,
  getStaleUnpausedMonitoredAccounts,
  markPauseNoticeSent,
  pauseDms,
  recordHeartbeat,
  touchLiveness,
} from "../server/db-monitoring";

const dialect = new MySqlDialect();
const render = (condition: unknown) => dialect.sqlToQuery(condition as SQL);
const sqlDate = (d: Date) => d.toISOString().replace("T", " ").replace("Z", "");

const NOW = new Date("2026-10-10T12:00:00.000Z");

beforeEach(() => {
  selectResults = [];
  updateAffected = 1;
  inTransaction = false;
  deleteFails = false;
  txLog.length = 0;
  selectWheres.length = 0;
  deleteWheres.length = 0;
  updates.length = 0;
  upserts.length = 0;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("pauseDms", () => {
  it("pausa a conta: grava motivo e hora, zera o aviso e devolve true", async () => {
    await expect(pauseDms("maria", "no_signal")).resolves.toBe(true);

    expect(updates).toHaveLength(1);
    expect(updates[0].values).toEqual({
      dmsPausedReason: "no_signal",
      dmsPausedAt: NOW,
      pauseNoticeSentAt: null,
    });
  });

  it("só pausa conta que NÃO está pausada (não troca o motivo de quem já está)", async () => {
    await pauseDms("maria", "app_removed");

    const { sql, params } = render(updates[0].where);
    expect(sql).toContain("`account_liveness`.`openId` = ?");
    expect(sql).toContain("`account_liveness`.`dmsPausedReason` is null");
    expect(params).toEqual(["maria"]);
  });

  it("já pausada: devolve false e NÃO apaga evento nenhum", async () => {
    updateAffected = 0;

    await expect(pauseDms("maria", "no_signal")).resolves.toBe(false);

    expect(deleteWheres).toHaveLength(0);
  });

  it("apaga SÓ os eventos pendentes e FUTUROS da própria conta", async () => {
    await pauseDms("maria", "logged_out");

    expect(deleteWheres).toHaveLength(1);
    const { sql, params } = render(deleteWheres[0]);
    expect(sql).toContain("`alarm_events`.`openId` = ?");
    expect(sql).toContain("`alarm_events`.`status` = ?");
    expect(sql).toContain("`alarm_events`.`scheduledAt` > ?");
    // Evento que já venceu (scheduledAt <= agora) segue a escada normal.
    expect(sql).not.toContain("`scheduledAt` <");
    expect(params).toEqual(["maria", "pending", sqlDate(NOW)]);
  });

  it("a pausa e a limpeza dos eventos futuros vão na MESMA transação", async () => {
    await pauseDms("maria", "logged_out");

    expect(txLog).toEqual(["begin", "update (tx)", "delete (tx)", "commit"]);
  });

  it("DELETE falhou: a transação desfaz a pausa (rollback) e o erro sobe", async () => {
    deleteFails = true;

    await expect(pauseDms("maria", "logged_out")).rejects.toThrow("conexão caiu");

    expect(txLog).toEqual(["begin", "update (tx)", "delete (tx)", "rollback"]);
  });

  it("garante a linha de liveness (logout de quem nunca deu sinal) sem mexer em lastSeenAt", async () => {
    await pauseDms("maria", "logged_out");

    expect(upserts).toHaveLength(1);
    expect(upserts[0].values).toMatchObject({ openId: "maria" });
    expect(upserts[0].set).toEqual({ openId: "maria" });
  });
});

describe("getStaleUnpausedMonitoredAccounts", () => {
  it("idoso não pausado com último sinal há mais de 48 h, e que tem user_data", async () => {
    selectResults = [[{ openId: "a" }, { openId: "b" }]];

    await expect(getStaleUnpausedMonitoredAccounts(NOW)).resolves.toEqual(["a", "b"]);

    const { sql, params } = render(selectWheres[0]);
    expect(sql).toContain("`account_liveness`.`dmsPausedReason` is null");
    expect(sql).toContain("`account_liveness`.`lastSeenAt` < ?");
    expect(sql).toContain("`users`.`userType` is null or `users`.`userType` <> ?");
    expect(params).toContain(sqlDate(new Date("2026-10-08T12:00:00.000Z")));
    expect(params).toContain("caregiver");
  });
});

describe("getPausesNeedingNotice / markPauseNoticeSent", () => {
  it("lista só pausadas que ainda não foram avisadas", async () => {
    selectResults = [[{ openId: "maria", reason: "no_signal" }]];

    await expect(getPausesNeedingNotice()).resolves.toEqual([{ openId: "maria", reason: "no_signal" }]);

    const { sql } = render(selectWheres[0]);
    expect(sql).toContain("`account_liveness`.`dmsPausedReason` is not null");
    expect(sql).toContain("`account_liveness`.`pauseNoticeSentAt` is null");
  });

  it("marcar o aviso só vale para pausa em curso e ainda não avisada (retomada no meio não marca)", async () => {
    await markPauseNoticeSent("maria");

    expect(updates[0].values).toEqual({ pauseNoticeSentAt: NOW });
    const { sql, params } = render(updates[0].where);
    expect(sql).toContain("`account_liveness`.`dmsPausedReason` is not null");
    expect(sql).toContain("`account_liveness`.`pauseNoticeSentAt` is null");
    expect(params).toEqual(["maria"]);
  });
});

// A Tarefa 8 anotou que pauseDms não é atômico: se o DELETE falhar depois da
// pausa, sobra evento pendente FUTURO de conta pausada. Quando ele vencesse, o
// Passo 1 do job o marcaria not_sent/missed e a família seria avisada de um
// alarme que o servidor já tinha desistido de cobrar.
describe("getExpiredPendingEvents ignora o que sobrou de conta pausada", () => {
  it("exclui o pendente cujo horário é DEPOIS do início da pausa; os anteriores seguem a escada", async () => {
    selectResults = [[]];

    await getExpiredPendingEvents(5);

    const { sql } = render(selectWheres[0]);
    expect(sql).toContain("`alarm_events`.`status` = ?");
    expect(sql).toContain("`alarm_events`.`scheduledAt` <= ?");
    expect(sql).toContain("not exists (select 1 from `account_liveness`");
    expect(sql).toContain("`account_liveness`.`openId` = `alarm_events`.`openId`");
    expect(sql).toContain("`account_liveness`.`dmsPausedReason` is not null");
    expect(sql).toContain("`account_liveness`.`dmsPausedAt` < `alarm_events`.`scheduledAt`");
  });
});

// Se estes falharem, a Tarefa 8 deixou de limpar a pausa: o idoso voltaria a
// dar sinal e continuaria sem pré-registro nem aviso, com o switch desarmado.
describe("qualquer sinal do aparelho retoma a pausa", () => {
  const writes = () => [...upserts.map((u) => u.set), ...updates.map((u) => u.values)];
  const clearsPause = (w: Record<string, unknown>) =>
    w.dmsPausedReason === null && w.dmsPausedAt === null && w.pauseNoticeSentAt === null;

  it("heartbeat limpa motivo, hora e aviso da pausa", async () => {
    await recordHeartbeat("maria");

    expect(writes().some(clearsPause)).toBe(true);
  });

  it("touchLiveness atualiza lastSeenAt e limpa a pausa", async () => {
    await touchLiveness("maria");

    expect(writes().some(clearsPause)).toBe(true);
    expect(writes().some((w) => w.lastSeenAt instanceof Date)).toBe(true);
  });
});
