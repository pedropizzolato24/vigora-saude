/**
 * managed-alarms-agreement.test.ts
 *
 * O acordo do modo gerenciado, pelo router `managedAlarms` (createCaller).
 * Foco em AUTORIZAÇÃO (IDOR) e nas transições do acordo:
 *  - o idoso alvo de uma rota de cuidador vem do vínculo, nunca do input;
 *  - só o cuidador que pediu mexe no pedido/acordo; outro cuidador vinculado,
 *    cuidador sem vínculo e o próprio idoso são recusados;
 *  - o idoso só responde ao pedido DELE (requestId de outra conta = não existe);
 *  - aceite com lista ilegível não ativa nada e não apaga alarme;
 *  - desfazer o vínculo encerra o acordo com o motivo certo e avisa o outro lado.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../server/db-alarm-management", async () => (await import("./_managed-alarms-fakes")).fakeManagementModule);
vi.mock("../server/db-managed-alarm-list", async () => (await import("./_managed-alarms-fakes")).fakeListModule);
vi.mock("../server/db-links", async () => (await import("./_managed-alarms-fakes")).fakeLinksModule);
vi.mock("../server/db-push", async () => (await import("./_managed-alarms-fakes")).fakePushDbModule);
vi.mock("../server/push", async () => (await import("./_managed-alarms-fakes")).fakePushModule);
vi.mock("../server/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../server/db")>()),
  ...(await import("./_managed-alarms-fakes")).fakeDbOverrides,
}));

import { appRouter } from "../server/routers";
import * as push from "../server/push";
import * as management from "../server/db-alarm-management";
import {
  flush,
  makeCtx,
  resetStore,
  sampleAlarm,
  seedActiveAgreement,
  seedPendingRequest,
  store,
} from "./_managed-alarms-fakes";

const as = (openId: string) => appRouter.createCaller(makeCtx(openId));

/** Pushes visíveis enviados, já achatados: { tokens, title, body, data }. */
const sent = () =>
  vi.mocked(push.sendExpoPush).mock.calls.map(([tokens, message]) => ({ tokens, ...message }));

const agreementOf = (monitoredOpenId: string) =>
  store.agreements.filter((a) => a.monitoredOpenId === monitoredOpenId);

beforeEach(() => {
  vi.clearAllMocks();
  resetStore();
});

describe("managedAlarms.request", () => {
  it("o cuidador vinculado pede: nasce um pedido pendente e o idoso recebe a notificação", async () => {
    const result = await as("ana").managedAlarms.request();
    await flush();

    expect(result.status).toBe("pending");
    expect(agreementOf("maria")).toHaveLength(1);
    expect(agreementOf("maria")[0]).toMatchObject({
      caregiverOpenId: "ana",
      monitoredOpenId: "maria",
      status: "pending",
    });
    expect(sent()).toEqual([
      {
        tokens: ["ExpoTok[maria]"],
        title: "Pedido de Ana",
        body: "Toque para ver",
        data: { type: "management_request" },
      },
    ]);
  });

  it("o idoso do pedido vem do vínculo, não do input (campo extra é descartado)", async () => {
    await as("ana").managedAlarms.request({ monitoredOpenId: "joao" } as never);

    expect(agreementOf("joao")).toHaveLength(0);
    expect(agreementOf("maria")).toHaveLength(1);
  });

  it("já existindo pedido ou acordo aberto para o idoso, outro pedido é CONFLICT e nada é enviado", async () => {
    seedPendingRequest("ana", "maria");

    await expect(as("bia").managedAlarms.request()).rejects.toMatchObject({ code: "CONFLICT" });
    expect(agreementOf("maria")).toHaveLength(1);
    expect(sent()).toHaveLength(0);
  });

  it("acordo ativo de outro cuidador também bloqueia um novo pedido", async () => {
    seedActiveAgreement({ caregiverOpenId: "ana" });

    await expect(as("bia").managedAlarms.request()).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("cuidador sem vínculo é FORBIDDEN e nada é criado", async () => {
    await expect(as("carol").managedAlarms.request()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(store.agreements).toHaveLength(0);
    expect(management.createManagementRequest).not.toHaveBeenCalled();
  });

  it("o idoso chamando a rota do cuidador é FORBIDDEN", async () => {
    await expect(as("maria").managedAlarms.request()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(store.agreements).toHaveLength(0);
  });

  it("mais de 5 pedidos em um minuto: TOO_MANY_REQUESTS", async () => {
    for (let i = 0; i < 5; i++) {
      await as("rita").managedAlarms.request().catch(() => undefined);
    }
    await expect(as("rita").managedAlarms.request()).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
  });

  it("falha no push não desfaz o pedido nem derruba a resposta", async () => {
    vi.mocked(push.sendExpoPush).mockRejectedValueOnce(new Error("rede"));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(as("ana").managedAlarms.request()).resolves.toMatchObject({ status: "pending" });
    await flush();
    expect(agreementOf("maria")).toHaveLength(1);
  });
});

describe("managedAlarms.cancelRequest", () => {
  it("quem pediu cancela: encerra com 'cancelled'", async () => {
    seedPendingRequest("ana", "maria");

    await as("ana").managedAlarms.cancelRequest();

    expect(agreementOf("maria")[0]).toMatchObject({ status: "ended", endedReason: "cancelled" });
  });

  it("outro cuidador vinculado NÃO cancela o pedido alheio (FORBIDDEN) e o pedido segue pendente", async () => {
    seedPendingRequest("ana", "maria");

    await expect(as("bia").managedAlarms.cancelRequest()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(agreementOf("maria")[0].status).toBe("pending");
  });

  it("sem pedido aberto: NOT_FOUND", async () => {
    await expect(as("ana").managedAlarms.cancelRequest()).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("acordo já ativo não é 'pedido': CONFLICT e o acordo continua", async () => {
    seedActiveAgreement({ caregiverOpenId: "ana" });

    await expect(as("ana").managedAlarms.cancelRequest()).rejects.toMatchObject({ code: "CONFLICT" });
    expect(agreementOf("maria")[0].status).toBe("active");
  });

  it("cuidador sem vínculo e o próprio idoso são FORBIDDEN", async () => {
    seedPendingRequest("ana", "maria");

    await expect(as("carol").managedAlarms.cancelRequest()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(as("maria").managedAlarms.cancelRequest()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(agreementOf("maria")[0].status).toBe("pending");
  });
});

describe("managedAlarms.respond — aceite", () => {
  it("aceitar ativa o acordo com a lista atual do idoso (versão 1, já confirmada) e avisa os cuidadores", async () => {
    const pedido = seedPendingRequest("ana", "maria");

    const result = await as("maria").managedAlarms.respond({
      requestId: pedido.id,
      accept: true,
      alarms: [
        { ...sampleAlarm({ id: "a1" }), notificationId: "n-1", nativeAlarmUids: ["u1"] },
        sampleAlarm({ id: "a2", time: "20:00", description: "Check-in", kind: "checkin", escalateAfterMinutes: 10 }),
      ],
    });
    await flush();

    expect(result).toEqual({ success: true, accepted: true });
    expect(agreementOf("maria")[0].status).toBe("active");
    const lista = store.lists.get("maria");
    expect(lista?.version).toBe(1);
    expect(lista?.appliedVersion).toBe(1);
    expect(lista?.alarms.map((a) => a.id)).toEqual(["a1", "a2"]);
    expect(lista?.alarms[0]).not.toHaveProperty("notificationId");
    expect(lista?.alarms[0]).not.toHaveProperty("nativeAlarmUids");

    const pushes = sent();
    const paraAna = pushes.find((p) => p.tokens.includes("ExpoTok[ana]"));
    expect(paraAna).toMatchObject({
      title: "Alarmes",
      body: "Vó Maria aceitou. Agora você cuida dos alarmes de Vó Maria.",
      data: { type: "management_accepted", url: "/(caregiver-tabs)/managed-alarms" },
    });
    const paraBia = pushes.find((p) => p.tokens.includes("ExpoTok[bia]"));
    expect(paraBia).toMatchObject({
      body: "Ana passou a cuidar dos alarmes de Vó Maria.",
      data: { type: "management_changed" },
    });
    expect(pushes).toHaveLength(2);
  });

  it("aceitar com lista vazia é válido (o idoso ainda não tem alarmes)", async () => {
    const pedido = seedPendingRequest("ana", "maria");

    await as("maria").managedAlarms.respond({ requestId: pedido.id, accept: true, alarms: [] });

    expect(agreementOf("maria")[0].status).toBe("active");
    expect(store.lists.get("maria")?.alarms).toEqual([]);
  });

  it("descrição acima de 80 caracteres é cortada, o aceite não falha e nada é apagado", async () => {
    const pedido = seedPendingRequest("ana", "maria");

    await as("maria").managedAlarms.respond({
      requestId: pedido.id,
      accept: true,
      alarms: [sampleAlarm({ description: "x".repeat(120) })],
    });

    expect(store.lists.get("maria")?.alarms[0].description).toHaveLength(80);
  });

  it("item sem id: BAD_REQUEST, o pedido continua pendente e nenhuma lista nasce", async () => {
    const pedido = seedPendingRequest("ana", "maria");

    await expect(
      as("maria").managedAlarms.respond({
        requestId: pedido.id,
        accept: true,
        alarms: [{ time: "08:00", description: "Sem id", enabled: true, repeat: "daily" }],
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: "Não foi possível ler seus alarmes." });
    expect(agreementOf("maria")[0].status).toBe("pending");
    expect(store.lists.has("maria")).toBe(false);
  });

  it("item com horário inválido: BAD_REQUEST e o pedido continua pendente", async () => {
    const pedido = seedPendingRequest("ana", "maria");

    await expect(
      as("maria").managedAlarms.respond({
        requestId: pedido.id,
        accept: true,
        alarms: [sampleAlarm({ time: "25:99" })],
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(agreementOf("maria")[0].status).toBe("pending");
  });

  it("mais de 24 alarmes: BAD_REQUEST e o pedido continua pendente", async () => {
    const pedido = seedPendingRequest("ana", "maria");
    const muitos = Array.from({ length: 25 }, (_, i) => sampleAlarm({ id: `a${i}` }));

    await expect(
      as("maria").managedAlarms.respond({ requestId: pedido.id, accept: true, alarms: muitos })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(agreementOf("maria")[0].status).toBe("pending");
  });

  it("aceitar sem mandar a lista: BAD_REQUEST (nunca ativa com lista inventada)", async () => {
    const pedido = seedPendingRequest("ana", "maria");

    await expect(
      as("maria").managedAlarms.respond({ requestId: pedido.id, accept: true })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(agreementOf("maria")[0].status).toBe("pending");
  });

  it("requestId de OUTRA conta: NOT_FOUND e o pedido alheio não é tocado", async () => {
    seedPendingRequest("ana", "maria");
    const pedidoDoJoao = seedPendingRequest("dina", "joao");

    await expect(
      as("maria").managedAlarms.respond({ requestId: pedidoDoJoao.id, accept: true, alarms: [] })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(pedidoDoJoao.status).toBe("pending");
    expect(store.lists.has("joao")).toBe(false);
  });

  it("requestId inexistente: NOT_FOUND", async () => {
    await expect(
      as("maria").managedAlarms.respond({ requestId: 9999, accept: false })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("pedido que já foi respondido: CONFLICT (aceitar duas vezes não recria a lista)", async () => {
    const acordo = seedActiveAgreement({ caregiverOpenId: "ana" });

    await expect(
      as("maria").managedAlarms.respond({ requestId: acordo.id, accept: true, alarms: [] })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(store.lists.get("maria")?.alarms).toHaveLength(1);
  });

  it("cuidador chamando a rota do idoso é FORBIDDEN", async () => {
    const pedido = seedPendingRequest("ana", "maria");

    await expect(
      as("ana").managedAlarms.respond({ requestId: pedido.id, accept: true, alarms: [] })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(agreementOf("maria")[0].status).toBe("pending");
  });

  it("pedido de cuidador que já não está vinculado: NOT_FOUND e o pedido é encerrado como 'unlinked'", async () => {
    const pedido = seedPendingRequest("ana", "maria");
    store.links = store.links.filter((l) => l.caregiverOpenId !== "ana");

    await expect(
      as("maria").managedAlarms.respond({ requestId: pedido.id, accept: true, alarms: [] })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(agreementOf("maria")[0]).toMatchObject({ status: "ended", endedReason: "unlinked" });
    expect(store.lists.has("maria")).toBe(false);
  });
});

describe("managedAlarms.respond — recusa", () => {
  it("'Agora não' encerra com 'declined', não cria lista e avisa o cuidador", async () => {
    const pedido = seedPendingRequest("ana", "maria");

    const result = await as("maria").managedAlarms.respond({ requestId: pedido.id, accept: false });
    await flush();

    expect(result).toEqual({ success: true, accepted: false });
    expect(agreementOf("maria")[0]).toMatchObject({ status: "ended", endedReason: "declined" });
    expect(store.lists.has("maria")).toBe(false);
    expect(sent()).toEqual([
      {
        tokens: ["ExpoTok[ana]"],
        title: "Alarmes",
        body: "Vó Maria preferiu continuar cuidando dos próprios alarmes.",
        data: { type: "management_declined" },
      },
    ]);
  });
});

describe("managedAlarms.mine", () => {
  it("sem pedido nem acordo: tudo nulo", async () => {
    await expect(as("maria").managedAlarms.mine()).resolves.toEqual({
      pendingRequest: null,
      management: null,
      list: null,
    });
  });

  it("pedido pendente: devolve o id e o nome do cuidador", async () => {
    const pedido = seedPendingRequest("ana", "maria");

    await expect(as("maria").managedAlarms.mine()).resolves.toEqual({
      pendingRequest: { id: pedido.id, caregiverName: "Ana" },
      management: null,
      list: null,
    });
  });

  it("acordo ativo: devolve o cuidador, desde quando e a lista (versão + alarmes)", async () => {
    const acordo = seedActiveAgreement({ caregiverOpenId: "ana" });

    const result = await as("maria").managedAlarms.mine();

    expect(result.pendingRequest).toBeNull();
    expect(result.management).toEqual({
      id: acordo.id,
      caregiverOpenId: "ana",
      caregiverName: "Ana",
      since: acordo.respondedAt!.getTime(),
    });
    expect(result.list?.version).toBe(1);
    expect(result.list?.alarms.map((a) => a.id)).toEqual(["a1"]);
  });

  it("só enxerga o acordo DELE: o pedido de outro idoso não aparece", async () => {
    seedPendingRequest("dina", "joao");

    await expect(as("maria").managedAlarms.mine()).resolves.toMatchObject({ pendingRequest: null });
  });

  it("acordo cujo cuidador já não está vinculado se cura: encerra 'unlinked' e devolve tudo nulo", async () => {
    seedActiveAgreement({ caregiverOpenId: "ana" });
    store.links = store.links.filter((l) => l.caregiverOpenId !== "ana");

    await expect(as("maria").managedAlarms.mine()).resolves.toEqual({
      pendingRequest: null,
      management: null,
      list: null,
    });
    expect(agreementOf("maria")[0]).toMatchObject({ status: "ended", endedReason: "unlinked" });
  });

  it("cuidador chamando a rota do idoso é FORBIDDEN", async () => {
    await expect(as("ana").managedAlarms.mine()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("managedAlarms.stopBeingManaged", () => {
  it("o idoso para: encerra 'stopped_by_monitored', apaga a lista gerenciada e avisa o cuidador", async () => {
    seedActiveAgreement({ caregiverOpenId: "ana" });

    await as("maria").managedAlarms.stopBeingManaged();
    await flush();

    expect(agreementOf("maria")[0]).toMatchObject({ status: "ended", endedReason: "stopped_by_monitored" });
    expect(store.lists.has("maria")).toBe(false);
    expect(sent()).toEqual([
      {
        tokens: ["ExpoTok[ana]"],
        title: "Alarmes",
        body: "Vó Maria voltou a cuidar dos próprios alarmes.",
        data: { type: "management_ended" },
      },
    ]);
  });

  it("sem acordo ativo: NOT_FOUND (pedido pendente não é acordo)", async () => {
    seedPendingRequest("ana", "maria");

    await expect(as("maria").managedAlarms.stopBeingManaged()).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(agreementOf("maria")[0].status).toBe("pending");
  });

  it("cuidador chamando a rota do idoso é FORBIDDEN e o acordo continua", async () => {
    seedActiveAgreement({ caregiverOpenId: "ana" });

    await expect(as("ana").managedAlarms.stopBeingManaged()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(agreementOf("maria")[0].status).toBe("active");
  });
});

describe("managedAlarms.stopManaging", () => {
  it("o cuidador do acordo para: encerra 'stopped_by_caregiver' e o idoso recebe a notificação visível", async () => {
    seedActiveAgreement({ caregiverOpenId: "ana" });

    await as("ana").managedAlarms.stopManaging();
    await flush();

    expect(agreementOf("maria")[0]).toMatchObject({ status: "ended", endedReason: "stopped_by_caregiver" });
    expect(store.lists.has("maria")).toBe(false);
    expect(sent()).toEqual([
      {
        tokens: ["ExpoTok[maria]"],
        title: "Alarmes",
        body: "Ana parou de cuidar dos seus alarmes.",
        data: { type: "management_ended" },
      },
    ]);
  });

  it("outro cuidador vinculado NÃO para o acordo do colega (FORBIDDEN) e o acordo continua", async () => {
    seedActiveAgreement({ caregiverOpenId: "ana" });

    await expect(as("bia").managedAlarms.stopManaging()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(agreementOf("maria")[0].status).toBe("active");
    expect(store.lists.has("maria")).toBe(true);
  });

  it("pedido ainda pendente não é acordo: CONFLICT (o caminho é cancelar o pedido)", async () => {
    seedPendingRequest("ana", "maria");

    await expect(as("ana").managedAlarms.stopManaging()).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("sem nada aberto: NOT_FOUND", async () => {
    await expect(as("ana").managedAlarms.stopManaging()).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("o idoso e o cuidador sem vínculo são FORBIDDEN", async () => {
    seedActiveAgreement({ caregiverOpenId: "ana" });

    await expect(as("maria").managedAlarms.stopManaging()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(as("carol").managedAlarms.stopManaging()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(agreementOf("maria")[0].status).toBe("active");
  });
});

describe("managedAlarms.forCaregiver", () => {
  it("sem acordo: devolve o idoso do vínculo e nada de acordo nem lista", async () => {
    await expect(as("ana").managedAlarms.forCaregiver()).resolves.toEqual({
      monitoredOpenId: "maria",
      monitoredName: "Vó Maria",
      management: null,
      list: null,
    });
  });

  it("pedido pendente do próprio cuidador: isMine, vence em 7 dias, sem lista", async () => {
    const pedido = seedPendingRequest("ana", "maria");

    const result = await as("ana").managedAlarms.forCaregiver();

    expect(result.management).toEqual({
      id: pedido.id,
      status: "pending",
      caregiverOpenId: "ana",
      isMine: true,
      managerName: "Ana",
      requestedAt: pedido.requestedAt.getTime(),
      respondedAt: null,
      expiresAt: pedido.requestedAt.getTime() + 7 * 24 * 60 * 60 * 1000,
    });
    expect(result.list).toBeNull();
  });

  it("acordo ativo: o gerente vê a lista com versão, confirmação e falhas", async () => {
    seedActiveAgreement({ caregiverOpenId: "ana" });
    const lista = store.lists.get("maria")!;
    lista.failedAlarmIds = ["a1"];

    const result = await as("ana").managedAlarms.forCaregiver();

    expect(result.management).toMatchObject({ status: "active", isMine: true, expiresAt: null });
    expect(result.list).toMatchObject({ version: 1, appliedVersion: 1, failedAlarmIds: ["a1"] });
    expect(result.list?.alarms.map((a) => a.id)).toEqual(["a1"]);
  });

  it("outro cuidador vinculado vê que o acordo é do colega (isMine false, nome do gerente)", async () => {
    seedActiveAgreement({ caregiverOpenId: "ana" });

    const result = await as("bia").managedAlarms.forCaregiver();

    expect(result.management).toMatchObject({ isMine: false, managerName: "Ana", caregiverOpenId: "ana" });
  });

  it("cuidador sem vínculo e o idoso são FORBIDDEN", async () => {
    await expect(as("carol").managedAlarms.forCaregiver()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(as("maria").managedAlarms.forCaregiver()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("nunca devolve o acordo de outro idoso", async () => {
    seedActiveAgreement({ caregiverOpenId: "dina", monitoredOpenId: "joao" });

    const result = await as("ana").managedAlarms.forCaregiver();

    expect(result.monitoredOpenId).toBe("maria");
    expect(result.management).toBeNull();
    expect(result.list).toBeNull();
  });
});

describe("link.revokeLink encerra o acordo aberto do par", () => {
  it("o idoso desfaz o vínculo com o gerente: acordo 'unlinked', lista apagada", async () => {
    seedActiveAgreement({ caregiverOpenId: "ana" });

    await as("maria").link.revokeLink({ otherOpenId: "ana" });
    await flush();

    expect(agreementOf("maria")[0]).toMatchObject({ status: "ended", endedReason: "unlinked" });
    expect(store.lists.has("maria")).toBe(false);
  });

  it("o cuidador gerente desfaz o vínculo: acordo 'unlinked' e o idoso é avisado para a trava sair", async () => {
    seedActiveAgreement({ caregiverOpenId: "ana" });

    await as("ana").link.revokeLink({ otherOpenId: "maria" });
    await flush();

    expect(agreementOf("maria")[0]).toMatchObject({ status: "ended", endedReason: "unlinked" });
    const paraMaria = sent().filter((p) => p.tokens.includes("ExpoTok[maria]"));
    expect(paraMaria).toEqual([
      {
        tokens: ["ExpoTok[maria]"],
        title: "Alarmes",
        body: "Ana parou de cuidar dos seus alarmes.",
        data: { type: "management_ended" },
      },
    ]);
  });

  it("pedido pendente do cuidador que sai: encerra 'unlinked' sem avisar o idoso", async () => {
    seedPendingRequest("ana", "maria");

    await as("ana").link.revokeLink({ otherOpenId: "maria" });
    await flush();

    expect(agreementOf("maria")[0]).toMatchObject({ status: "ended", endedReason: "unlinked" });
    expect(sent().filter((p) => p.tokens.includes("ExpoTok[maria]"))).toHaveLength(0);
  });

  it("outro cuidador (que não é o gerente) sai: o acordo da Ana segue ativo", async () => {
    seedActiveAgreement({ caregiverOpenId: "ana" });

    await as("bia").link.revokeLink({ otherOpenId: "maria" });
    await flush();

    expect(agreementOf("maria")[0].status).toBe("active");
    expect(store.lists.has("maria")).toBe(true);
  });

  it("o idoso desvincula quem NÃO é o gerente: o acordo segue ativo", async () => {
    seedActiveAgreement({ caregiverOpenId: "ana" });

    await as("maria").link.revokeLink({ otherOpenId: "bia" });
    await flush();

    expect(agreementOf("maria")[0].status).toBe("active");
  });

  it("sem acordo nenhum, desvincular continua funcionando", async () => {
    await expect(as("ana").link.revokeLink({ otherOpenId: "maria" })).resolves.toEqual({ success: true });
    expect(management.endManagement).not.toHaveBeenCalled();
  });

  it("falha ao encerrar o acordo não impede o desvínculo (direito do titular)", async () => {
    seedActiveAgreement({ caregiverOpenId: "ana" });
    vi.mocked(management.endManagement).mockRejectedValueOnce(new Error("DB fora do ar"));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(as("maria").link.revokeLink({ otherOpenId: "ana" })).resolves.toEqual({ success: true });
    expect(store.links.some((l) => l.caregiverOpenId === "ana")).toBe(false);
  });
});
