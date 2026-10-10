/**
 * managed-alarms-list.test.ts
 *
 * A lista gerenciada pelo router `managedAlarms`: criar/editar/apagar pelo
 * cuidador do acordo e ack do celular do idoso. Foco em AUTORIZAÇÃO (IDOR),
 * conflito de versão, limite de 24 e ack de versão velha.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../server/db-alarm-management", async () => (await import("./_managed-alarms-fakes")).fakeManagementModule);
vi.mock("../server/db-managed-alarm-list", async () => (await import("./_managed-alarms-fakes")).fakeListModule);
vi.mock("../server/db-links", async () => (await import("./_managed-alarms-fakes")).fakeLinksModule);
vi.mock("../server/db-push", async () => (await import("./_managed-alarms-fakes")).fakePushDbModule);
vi.mock("../server/push", async () => (await import("./_managed-alarms-fakes")).fakePushModule);
vi.mock("../server/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../server/db")>()),
  ...(await import("./_managed-alarms-fakes")).fakeDbOverrides,
}));
vi.mock("../server/alarm-changes", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../server/alarm-changes")>()),
  recordCaregiverAlarmChanges: vi.fn(async () => undefined),
}));

import { appRouter } from "../server/routers";
import * as push from "../server/push";
import * as alarmChanges from "../server/alarm-changes";
import * as listDb from "../server/db-managed-alarm-list";
import {
  FakeManagedListConflictError,
  flush,
  makeCtx,
  resetStore,
  sampleAlarm,
  seedActiveAgreement,
  seedPendingRequest,
  store,
} from "./_managed-alarms-fakes";

const as = (openId: string) => appRouter.createCaller(makeCtx(openId));

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Alarme de remédio válido para o input (sem id: o servidor gera). */
const medInput = (over: Record<string, unknown> = {}) =>
  ({
    time: "09:30",
    description: "Metformina",
    enabled: true,
    repeat: "daily",
    sound: true,
    vibration: true,
    kind: "medication",
    ...over,
  }) as never;

const listOf = (monitoredOpenId: string) => store.lists.get(monitoredOpenId);

// O limite de 30 gravações/min vive na memória do processo e este arquivo grava
// bem mais que 30 vezes: cada teste roda numa janela de relógio nova (só o Date
// é falsificado; setImmediate e o resto seguem reais).
let relogio = Date.parse("2026-10-09T12:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  resetStore();
  vi.useFakeTimers({ toFake: ["Date"] });
  relogio += 5 * 60_000;
  vi.setSystemTime(relogio);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("managedAlarms.createAlarm", () => {
  it("o cuidador do acordo cria: sobe a versão, grava o autor e devolve a nova versão", async () => {
    seedActiveAgreement({ caregiverOpenId: "ana" });

    const result = await as("ana").managedAlarms.createAlarm({ baseVersion: 1, alarm: medInput() });

    expect(result).toEqual({ version: 2 });
    expect(listOf("maria")?.version).toBe(2);
    expect(listOf("maria")?.updatedByOpenId).toBe("ana");
    expect(listOf("maria")?.alarms).toHaveLength(2);
    expect(listOf("maria")?.alarms[1]).toMatchObject({ time: "09:30", description: "Metformina", enabled: true });
  });

  it("o id é um UUID do servidor; um id mandado pelo cliente é descartado", async () => {
    seedActiveAgreement({ caregiverOpenId: "ana" });

    await as("ana").managedAlarms.createAlarm({ baseVersion: 1, alarm: medInput({ id: "forcado-pelo-cliente" }) });

    const novo = listOf("maria")?.alarms[1];
    expect(novo?.id).toMatch(UUID);
    expect(novo?.id).not.toBe("forcado-pelo-cliente");
  });

  it("check-in é forçado a diário, mesmo que o cliente mande outra repetição", async () => {
    seedActiveAgreement({ caregiverOpenId: "ana" });

    await as("ana").managedAlarms.createAlarm({
      baseVersion: 1,
      alarm: medInput({
        kind: "checkin",
        repeat: "weekdays",
        time: "10:00",
        description: "Como você está?",
        escalateAfterMinutes: 10,
      }),
    });

    const checkin = listOf("maria")?.alarms[1];
    expect(checkin?.kind).toBe("checkin");
    expect(checkin?.repeat).toBe("daily");
  });

  it("remédio não leva escalateAfterMinutes", async () => {
    seedActiveAgreement({ caregiverOpenId: "ana" });

    await as("ana").managedAlarms.createAlarm({ baseVersion: 1, alarm: medInput({ escalateAfterMinutes: 10 }) });

    expect(listOf("maria")?.alarms[1].escalateAfterMinutes).toBeUndefined();
  });

  it("registra a criação com o cuidador como autor e manda o push silencioso ao idoso", async () => {
    seedActiveAgreement({ caregiverOpenId: "ana" });

    await as("ana").managedAlarms.createAlarm({ baseVersion: 1, alarm: medInput() });
    await flush();

    expect(alarmChanges.recordCaregiverAlarmChanges).toHaveBeenCalledWith({
      monitoredOpenId: "maria",
      authorOpenId: "ana",
      authorName: "Ana",
      personName: "Vó Maria",
      changes: [
        expect.objectContaining({
          changeType: "created",
          alarmDescription: "Metformina",
          oldTime: null,
          newTime: "09:30",
        }),
      ],
    });
    expect(push.sendExpoDataPush).toHaveBeenCalledTimes(1);
    expect(push.sendExpoDataPush).toHaveBeenCalledWith(["ExpoTok[maria]"], {
      type: "managed_alarms_updated",
      version: 2,
    });
  });

  it("o push silencioso não leva alarme nenhum, só o tipo e a versão", async () => {
    seedActiveAgreement({ caregiverOpenId: "ana" });

    await as("ana").managedAlarms.createAlarm({ baseVersion: 1, alarm: medInput({ description: "Segredo" }) });
    await flush();

    const [, data] = vi.mocked(push.sendExpoDataPush).mock.calls[0];
    expect(JSON.stringify(data)).not.toContain("Segredo");
    expect(Object.keys(data).sort()).toEqual(["type", "version"]);
  });

  it("falha no push ou no registro da mudança não desfaz a gravação nem derruba a resposta", async () => {
    seedActiveAgreement({ caregiverOpenId: "ana" });
    vi.mocked(push.sendExpoDataPush).mockRejectedValueOnce(new Error("rede"));
    vi.mocked(alarmChanges.recordCaregiverAlarmChanges).mockRejectedValueOnce(new Error("db"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    try {
      await expect(
        as("ana").managedAlarms.createAlarm({ baseVersion: 1, alarm: medInput() })
      ).resolves.toEqual({ version: 2 });
      await flush();
      expect(listOf("maria")?.version).toBe(2);
      expect(warn).toHaveBeenCalledTimes(2);
    } finally {
      warn.mockRestore();
    }
  });

  it("no limite de 24 alarmes, o 25º é BAD_REQUEST e a lista não muda", async () => {
    seedActiveAgreement({
      caregiverOpenId: "ana",
      alarms: Array.from({ length: 24 }, (_, i) => sampleAlarm({ id: `a${i}` })),
    });

    await expect(
      as("ana").managedAlarms.createAlarm({ baseVersion: 1, alarm: medInput() })
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: "Limite de 24 alarmes atingido." });
    expect(listOf("maria")?.alarms).toHaveLength(24);
    expect(listOf("maria")?.version).toBe(1);
    expect(push.sendExpoDataPush).not.toHaveBeenCalled();
  });

  it("com 23 alarmes o 24º entra", async () => {
    seedActiveAgreement({
      caregiverOpenId: "ana",
      alarms: Array.from({ length: 23 }, (_, i) => sampleAlarm({ id: `a${i}` })),
    });

    await expect(
      as("ana").managedAlarms.createAlarm({ baseVersion: 1, alarm: medInput() })
    ).resolves.toEqual({ version: 2 });
    expect(listOf("maria")?.alarms).toHaveLength(24);
  });

  it("remédios e check-ins contam juntos no limite", async () => {
    const mistos = Array.from({ length: 24 }, (_, i) =>
      i % 2 === 0 ? sampleAlarm({ id: `m${i}` }) : sampleAlarm({ id: `c${i}`, kind: "checkin", repeat: "daily" })
    );
    seedActiveAgreement({ caregiverOpenId: "ana", alarms: mistos });

    await expect(
      as("ana").managedAlarms.createAlarm({ baseVersion: 1, alarm: medInput({ kind: "checkin", escalateAfterMinutes: 5 }) })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("managedAlarms.createAlarm — validação (as regras do formulário)", () => {
  const invalidos: Array<[string, Record<string, unknown>]> = [
    ["horário sem dois dígitos", { time: "7:5" }],
    ["horário fora do relógio", { time: "25:00" }],
    ["repetição desconhecida", { repeat: "monthly" }],
    ["dias personalizados vazios", { repeat: "custom", customDays: [] }],
    ["dia personalizado fora de 0 a 6", { repeat: "custom", customDays: [7] }],
    ["nome com mais de 80 caracteres", { description: "x".repeat(81) }],
    ["atraso do check-in fora de 5/10/15/30", { kind: "checkin", escalateAfterMinutes: 7 }],
  ];

  it.each(invalidos)("rejeita %s e não grava nada", async (_nome, over) => {
    seedActiveAgreement({ caregiverOpenId: "ana" });

    await expect(
      as("ana").managedAlarms.createAlarm({ baseVersion: 1, alarm: medInput(over) })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(listOf("maria")?.version).toBe(1);
    expect(listDb.writeManagedList).not.toHaveBeenCalled();
  });

  it("aceita nome com exatamente 80 caracteres", async () => {
    seedActiveAgreement({ caregiverOpenId: "ana" });

    await expect(
      as("ana").managedAlarms.createAlarm({ baseVersion: 1, alarm: medInput({ description: "x".repeat(80) }) })
    ).resolves.toEqual({ version: 2 });
  });
});

describe("managedAlarms.updateAlarm", () => {
  it("muda o horário: mantém o id, sobe a versão e registra 'rescheduled' com os dois horários", async () => {
    seedActiveAgreement({ caregiverOpenId: "ana" }); // a1 às 08:00

    const result = await as("ana").managedAlarms.updateAlarm({
      baseVersion: 1,
      alarmId: "a1",
      alarm: medInput({ time: "09:30", description: "Losartana" }),
    });
    await flush();

    expect(result).toEqual({ version: 2 });
    expect(listOf("maria")?.alarms).toHaveLength(1);
    expect(listOf("maria")?.alarms[0]).toMatchObject({ id: "a1", time: "09:30" });
    expect(alarmChanges.recordCaregiverAlarmChanges).toHaveBeenCalledWith(
      expect.objectContaining({
        authorOpenId: "ana",
        changes: [
          expect.objectContaining({
            alarmId: "a1",
            changeType: "rescheduled",
            oldTime: "08:00",
            newTime: "09:30",
          }),
        ],
      })
    );
  });

  it("desligar o alarme registra 'disabled'", async () => {
    seedActiveAgreement({ caregiverOpenId: "ana" });

    await as("ana").managedAlarms.updateAlarm({
      baseVersion: 1,
      alarmId: "a1",
      alarm: medInput({ time: "08:00", description: "Losartana", enabled: false }),
    });
    await flush();

    expect(alarmChanges.recordCaregiverAlarmChanges).toHaveBeenCalledWith(
      expect.objectContaining({ changes: [expect.objectContaining({ changeType: "disabled" })] })
    );
  });

  it("mudar só o nome grava e avisa o idoso, mas não registra mudança de horário", async () => {
    seedActiveAgreement({ caregiverOpenId: "ana" });

    await as("ana").managedAlarms.updateAlarm({
      baseVersion: 1,
      alarmId: "a1",
      alarm: medInput({ time: "08:00", description: "Losartana 50mg" }),
    });
    await flush();

    expect(listOf("maria")?.alarms[0].description).toBe("Losartana 50mg");
    expect(push.sendExpoDataPush).toHaveBeenCalledTimes(1);
    expect(alarmChanges.recordCaregiverAlarmChanges).not.toHaveBeenCalled();
  });

  it("alarmId que não existe na lista do idoso: NOT_FOUND e nada é gravado", async () => {
    seedActiveAgreement({ caregiverOpenId: "ana" });

    await expect(
      as("ana").managedAlarms.updateAlarm({ baseVersion: 1, alarmId: "nao-existe", alarm: medInput() })
    ).rejects.toMatchObject({ code: "NOT_FOUND", message: "Alarme não encontrado." });
    expect(listDb.writeManagedList).not.toHaveBeenCalled();
  });
});

describe("managedAlarms.deleteAlarm", () => {
  it("apaga só o alarme pedido, sobe a versão e registra 'deleted'", async () => {
    seedActiveAgreement({
      caregiverOpenId: "ana",
      alarms: [sampleAlarm({ id: "a1" }), sampleAlarm({ id: "a2", time: "20:00", description: "Metformina" })],
    });

    const result = await as("ana").managedAlarms.deleteAlarm({ baseVersion: 1, alarmId: "a1" });
    await flush();

    expect(result).toEqual({ version: 2 });
    expect(listOf("maria")?.alarms.map((a) => a.id)).toEqual(["a2"]);
    expect(alarmChanges.recordCaregiverAlarmChanges).toHaveBeenCalledWith(
      expect.objectContaining({
        changes: [
          expect.objectContaining({ alarmId: "a1", changeType: "deleted", alarmDescription: "Losartana", oldTime: "08:00" }),
        ],
      })
    );
  });

  it("alarmId inexistente: NOT_FOUND", async () => {
    seedActiveAgreement({ caregiverOpenId: "ana" });

    await expect(
      as("ana").managedAlarms.deleteAlarm({ baseVersion: 1, alarmId: "nao-existe" })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(listOf("maria")?.alarms).toHaveLength(1);
  });

  it("apagar e editar continuam funcionando com a lista cheia (24)", async () => {
    seedActiveAgreement({
      caregiverOpenId: "ana",
      alarms: Array.from({ length: 24 }, (_, i) => sampleAlarm({ id: `a${i}` })),
    });

    await expect(as("ana").managedAlarms.deleteAlarm({ baseVersion: 1, alarmId: "a0" })).resolves.toEqual({
      version: 2,
    });
    await expect(
      as("ana").managedAlarms.updateAlarm({ baseVersion: 2, alarmId: "a1", alarm: medInput({ time: "11:00" }) })
    ).resolves.toEqual({ version: 3 });
  });
});

describe("conflito de versão (baseVersion)", () => {
  it("baseVersion velha: CONFLICT com a mensagem do app, nada é gravado nem enviado", async () => {
    seedActiveAgreement({ caregiverOpenId: "ana" });
    await as("ana").managedAlarms.createAlarm({ baseVersion: 1, alarm: medInput() }); // v2
    vi.clearAllMocks();

    const atrasado = { baseVersion: 1 };
    await expect(
      as("ana").managedAlarms.createAlarm({ ...atrasado, alarm: medInput({ time: "10:00" }) })
    ).rejects.toMatchObject({ code: "CONFLICT", message: "A lista mudou. Confira de novo." });
    await expect(
      as("ana").managedAlarms.updateAlarm({ ...atrasado, alarmId: "a1", alarm: medInput() })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      as("ana").managedAlarms.deleteAlarm({ ...atrasado, alarmId: "a1" })
    ).rejects.toMatchObject({ code: "CONFLICT" });

    expect(listOf("maria")?.version).toBe(2);
    expect(listOf("maria")?.alarms).toHaveLength(2);
    expect(listDb.writeManagedList).not.toHaveBeenCalled();
    expect(push.sendExpoDataPush).not.toHaveBeenCalled();
  });

  it("baseVersion do futuro também é conflito", async () => {
    seedActiveAgreement({ caregiverOpenId: "ana" });

    await expect(
      as("ana").managedAlarms.createAlarm({ baseVersion: 99, alarm: medInput() })
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("corrida: o banco recusa o UPDATE (versão mudou entre a leitura e a gravação) e vira o mesmo CONFLICT", async () => {
    seedActiveAgreement({ caregiverOpenId: "ana" });
    vi.mocked(listDb.writeManagedList).mockRejectedValueOnce(new FakeManagedListConflictError("corrida"));

    await expect(
      as("ana").managedAlarms.createAlarm({ baseVersion: 1, alarm: medInput() })
    ).rejects.toMatchObject({ code: "CONFLICT", message: "A lista mudou. Confira de novo." });
    expect(push.sendExpoDataPush).not.toHaveBeenCalled();
  });

  it("erro de banco que não é conflito NÃO vira CONFLICT", async () => {
    seedActiveAgreement({ caregiverOpenId: "ana" });
    vi.mocked(listDb.writeManagedList).mockRejectedValueOnce(new Error("DB fora do ar"));

    await expect(
      as("ana").managedAlarms.createAlarm({ baseVersion: 1, alarm: medInput() })
    ).rejects.not.toMatchObject({ code: "CONFLICT" });
  });
});

describe("autorização (IDOR) das rotas de escrita", () => {
  const tentativas = {
    createAlarm: (openId: string) =>
      as(openId).managedAlarms.createAlarm({ baseVersion: 1, alarm: medInput() }),
    updateAlarm: (openId: string) =>
      as(openId).managedAlarms.updateAlarm({ baseVersion: 1, alarmId: "a1", alarm: medInput() }),
    deleteAlarm: (openId: string) =>
      as(openId).managedAlarms.deleteAlarm({ baseVersion: 1, alarmId: "a1" }),
  };

  describe.each(Object.entries(tentativas))("%s", (_nome, tentar) => {
    it("OUTRO cuidador vinculado ao mesmo idoso (que não é o do acordo) é FORBIDDEN e a lista não muda", async () => {
      seedActiveAgreement({ caregiverOpenId: "ana" });

      await expect(tentar("bia")).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(listOf("maria")?.version).toBe(1);
      expect(listOf("maria")?.alarms).toHaveLength(1);
      expect(listDb.writeManagedList).not.toHaveBeenCalled();
    });

    it("cuidador SEM vínculo é FORBIDDEN", async () => {
      seedActiveAgreement({ caregiverOpenId: "ana" });

      await expect(tentar("carol")).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(listDb.writeManagedList).not.toHaveBeenCalled();
    });

    it("o IDOSO chamando a rota do cuidador é FORBIDDEN", async () => {
      seedActiveAgreement({ caregiverOpenId: "ana" });

      await expect(tentar("maria")).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(listOf("maria")?.version).toBe(1);
      expect(listDb.writeManagedList).not.toHaveBeenCalled();
    });

    it("pedido ainda pendente não dá direito de editar", async () => {
      seedPendingRequest("ana", "maria");

      await expect(tentar("ana")).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(listDb.writeManagedList).not.toHaveBeenCalled();
    });

    it("sem nenhum acordo, o cuidador vinculado não edita", async () => {
      await expect(tentar("ana")).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(listDb.writeManagedList).not.toHaveBeenCalled();
    });

    it("acordo já encerrado não dá direito de editar", async () => {
      const acordo = seedActiveAgreement({ caregiverOpenId: "ana" });
      await as("ana").managedAlarms.stopManaging();
      expect(acordo.status).toBe("ended");
      vi.clearAllMocks();

      await expect(tentar("ana")).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(listDb.writeManagedList).not.toHaveBeenCalled();
    });
  });

  it("o idoso alvo vem do vínculo: o cuidador de OUTRO idoso só mexe na lista do idoso dele", async () => {
    seedActiveAgreement({ caregiverOpenId: "ana", monitoredOpenId: "maria" }); // a1 = Losartana da Maria
    seedActiveAgreement({
      caregiverOpenId: "dina",
      monitoredOpenId: "joao",
      alarms: [sampleAlarm({ id: "a1", description: "Remédio do João" })],
    });

    // A Dina apaga "a1": o id existe nas duas listas, mas só a do João pode mudar.
    await as("dina").managedAlarms.deleteAlarm({ baseVersion: 1, alarmId: "a1" });

    expect(listOf("joao")?.alarms).toHaveLength(0);
    expect(listOf("maria")?.alarms.map((a) => a.id)).toEqual(["a1"]);
    expect(listOf("maria")?.version).toBe(1);
    expect(vi.mocked(listDb.writeManagedList).mock.calls.every(([monitored]) => monitored === "joao")).toBe(true);
  });

  it("alarmId que só existe na lista de OUTRA conta é NOT_FOUND", async () => {
    seedActiveAgreement({ caregiverOpenId: "ana", monitoredOpenId: "maria" });
    seedActiveAgreement({
      caregiverOpenId: "dina",
      monitoredOpenId: "joao",
      alarms: [sampleAlarm({ id: "so-do-joao", description: "Remédio do João" })],
    });

    await expect(
      as("ana").managedAlarms.updateAlarm({ baseVersion: 1, alarmId: "so-do-joao", alarm: medInput() })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      as("ana").managedAlarms.deleteAlarm({ baseVersion: 1, alarmId: "so-do-joao" })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(listOf("joao")?.alarms.map((a) => a.id)).toEqual(["so-do-joao"]);
    expect(listOf("joao")?.version).toBe(1);
  });

  it("um monitoredOpenId mandado no input é descartado (não redireciona a escrita)", async () => {
    seedActiveAgreement({ caregiverOpenId: "ana", monitoredOpenId: "maria" });
    seedActiveAgreement({ caregiverOpenId: "dina", monitoredOpenId: "joao" });

    await as("ana").managedAlarms.createAlarm({
      baseVersion: 1,
      alarm: medInput(),
      monitoredOpenId: "joao",
    } as never);

    expect(listOf("maria")?.version).toBe(2);
    expect(listOf("joao")?.version).toBe(1);
  });

  it("31 gravações no mesmo minuto: a 31ª é TOO_MANY_REQUESTS", async () => {
    seedActiveAgreement({ caregiverOpenId: "rita", monitoredOpenId: "rita-mon" });

    for (let i = 0; i < 30; i++) {
      await as("rita")
        .managedAlarms.deleteAlarm({ baseVersion: 1, alarmId: "nao-existe" })
        .catch(() => undefined);
    }
    await expect(
      as("rita").managedAlarms.deleteAlarm({ baseVersion: 1, alarmId: "nao-existe" })
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
  });
});

describe("managedAlarms.ack", () => {
  it("o celular confirma a versão: grava appliedVersion, appliedAlarms (a lista daquela versão) e as falhas", async () => {
    seedActiveAgreement({ caregiverOpenId: "ana" });
    await as("ana").managedAlarms.createAlarm({ baseVersion: 1, alarm: medInput() }); // v2

    const result = await as("maria").managedAlarms.ack({ version: 2, failedAlarmIds: ["a1"] });

    expect(result).toEqual({ recorded: true });
    const lista = listOf("maria");
    expect(lista?.appliedVersion).toBe(2);
    expect(lista?.appliedAlarms).toHaveLength(2);
    expect(lista?.failedAlarmIds).toEqual(["a1"]);
    expect(lista?.appliedAt).toBeInstanceOf(Date);
  });

  it("ack de versão antiga é ignorado: a versão e a lista confirmadas não voltam atrás", async () => {
    seedActiveAgreement({ caregiverOpenId: "ana" });
    await as("ana").managedAlarms.createAlarm({ baseVersion: 1, alarm: medInput() }); // v2
    await as("maria").managedAlarms.ack({ version: 2, failedAlarmIds: [] });
    await as("ana").managedAlarms.createAlarm({ baseVersion: 2, alarm: medInput({ time: "21:00" }) }); // v3
    await as("maria").managedAlarms.ack({ version: 3, failedAlarmIds: [] });

    const atrasado = await as("maria").managedAlarms.ack({ version: 2, failedAlarmIds: ["a1"] });

    expect(atrasado).toEqual({ recorded: false });
    expect(listOf("maria")?.appliedVersion).toBe(3);
    expect(listOf("maria")?.appliedAlarms).toHaveLength(3);
    expect(listOf("maria")?.failedAlarmIds).toEqual([]);
  });

  it("repetir o mesmo ack não grava de novo", async () => {
    seedActiveAgreement({ caregiverOpenId: "ana" });
    await as("ana").managedAlarms.createAlarm({ baseVersion: 1, alarm: medInput() });
    await as("maria").managedAlarms.ack({ version: 2, failedAlarmIds: [] });

    await expect(as("maria").managedAlarms.ack({ version: 2, failedAlarmIds: ["x"] })).resolves.toEqual({
      recorded: false,
    });
    expect(listOf("maria")?.failedAlarmIds).toEqual([]);
  });

  it("ack de uma versão que ainda não existe é ignorado", async () => {
    seedActiveAgreement({ caregiverOpenId: "ana" });

    await expect(as("maria").managedAlarms.ack({ version: 99, failedAlarmIds: [] })).resolves.toEqual({
      recorded: false,
    });
    expect(listOf("maria")?.appliedVersion).toBe(1);
  });

  it("ack de versão superada por uma gravação mais nova não confirma a lista nova", async () => {
    seedActiveAgreement({ caregiverOpenId: "ana" });
    await as("ana").managedAlarms.createAlarm({ baseVersion: 1, alarm: medInput() }); // v2
    await as("ana").managedAlarms.createAlarm({ baseVersion: 2, alarm: medInput({ time: "21:00" }) }); // v3

    await expect(as("maria").managedAlarms.ack({ version: 2, failedAlarmIds: [] })).resolves.toEqual({
      recorded: false,
    });
    expect(listOf("maria")?.appliedVersion).toBe(1);
  });

  it("sem acordo ativo o ack não grava nada e não dá erro", async () => {
    await expect(as("joao").managedAlarms.ack({ version: 1, failedAlarmIds: [] })).resolves.toEqual({
      recorded: false,
    });
  });

  it("o ack vale só para a lista do PRÓPRIO idoso", async () => {
    seedActiveAgreement({ caregiverOpenId: "ana", monitoredOpenId: "maria" });
    seedActiveAgreement({ caregiverOpenId: "dina", monitoredOpenId: "joao" });
    await as("ana").managedAlarms.createAlarm({ baseVersion: 1, alarm: medInput() }); // maria v2

    await as("joao").managedAlarms.ack({ version: 2, failedAlarmIds: ["a1"] });

    expect(listOf("maria")?.appliedVersion).toBe(1);
    expect(listOf("joao")?.appliedVersion).toBe(1);
    expect(listOf("joao")?.failedAlarmIds).toEqual([]);
    expect(vi.mocked(listDb.recordManagedAck).mock.calls[0][0]).toBe("joao");
  });

  it("ids de falha repetidos são gravados uma vez só", async () => {
    seedActiveAgreement({ caregiverOpenId: "ana" });
    await as("ana").managedAlarms.createAlarm({ baseVersion: 1, alarm: medInput() });

    await as("maria").managedAlarms.ack({ version: 2, failedAlarmIds: ["a1", "a1", "a1"] });

    expect(listOf("maria")?.failedAlarmIds).toEqual(["a1"]);
  });

  it("o cuidador chamando o ack do idoso é FORBIDDEN", async () => {
    seedActiveAgreement({ caregiverOpenId: "ana" });

    await expect(as("ana").managedAlarms.ack({ version: 1, failedAlarmIds: [] })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("versão 0 e mais de 24 falhas são recusadas pelo Zod", async () => {
    seedActiveAgreement({ caregiverOpenId: "ana" });

    await expect(as("maria").managedAlarms.ack({ version: 0, failedAlarmIds: [] })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await expect(
      as("maria").managedAlarms.ack({
        version: 1,
        failedAlarmIds: Array.from({ length: 25 }, (_, i) => `a${i}`),
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
