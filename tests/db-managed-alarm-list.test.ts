/**
 * db-managed-alarm-list.test.ts
 *
 * A lista gerenciada no banco (server/db-managed-alarm-list.ts), rodando as
 * funções de verdade contra o MySQL em memória de tests/_fake-mysql.ts:
 *  - gravação do cuidador com versão (duas gravações em cima da mesma versão não
 *    se sobrescrevem);
 *  - confirmação do celular (`ack`): só vale a versão atual e só uma vez, e
 *    `appliedAlarms` é a lista DAQUELA versão;
 *  - a notificação visível de reserva (10 minutos sem confirmação, uma por versão).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeMysql } from "./_fake-mysql";

let fake = new FakeMysql();
let dbAvailable = true;

vi.mock("../server/db", () => ({
  getDb: vi.fn(async () => (dbAvailable ? fake : null)),
}));

import {
  getListsNeedingVisibleNotice,
  getManagedList,
  ManagedListConflictError,
  markVisibleNoticeSent,
  recordManagedAck,
  writeManagedList,
} from "../server/db-managed-alarm-list";
import type { ManagedAlarm } from "../shared/managed-alarm";

const T0 = new Date("2026-10-08T12:00:00.000Z");
const MIN = 60_000;

const alarm = (over: Partial<ManagedAlarm> = {}): ManagedAlarm => ({
  id: "a1",
  time: "08:00",
  description: "Losartana",
  enabled: true,
  repeat: "daily",
  customDays: [],
  sound: true,
  vibration: true,
  kind: "medication",
  ...over,
});

const A1 = alarm();
const A2 = alarm({ id: "a2", time: "20:00", description: "Metformina" });
const A3 = alarm({ id: "a3", time: "12:00", description: "Omeprazol" });

/** Lista do idoso já ativada: versão 1 confirmada, com [A1]. */
function seedList(over: Record<string, unknown> = {}) {
  fake.seed("managed_alarm_lists", [
    {
      id: 1,
      monitoredOpenId: "maria",
      version: 1,
      alarms: [A1],
      appliedVersion: 1,
      appliedAlarms: [A1],
      failedAlarmIds: [],
      appliedAt: T0,
      updatedByOpenId: "maria",
      updatedAt: T0,
      visibleNoticeSentForVersion: 0,
      ...over,
    },
  ]);
}

const listOf = (monitored = "maria") => fake.rows("managed_alarm_lists").find((l) => l.monitoredOpenId === monitored)!;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
  fake = new FakeMysql();
  dbAvailable = true;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("getManagedList", () => {
  it("devolve a linha do idoso, ou null se ele não tem lista", async () => {
    seedList();
    expect(await getManagedList("maria")).toMatchObject({ version: 1, alarms: [A1] });
    expect(await getManagedList("joao")).toBeNull();
  });

  it("sem banco, devolve null", async () => {
    dbAvailable = false;
    expect(await getManagedList("maria")).toBeNull();
  });
});

describe("writeManagedList", () => {
  it("grava em cima da versão que o cuidador via: sobe a versão e guarda quem gravou", async () => {
    seedList();

    const version = await writeManagedList("maria", 1, [A1, A2], "ana");

    expect(version).toBe(2);
    expect(listOf()).toMatchObject({ version: 2, alarms: [A1, A2], updatedByOpenId: "ana" });
  });

  it("não mexe no que o celular confirmou", async () => {
    seedList();

    await writeManagedList("maria", 1, [A1, A2], "ana");

    expect(listOf()).toMatchObject({ appliedVersion: 1, appliedAlarms: [A1], failedAlarmIds: [] });
  });

  it("updatedAt passa a ser a hora da gravação", async () => {
    seedList();
    vi.setSystemTime(new Date(T0.getTime() + 5 * MIN));

    await writeManagedList("maria", 1, [A1, A2], "ana");

    expect(listOf().updatedAt).toEqual(new Date(T0.getTime() + 5 * MIN));
  });

  it("versão velha: ManagedListConflictError e a lista não muda", async () => {
    seedList({ version: 3, appliedVersion: 3, alarms: [A1, A2], appliedAlarms: [A1, A2] });

    const err = await writeManagedList("maria", 2, [A3], "ana").catch((e) => e);

    expect(err).toBeInstanceOf(ManagedListConflictError);
    expect(listOf()).toMatchObject({ version: 3, alarms: [A1, A2] });
  });

  it("versão do futuro também é conflito", async () => {
    seedList();
    await expect(writeManagedList("maria", 5, [A3], "ana")).rejects.toBeInstanceOf(ManagedListConflictError);
    expect(listOf().version).toBe(1);
  });

  it("idoso sem lista: conflito (não cria lista do nada)", async () => {
    await expect(writeManagedList("maria", 1, [A1], "ana")).rejects.toBeInstanceOf(ManagedListConflictError);
    expect(fake.rows("managed_alarm_lists")).toHaveLength(0);
  });

  it("só grava a lista do idoso pedido", async () => {
    seedList();
    fake.seed("managed_alarm_lists", [
      {
        id: 2,
        monitoredOpenId: "joao",
        version: 1,
        alarms: [],
        appliedVersion: 1,
        appliedAlarms: [],
        failedAlarmIds: [],
        appliedAt: T0,
        updatedByOpenId: "joao",
        updatedAt: T0,
        visibleNoticeSentForVersion: 0,
      },
    ]);

    await writeManagedList("maria", 1, [A1, A2], "ana");

    expect(listOf("joao")).toMatchObject({ version: 1, alarms: [] });
  });

  it("CORRIDA: duas gravações em cima da mesma versão, só uma vence e a outra não sobrescreve", async () => {
    seedList();

    const results = await Promise.allSettled([
      writeManagedList("maria", 1, [A1, A2], "ana"),
      writeManagedList("maria", 1, [A1, A3], "bia"),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const lost = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(lost.reason).toBeInstanceOf(ManagedListConflictError);
    expect(listOf().version).toBe(2);
  });

  it("sem banco, lança DATABASE_UNAVAILABLE", async () => {
    dbAvailable = false;
    await expect(writeManagedList("maria", 1, [A1], "ana")).rejects.toThrow("DATABASE_UNAVAILABLE");
  });
});

describe("recordManagedAck", () => {
  it("confirma a versão atual: appliedAlarms vira a lista daquela versão e guarda as falhas", async () => {
    seedList();
    await writeManagedList("maria", 1, [A1, A2], "ana"); // v2
    vi.setSystemTime(new Date(T0.getTime() + 3 * MIN));

    const recorded = await recordManagedAck("maria", 2, ["a2"]);

    expect(recorded).toBe(true);
    expect(listOf()).toMatchObject({
      version: 2,
      appliedVersion: 2,
      appliedAlarms: [A1, A2],
      failedAlarmIds: ["a2"],
    });
    expect(listOf().appliedAt).toEqual(new Date(T0.getTime() + 3 * MIN));
  });

  it("não mexe em updatedAt (é a hora da gravação do cuidador, não da confirmação)", async () => {
    seedList();
    vi.setSystemTime(new Date(T0.getTime() + 1 * MIN));
    await writeManagedList("maria", 1, [A1, A2], "ana");
    const gravouEm = listOf().updatedAt;
    vi.setSystemTime(new Date(T0.getTime() + 9 * MIN));

    await recordManagedAck("maria", 2, []);

    expect(listOf().updatedAt).toEqual(gravouEm);
  });

  it("guarda cada id de falha uma vez só", async () => {
    seedList();
    await writeManagedList("maria", 1, [A1, A2], "ana");

    await recordManagedAck("maria", 2, ["a2", "a2", "a1"]);

    expect(listOf().failedAlarmIds).toEqual(["a2", "a1"]);
  });

  it("ack de versão antiga (já superada) é ignorado: nada muda", async () => {
    seedList();
    await writeManagedList("maria", 1, [A1, A2], "ana"); // v2
    await writeManagedList("maria", 2, [A1, A2, A3], "ana"); // v3

    const recorded = await recordManagedAck("maria", 2, ["a2"]);

    expect(recorded).toBe(false);
    expect(listOf()).toMatchObject({ version: 3, appliedVersion: 1, appliedAlarms: [A1], failedAlarmIds: [] });
  });

  it("ack de versão que ainda não existe é ignorado", async () => {
    seedList();
    expect(await recordManagedAck("maria", 9, [])).toBe(false);
    expect(listOf().appliedVersion).toBe(1);
  });

  it("ack repetido da mesma versão é ignorado e não troca as falhas já gravadas", async () => {
    seedList();
    await writeManagedList("maria", 1, [A1, A2], "ana");
    await recordManagedAck("maria", 2, ["a2"]);

    const again = await recordManagedAck("maria", 2, []);

    expect(again).toBe(false);
    expect(listOf().failedAlarmIds).toEqual(["a2"]);
  });

  it("ack de versão menor ou igual à já confirmada é ignorado", async () => {
    seedList({ version: 4, appliedVersion: 4, alarms: [A1, A2], appliedAlarms: [A1, A2] });
    expect(await recordManagedAck("maria", 3, [])).toBe(false);
    expect(await recordManagedAck("maria", 4, [])).toBe(false);
  });

  it("appliedAlarms fica com a lista da versão confirmada mesmo que o cuidador grave de novo depois", async () => {
    seedList();
    await writeManagedList("maria", 1, [A1, A2], "ana"); // v2
    await recordManagedAck("maria", 2, []);

    await writeManagedList("maria", 2, [A1, A2, A3], "ana"); // v3

    expect(listOf()).toMatchObject({ version: 3, appliedVersion: 2, appliedAlarms: [A1, A2] });
  });

  it("idoso sem lista: false", async () => {
    expect(await recordManagedAck("maria", 1, [])).toBe(false);
  });

  it("só confirma a lista do idoso pedido", async () => {
    seedList();
    await writeManagedList("maria", 1, [A1, A2], "ana");

    expect(await recordManagedAck("joao", 2, [])).toBe(false);
    expect(listOf().appliedVersion).toBe(1);
  });

  it("sem banco, lança DATABASE_UNAVAILABLE", async () => {
    dbAvailable = false;
    await expect(recordManagedAck("maria", 2, [])).rejects.toThrow("DATABASE_UNAVAILABLE");
  });
});

describe("notificação visível de reserva", () => {
  const pending = (over: Record<string, unknown> = {}) => ({
    monitoredOpenId: "maria",
    version: 3,
    appliedVersion: 2,
    visibleNoticeSentForVersion: 0,
    updatedAt: new Date(T0.getTime() - 11 * MIN),
    ...over,
  });

  const seedMany = (rows: Array<Record<string, unknown>>) =>
    fake.seed(
      "managed_alarm_lists",
      rows.map((r, i) => ({
        id: i + 1,
        alarms: [],
        appliedAlarms: [],
        failedAlarmIds: [],
        appliedAt: T0,
        updatedByOpenId: "ana",
        ...r,
      })),
    );

  it("lista quem está há mais de 10 min sem confirmar e ainda não foi avisado dessa versão", async () => {
    seedMany([pending()]);

    const lists = await getListsNeedingVisibleNotice(T0);

    expect(lists.map((l) => l.monitoredOpenId)).toEqual(["maria"]);
  });

  it("não lista: dentro dos 10 min, exatamente 10 min, já confirmada, já avisada dessa versão", async () => {
    seedMany([
      pending({ monitoredOpenId: "recente", updatedAt: new Date(T0.getTime() - 5 * MIN) }),
      pending({ monitoredOpenId: "dezMin", updatedAt: new Date(T0.getTime() - 10 * MIN) }),
      pending({ monitoredOpenId: "confirmada", appliedVersion: 3 }),
      pending({ monitoredOpenId: "avisada", visibleNoticeSentForVersion: 3 }),
    ]);

    expect(await getListsNeedingVisibleNotice(T0)).toEqual([]);
  });

  it("uma versão nova depois do aviso volta a ser listada", async () => {
    seedMany([pending({ version: 4, visibleNoticeSentForVersion: 3 })]);

    expect((await getListsNeedingVisibleNotice(T0)).map((l) => l.version)).toEqual([4]);
  });

  it("markVisibleNoticeSent grava a versão, sem mexer em updatedAt, e a lista deixa de ser pendente", async () => {
    seedMany([pending()]);
    const before = listOf().updatedAt;

    await markVisibleNoticeSent("maria", 3);

    expect(listOf().visibleNoticeSentForVersion).toBe(3);
    expect(listOf().updatedAt).toEqual(before);
    expect(await getListsNeedingVisibleNotice(T0)).toEqual([]);
  });

  it("markVisibleNoticeSent nunca volta atrás", async () => {
    seedMany([pending({ visibleNoticeSentForVersion: 4, version: 4 })]);

    await markVisibleNoticeSent("maria", 3);

    expect(listOf().visibleNoticeSentForVersion).toBe(4);
  });

  it("sem banco: a leitura devolve [] e a escrita lança", async () => {
    dbAvailable = false;
    expect(await getListsNeedingVisibleNotice(T0)).toEqual([]);
    await expect(markVisibleNoticeSent("maria", 3)).rejects.toThrow("DATABASE_UNAVAILABLE");
  });
});
