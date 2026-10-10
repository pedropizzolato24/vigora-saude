/**
 * db-alarm-management.test.ts
 *
 * O acordo "o cuidador cuida dos alarmes do idoso" no banco (server/db-alarm-management.ts),
 * rodando as funções de verdade contra o MySQL em memória de tests/_fake-mysql.ts.
 *
 * O ponto delicado é a regra "um pedido pendente ou acordo ativo por idoso", que o
 * esquema não impõe (a migração só adiciona): quem a garante é a transação com a
 * linha do idoso travada. Os testes de corrida abaixo só passam se essa trava
 * existir de fato.
 */
import { TRPCError } from "@trpc/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeMysql } from "./_fake-mysql";

let fake = new FakeMysql();
let dbAvailable = true;

vi.mock("../server/db", () => ({
  getDb: vi.fn(async () => (dbAvailable ? fake : null)),
}));

import {
  activateManagement,
  createManagementRequest,
  endManagement,
  getActiveManagementForMonitored,
  getExpiredManagementRequests,
  getManagementHistory,
  getOpenManagementForCaregiver,
  getOpenManagementForMonitored,
} from "../server/db-alarm-management";
import type { ManagedAlarm } from "../shared/managed-alarm";

const NOW = new Date("2026-10-08T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

const agreement = (over: Record<string, unknown> = {}) => ({
  id: 1,
  monitoredOpenId: "maria",
  caregiverOpenId: "ana",
  status: "pending",
  endedReason: null,
  requestedAt: new Date(NOW.getTime() - 60_000),
  respondedAt: null,
  endedAt: null,
  ...over,
});

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

const agreementsOf = (monitored: string) =>
  fake.rows("alarm_management").filter((r) => r.monitoredOpenId === monitored);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  fake = new FakeMysql();
  dbAvailable = true;
  fake.seed("users", [
    { id: 1, openId: "maria" },
    { id: 2, openId: "joao" },
    { id: 3, openId: "ana" },
    { id: 4, openId: "bia" },
  ]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createManagementRequest", () => {
  it("cria o pedido pendente, sem resposta nem motivo de encerramento", async () => {
    const row = await createManagementRequest("ana", "maria");

    expect(row).toMatchObject({
      monitoredOpenId: "maria",
      caregiverOpenId: "ana",
      status: "pending",
      endedReason: null,
      respondedAt: null,
      endedAt: null,
    });
    expect(row.requestedAt).toEqual(NOW);
    expect(agreementsOf("maria")).toHaveLength(1);
  });

  it("trava a linha do idoso ANTES de olhar e gravar o pedido", async () => {
    await createManagementRequest("ana", "maria");

    const log = fake.log;
    expect(log.indexOf("select users for update")).toBeGreaterThanOrEqual(0);
    expect(log.indexOf("select users for update")).toBeLessThan(log.indexOf("insert alarm_management"));
  });

  it("CONFLICT quando já existe pedido pendente do idoso (de qualquer cuidador)", async () => {
    fake.seed("alarm_management", [agreement({ caregiverOpenId: "bia" })]);

    const err = await createManagementRequest("ana", "maria").catch((e) => e);

    expect(err).toBeInstanceOf(TRPCError);
    expect(err.code).toBe("CONFLICT");
    expect(err.message).toBe("Já existe um pedido ou acordo para esta pessoa.");
    expect(agreementsOf("maria")).toHaveLength(1);
  });

  it("CONFLICT quando já existe acordo ativo", async () => {
    fake.seed("alarm_management", [agreement({ status: "active", respondedAt: NOW })]);

    await expect(createManagementRequest("bia", "maria")).rejects.toMatchObject({ code: "CONFLICT" });
    expect(agreementsOf("maria")).toHaveLength(1);
  });

  it("depois que o acordo termina, um pedido novo é permitido e o histórico fica", async () => {
    fake.seed("alarm_management", [
      agreement({ status: "ended", endedReason: "declined", endedAt: NOW, respondedAt: NOW }),
    ]);

    const row = await createManagementRequest("ana", "maria");

    expect(row.id).toBe(2);
    expect(agreementsOf("maria").map((r) => r.status)).toEqual(["ended", "pending"]);
  });

  it("idosos diferentes não se atrapalham", async () => {
    await createManagementRequest("ana", "maria");
    await expect(createManagementRequest("bia", "joao")).resolves.toMatchObject({ monitoredOpenId: "joao" });
  });

  it("CORRIDA: dois pedidos ao mesmo tempo para o mesmo idoso, só um nasce", async () => {
    const results = await Promise.allSettled([
      createManagementRequest("ana", "maria"),
      createManagementRequest("bia", "maria"),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(TRPCError);
    expect(rejected.reason.code).toBe("CONFLICT");
    expect(agreementsOf("maria")).toHaveLength(1);
  });

  it("sem banco, lança DATABASE_UNAVAILABLE", async () => {
    dbAvailable = false;
    await expect(createManagementRequest("ana", "maria")).rejects.toThrow("DATABASE_UNAVAILABLE");
  });
});

describe("leituras", () => {
  beforeEach(() => {
    fake.seed("alarm_management", [
      agreement({ id: 1, status: "ended", endedReason: "stopped_by_monitored", endedAt: NOW }),
      agreement({ id: 2, caregiverOpenId: "bia", status: "active", respondedAt: NOW }),
      agreement({ id: 3, monitoredOpenId: "joao", caregiverOpenId: "ana", status: "pending" }),
    ]);
  });

  it("getOpenManagementForMonitored devolve o pedido/acordo aberto e ignora os encerrados", async () => {
    expect(await getOpenManagementForMonitored("maria")).toMatchObject({ id: 2, status: "active" });
    expect(await getOpenManagementForMonitored("joao")).toMatchObject({ id: 3, status: "pending" });
    expect(await getOpenManagementForMonitored("ninguem")).toBeNull();
  });

  it("getOpenManagementForMonitored: só encerrado = null", async () => {
    fake = new FakeMysql();
    fake.seed("alarm_management", [agreement({ status: "ended", endedReason: "cancelled", endedAt: NOW })]);
    expect(await getOpenManagementForMonitored("maria")).toBeNull();
  });

  it("getActiveManagementForMonitored só devolve acordo ATIVO (pedido pendente não conta)", async () => {
    expect(await getActiveManagementForMonitored("maria")).toMatchObject({ id: 2 });
    expect(await getActiveManagementForMonitored("joao")).toBeNull();
  });

  it("getOpenManagementForCaregiver devolve o que ESTE cuidador abriu", async () => {
    expect(await getOpenManagementForCaregiver("bia")).toMatchObject({ id: 2 });
    expect(await getOpenManagementForCaregiver("ana")).toMatchObject({ id: 3 });
    expect(await getOpenManagementForCaregiver("carol")).toBeNull();
  });

  it("sem banco as leituras devolvem vazio", async () => {
    dbAvailable = false;
    expect(await getOpenManagementForMonitored("maria")).toBeNull();
    expect(await getActiveManagementForMonitored("maria")).toBeNull();
    expect(await getOpenManagementForCaregiver("ana")).toBeNull();
    expect(await getExpiredManagementRequests(NOW)).toEqual([]);
    expect(await getManagementHistory("maria")).toEqual([]);
  });
});

describe("activateManagement", () => {
  it("o pedido vira ativo e nasce a lista gerenciada na versão 1, já confirmada", async () => {
    fake.seed("alarm_management", [agreement()]);
    const list = [alarm(), alarm({ id: "a2", time: "20:00", description: "Metformina" })];

    await activateManagement(1, list, "maria");

    expect(agreementsOf("maria")[0]).toMatchObject({ status: "active", endedReason: null });
    expect(agreementsOf("maria")[0].respondedAt).toEqual(NOW);
    const [row] = fake.rows("managed_alarm_lists");
    expect(row).toMatchObject({
      monitoredOpenId: "maria",
      version: 1,
      appliedVersion: 1,
      failedAlarmIds: [],
      updatedByOpenId: "maria",
      visibleNoticeSentForVersion: 0,
    });
    expect(row.alarms).toEqual(list);
    expect(row.appliedAlarms).toEqual(list);
    expect(row.appliedAt).toEqual(NOW);
  });

  it("aceita com a lista vazia (o idoso ainda não tem alarmes)", async () => {
    fake.seed("alarm_management", [agreement()]);

    await activateManagement(1, [], "maria");

    expect(fake.rows("managed_alarm_lists")[0].alarms).toEqual([]);
  });

  it("CONFLICT se o pedido já não está pendente (cancelado ou vencido enquanto o idoso lia)", async () => {
    fake.seed("alarm_management", [
      agreement({ status: "ended", endedReason: "cancelled", endedAt: NOW }),
    ]);

    await expect(activateManagement(1, [alarm()], "maria")).rejects.toMatchObject({ code: "CONFLICT" });
    expect(fake.rows("managed_alarm_lists")).toHaveLength(0);
    expect(agreementsOf("maria")[0].status).toBe("ended");
  });

  it("não ativa pedido de OUTRO idoso, mesmo sabendo o id", async () => {
    fake.seed("alarm_management", [agreement({ id: 7, monitoredOpenId: "joao" })]);

    await expect(activateManagement(7, [alarm()], "maria")).rejects.toMatchObject({ code: "CONFLICT" });
    expect(fake.rows("alarm_management")[0].status).toBe("pending");
    expect(fake.rows("managed_alarm_lists")).toHaveLength(0);
  });

  it("é tudo ou nada: se a lista não pode ser criada, o pedido continua pendente", async () => {
    fake.seed("alarm_management", [agreement()]);
    // Sobra de uma lista antiga do mesmo idoso: a coluna é única, o insert falha.
    fake.seed("managed_alarm_lists", [
      {
        id: 1,
        monitoredOpenId: "maria",
        version: 9,
        alarms: [],
        appliedVersion: 9,
        appliedAlarms: [],
        failedAlarmIds: [],
        appliedAt: NOW,
        updatedByOpenId: "ana",
        updatedAt: NOW,
        visibleNoticeSentForVersion: 0,
      },
    ]);

    await expect(activateManagement(1, [alarm()], "maria")).rejects.toThrow(/Duplicate/);
    expect(agreementsOf("maria")[0]).toMatchObject({ status: "pending", respondedAt: null });
  });

  it("CORRIDA: aceitar e cancelar ao mesmo tempo nunca deixa acordo sem lista nem lista sem acordo", async () => {
    fake.seed("alarm_management", [agreement()]);

    await Promise.allSettled([activateManagement(1, [alarm()], "maria"), endManagement(1, "cancelled")]);

    const [row] = agreementsOf("maria");
    const lists = fake.rows("managed_alarm_lists");
    if (row.status === "active") {
      expect(lists).toHaveLength(1);
    } else {
      expect(row).toMatchObject({ status: "ended", endedReason: "cancelled" });
      expect(lists).toHaveLength(0);
    }
  });
});

describe("endManagement", () => {
  const reasons = [
    "expired",
    "cancelled",
    "stopped_by_monitored",
    "stopped_by_caregiver",
    "unlinked",
    "account_deleted",
  ] as const;

  it.each(reasons)("encerra com o motivo %s, marca a hora e apaga a lista do idoso", async (reason) => {
    fake.seed("alarm_management", [agreement({ status: "active", respondedAt: new Date(NOW.getTime() - DAY) })]);
    await seedList("maria");

    await endManagement(1, reason);

    expect(agreementsOf("maria")[0]).toMatchObject({ status: "ended", endedReason: reason });
    expect(agreementsOf("maria")[0].endedAt).toEqual(NOW);
    // respondedAt do aceite continua; só a recusa o preenche no encerramento.
    expect(agreementsOf("maria")[0].respondedAt).toEqual(new Date(NOW.getTime() - DAY));
    expect(fake.rows("managed_alarm_lists")).toHaveLength(0);
  });

  it("recusa: grava respondedAt junto do encerramento", async () => {
    fake.seed("alarm_management", [agreement()]);

    await endManagement(1, "declined");

    expect(agreementsOf("maria")[0]).toMatchObject({ status: "ended", endedReason: "declined" });
    expect(agreementsOf("maria")[0].respondedAt).toEqual(NOW);
  });

  it("não mexe nas listas dos OUTROS idosos", async () => {
    fake.seed("alarm_management", [agreement({ status: "active" })]);
    await seedList("maria");
    await seedList("joao", 2);

    await endManagement(1, "stopped_by_monitored");

    expect(fake.rows("managed_alarm_lists").map((l) => l.monitoredOpenId)).toEqual(["joao"]);
  });

  it("é idempotente: acordo já encerrado mantém o motivo original", async () => {
    fake.seed("alarm_management", [agreement({ status: "active" })]);
    await endManagement(1, "stopped_by_caregiver");

    await endManagement(1, "unlinked");

    expect(agreementsOf("maria")[0].endedReason).toBe("stopped_by_caregiver");
  });

  it("encerrar um acordo VELHO não apaga a lista do acordo novo do mesmo idoso", async () => {
    fake.seed("alarm_management", [
      agreement({ id: 1, status: "ended", endedReason: "cancelled", endedAt: NOW }),
      agreement({ id: 2, caregiverOpenId: "bia", status: "active" }),
    ]);
    await seedList("maria");

    await endManagement(1, "unlinked");

    expect(fake.rows("managed_alarm_lists")).toHaveLength(1);
    expect(agreementsOf("maria").find((r) => r.id === 2)?.status).toBe("active");
  });

  it("id que não existe: não faz nada e não lança", async () => {
    await expect(endManagement(99, "cancelled")).resolves.toBeUndefined();
  });

  it("sem banco, lança DATABASE_UNAVAILABLE", async () => {
    dbAvailable = false;
    await expect(endManagement(1, "cancelled")).rejects.toThrow("DATABASE_UNAVAILABLE");
  });

  async function seedList(monitoredOpenId: string, id = 1) {
    fake.seed("managed_alarm_lists", [
      {
        id,
        monitoredOpenId,
        version: 1,
        alarms: [],
        appliedVersion: 1,
        appliedAlarms: [],
        failedAlarmIds: [],
        appliedAt: NOW,
        updatedByOpenId: monitoredOpenId,
        updatedAt: NOW,
        visibleNoticeSentForVersion: 0,
      },
    ]);
  }
});

describe("getExpiredManagementRequests", () => {
  it("devolve só pedidos PENDENTES com mais de 7 dias", async () => {
    fake.seed("alarm_management", [
      agreement({ id: 1, requestedAt: new Date(NOW.getTime() - 8 * DAY) }),
      agreement({ id: 2, monitoredOpenId: "joao", requestedAt: new Date(NOW.getTime() - 6 * DAY) }),
      agreement({ id: 3, monitoredOpenId: "ana", status: "active", requestedAt: new Date(NOW.getTime() - 30 * DAY) }),
      agreement({
        id: 4,
        monitoredOpenId: "bia",
        status: "ended",
        endedReason: "declined",
        requestedAt: new Date(NOW.getTime() - 30 * DAY),
      }),
    ]);

    const expired = await getExpiredManagementRequests(NOW);

    expect(expired.map((r) => r.id)).toEqual([1]);
  });

  it("exatamente 7 dias ainda não venceu; um segundo a mais venceu", async () => {
    fake.seed("alarm_management", [
      agreement({ id: 1, requestedAt: new Date(NOW.getTime() - 7 * DAY) }),
      agreement({ id: 2, monitoredOpenId: "joao", requestedAt: new Date(NOW.getTime() - 7 * DAY - 1000) }),
    ]);

    expect((await getExpiredManagementRequests(NOW)).map((r) => r.id)).toEqual([2]);
  });
});

describe("getManagementHistory", () => {
  it("junta o que a conta tem como idoso E como cuidador, mais recente primeiro", async () => {
    fake.seed("alarm_management", [
      agreement({ id: 1, monitoredOpenId: "maria", caregiverOpenId: "ana", status: "ended", endedReason: "declined" }),
      agreement({ id: 2, monitoredOpenId: "joao", caregiverOpenId: "maria" }),
      agreement({ id: 3, monitoredOpenId: "joao", caregiverOpenId: "bia" }),
      agreement({ id: 4, monitoredOpenId: "maria", caregiverOpenId: "bia" }),
    ]);

    expect((await getManagementHistory("maria")).map((r) => r.id)).toEqual([4, 2, 1]);
    expect((await getManagementHistory("ninguem")).map((r) => r.id)).toEqual([]);
  });
});
