/**
 * Passo 2 do monitoring-job (escada 30 min / 2 h / 6 h) mede a idade do evento
 * sem resposta. Check-in só vira 'missed' em scheduledAt + grace + folga do
 * servidor; ancorar em scheduledAt fazia o aviso genérico sair junto com a
 * escalação do check-in (duas mensagens). Check-in ancora no prazo; remédio e o
 * 'checkin-daily' legado seguem ancorados em scheduledAt.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { warningAnchor } from "../server/_core/event-kind";

let rows: Array<{ openId: string; scheduledAt: Date; kind: string | null; graceMinutes: number | null }> = [];
let dbAvailable = true;

const fakeDb = {
  select: () => {
    const chain: any = {
      from: () => chain,
      where: () => Promise.resolve(rows),
    };
    return chain;
  },
};

vi.mock("../server/db", () => ({
  getDb: vi.fn(async () => (dbAvailable ? fakeDb : null)),
}));

import { getAccountsWithUnconfirmedEvents } from "../server/db-monitoring";

const MIN = 60_000;
const T0 = new Date("2026-10-03T08:00:00Z");

beforeEach(() => {
  rows = [];
  dbAvailable = true;
});

describe("warningAnchor", () => {
  it("check-in: scheduledAt + grace + folga do servidor", () => {
    expect(warningAnchor({ scheduledAt: T0, kind: "checkin", graceMinutes: 30 }).getTime()).toBe(T0.getTime() + 32 * MIN);
  });
  it("remédio: scheduledAt", () => {
    expect(warningAnchor({ scheduledAt: T0, kind: "medication", graceMinutes: 30 }).getTime()).toBe(T0.getTime());
    expect(warningAnchor({ scheduledAt: T0, kind: null, graceMinutes: 5 }).getTime()).toBe(T0.getTime());
  });
});

describe("getAccountsWithUnconfirmedEvents: âncora por tipo", () => {
  it("check-in com prazo 30 que acabou de virar missed (+32 min) tem idade 0 no Passo 2", async () => {
    rows = [{ openId: "u1", scheduledAt: T0, kind: "checkin", graceMinutes: 30 }];
    const [acc] = await getAccountsWithUnconfirmedEvents(24);
    const ageHours = (T0.getTime() + 32 * MIN - acc.oldestUnconfirmedAt.getTime()) / 3_600_000;
    expect(ageHours).toBe(0);
  });
  it("remédio em +31 min mantém a âncora em scheduledAt (idade >= 0,5 h)", async () => {
    rows = [{ openId: "u1", scheduledAt: T0, kind: "medication", graceMinutes: 5 }];
    const [acc] = await getAccountsWithUnconfirmedEvents(24);
    expect(acc.oldestUnconfirmedAt.getTime()).toBe(T0.getTime());
    expect((T0.getTime() + 31 * MIN - acc.oldestUnconfirmedAt.getTime()) / 3_600_000).toBeGreaterThanOrEqual(0.5);
  });
  it("'checkin-daily' legado (kind nulo) mantém a âncora em scheduledAt", async () => {
    rows = [{ openId: "u1", scheduledAt: T0, kind: null, graceMinutes: null }];
    const [acc] = await getAccountsWithUnconfirmedEvents(24);
    expect(acc.oldestUnconfirmedAt.getTime()).toBe(T0.getTime());
  });
  it("pega o MAIS antigo por conta", async () => {
    rows = [
      { openId: "u1", scheduledAt: new Date(T0.getTime() + 60 * MIN), kind: "medication", graceMinutes: null },
      { openId: "u1", scheduledAt: T0, kind: "checkin", graceMinutes: 30 },
      { openId: "u2", scheduledAt: T0, kind: null, graceMinutes: null },
    ];
    const res = await getAccountsWithUnconfirmedEvents(24);
    expect(res.find((r) => r.openId === "u1")!.oldestUnconfirmedAt.getTime()).toBe(T0.getTime() + 32 * MIN);
    expect(res.find((r) => r.openId === "u2")!.oldestUnconfirmedAt.getTime()).toBe(T0.getTime());
    expect(res).toHaveLength(2);
  });
  it("sem DB: lança (fail-closed)", async () => {
    dbAvailable = false;
    await expect(getAccountsWithUnconfirmedEvents(24)).rejects.toThrow("DATABASE_UNAVAILABLE");
  });
});
