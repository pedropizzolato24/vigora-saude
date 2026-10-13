/**
 * db-monitoring-preregister.test.ts
 *
 * Consultas novas do pré-registro feito pelo servidor. As condições `where` são
 * renderizadas em SQL (MySqlDialect) para travar o que importa: quem entra
 * (idoso, não pausado, sinal nas últimas 48 h) e a janela de 120 min.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";

// Fila de resultados de SELECT, consumida na ordem em que as queries rodam.
let selectResults: unknown[][] = [];
const selectWheres: unknown[] = [];
const deleteWheres: unknown[] = [];
const inserts: Array<Record<string, unknown>> = [];

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
  update: () => ({ set: () => ({ where: () => Promise.resolve([{ affectedRows: 1 }]) }) }),
  delete: () => ({
    where: (condition: unknown) => {
      deleteWheres.push(condition);
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

import {
  deleteFuturePendingEvents,
  ensureServerAlarmEvent,
  findEventNear,
  getPreRegisterCandidates,
} from "../server/db-monitoring";

const dialect = new MySqlDialect();
const render = (condition: unknown) => dialect.sqlToQuery(condition as SQL);
const sqlDate = (d: Date) => d.toISOString().replace("T", " ").replace("Z", "");

const NOW = new Date("2026-10-10T12:00:00.000Z");

beforeEach(() => {
  selectResults = [];
  selectWheres.length = 0;
  deleteWheres.length = 0;
  inserts.length = 0;
});

describe("findEventNear", () => {
  it("procura evento do MESMO alarme dentro da janela, para os dois lados", async () => {
    selectResults = [[{ id: 5 }]];
    const at = new Date("2026-10-10T11:00:00.000Z");

    await expect(findEventNear("maria", "a1", at, 120)).resolves.toBe(true);

    const { sql, params } = render(selectWheres[0]);
    expect(sql).toContain("`alarm_events`.`openId` = ?");
    expect(sql).toContain("`alarm_events`.`alarmId` = ?");
    expect(sql).toContain("`alarm_events`.`scheduledAt` >= ?");
    expect(sql).toContain("`alarm_events`.`scheduledAt` <= ?");
    // Sem filtro de status: evento já resolvido também conta (a pessoa já respondeu).
    expect(sql).not.toContain("`alarm_events`.`status`");
    expect(params).toEqual([
      "maria",
      "a1",
      sqlDate(new Date("2026-10-10T09:00:00.000Z")),
      sqlDate(new Date("2026-10-10T13:00:00.000Z")),
    ]);
  });

  it("false quando não há evento por perto", async () => {
    selectResults = [[]];
    await expect(
      findEventNear("maria", "a1", new Date("2026-10-10T11:00:00.000Z"), 120)
    ).resolves.toBe(false);
  });
});

describe("ensureServerAlarmEvent", () => {
  const FUTURE = new Date(Date.now() + 3 * 60 * 60 * 1000);
  const base = {
    openId: "maria",
    alarmId: "a1",
    alarmDescription: "Losartana",
    scheduledAt: FUTURE,
    status: "pending" as const,
  };

  it("já existe evento do alarme dentro da janela: não cria um segundo", async () => {
    selectResults = [[{ id: 5 }]];

    await expect(ensureServerAlarmEvent(base, 120)).resolves.toBe("exists");

    expect(inserts).toHaveLength(0);
  });

  it("nenhum evento por perto: cria, com kind e graceMinutes do check-in", async () => {
    selectResults = [[], [], [], []]; // janela, pendente futuro, depois os dois SELECTs do createAlarmEvent

    await expect(
      ensureServerAlarmEvent({ ...base, kind: "checkin", graceMinutes: 15 }, 120)
    ).resolves.toBe("created");

    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({
      openId: "maria",
      alarmId: "a1",
      kind: "checkin",
      graceMinutes: 15,
      status: "pending",
    });
  });

  it("já existe pendente FUTURO do alarme em outro horário (>janela): não cria nem move", async () => {
    // janela vazia (o evento do celular está a 3 h), mas há pendente futuro do alarme
    selectResults = [[], [{ id: 9 }]];

    await expect(ensureServerAlarmEvent(base, 120)).resolves.toBe("exists");

    expect(inserts).toHaveLength(0);
    const { sql, params } = render(selectWheres[1]);
    expect(sql).toContain("`alarm_events`.`alarmId` = ?");
    expect(sql).toContain("`alarm_events`.`status` = ?");
    expect(sql).toContain("`alarm_events`.`scheduledAt` > ?");
    expect(params.slice(0, 3)).toEqual(["maria", "a1", "pending"]);
  });

  it("usa a janela recebida (a regra de 120 min vem de quem chama)", async () => {
    selectResults = [[{ id: 5 }]];

    await ensureServerAlarmEvent(base, 30);

    const { params } = render(selectWheres[0]);
    expect(params[2]).toBe(sqlDate(new Date(FUTURE.getTime() - 30 * 60_000)));
    expect(params[3]).toBe(sqlDate(new Date(FUTURE.getTime() + 30 * 60_000)));
  });
});

describe("getPreRegisterCandidates", () => {
  it("só idoso (não cuidador), não pausado, com sinal nas últimas 48 h", async () => {
    selectResults = [[]];

    await getPreRegisterCandidates(NOW);

    const { sql, params } = render(selectWheres[0]);
    expect(sql).toContain("`account_liveness`.`dmsPausedReason` is null");
    expect(sql).toContain("`account_liveness`.`lastSeenAt` >= ?");
    expect(sql).toContain("`users`.`userType` is null or `users`.`userType` <> ?");
    expect(params).toContain(sqlDate(new Date("2026-10-08T12:00:00.000Z")));
    expect(params).toContain("caregiver");
  });

  it("monta o candidato; conta gerenciada leva a lista confirmada, a comum leva managed null", async () => {
    selectResults = [
      [
        {
          openId: "maria",
          alarms: [{ id: "a1" }],
          timezone: "America/Rio_Branco",
          eventTimezone: "America/Manaus",
          managedOpenId: "maria",
          appliedAlarms: [{ id: "a1" }],
          failedAlarmIds: ["a2"],
        },
        {
          openId: "joao",
          alarms: null,
          timezone: null,
          eventTimezone: null,
          managedOpenId: null,
          appliedAlarms: null,
          failedAlarmIds: null,
        },
      ],
    ];

    const result = await getPreRegisterCandidates(NOW);

    expect(result).toEqual([
      {
        openId: "maria",
        alarms: [{ id: "a1" }],
        timezone: "America/Rio_Branco",
        eventTimezone: "America/Manaus",
        managed: { appliedAlarms: [{ id: "a1" }], failedAlarmIds: ["a2"] },
      },
      { openId: "joao", alarms: null, timezone: null, eventTimezone: null, managed: null },
    ]);
  });
});

describe("deleteFuturePendingEvents", () => {
  it("apaga só pendentes FUTUROS dos alarmes dados, da própria conta", async () => {
    await deleteFuturePendingEvents("maria", ["a2", "a3"], NOW);

    const { sql, params } = render(deleteWheres[0]);
    expect(sql).toContain("`alarm_events`.`openId` = ?");
    expect(sql).toContain("`alarm_events`.`alarmId` in (?, ?)");
    expect(sql).toContain("`alarm_events`.`status` = ?");
    expect(sql).toContain("`alarm_events`.`scheduledAt` > ?");
    expect(params).toEqual(["maria", "a2", "a3", "pending", sqlDate(NOW)]);
  });

  it("lista vazia não consulta o banco", async () => {
    await deleteFuturePendingEvents("maria", [], NOW);
    expect(deleteWheres).toHaveLength(0);
  });
});
