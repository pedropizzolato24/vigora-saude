/**
 * managed-alarms-housekeeping.test.ts
 *
 * Manutenção do acordo de gerenciamento de alarmes (rodada de 5 em 5 minutos):
 * vencer pedidos de 7 dias e mandar a notificação visível de reserva quando o
 * celular do idoso não confirmou a lista nova em 10 minutos.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../server/db-alarm-management", () => ({
  getExpiredManagementRequests: vi.fn(async () => []),
  getOpenManagementForMonitored: vi.fn(async () => null),
  endManagement: vi.fn(async () => undefined),
}));

vi.mock("../server/db-managed-alarm-list", () => ({
  getListsNeedingVisibleNotice: vi.fn(async () => []),
  markVisibleNoticeSent: vi.fn(async () => undefined),
}));

vi.mock("../server/db", () => ({
  getUserData: vi.fn(async () => ({ anamnesis: { fullName: "Dona Maria" } })),
  getUserByOpenId: vi.fn(async (openId: string) => ({ name: openId === "ana" ? "Ana" : "Conta" })),
}));

vi.mock("../server/db-push", () => ({
  getPushTokensForOpenIds: vi.fn(async (openIds: string[]) => openIds.map((id) => ({ token: `ExpoTok[${id}]` }))),
}));

vi.mock("../server/push", () => ({
  sendExpoPush: vi.fn(async () => 1),
}));

import { runManagementHousekeeping } from "../server/managed-alarms-housekeeping";
import * as dbManagement from "../server/db-alarm-management";
import * as dbList from "../server/db-managed-alarm-list";
import * as dbPush from "../server/db-push";
import * as dbUsers from "../server/db";
import * as push from "../server/push";

const NOW = new Date("2026-10-20T12:00:00.000Z");

const request = (over: Record<string, unknown> = {}) =>
  ({ id: 7, monitoredOpenId: "maria", caregiverOpenId: "ana", status: "pending", ...over }) as never;

const list = (over: Record<string, unknown> = {}) =>
  ({
    monitoredOpenId: "maria",
    version: 3,
    appliedVersion: 2,
    updatedByOpenId: "ana",
    // O nome do remédio existe na lista; nunca pode ir para a notificação.
    alarms: [{ id: "a1", time: "08:00", description: "Losartana", enabled: true, repeat: "daily" }],
    ...over,
  }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(dbManagement.getExpiredManagementRequests).mockResolvedValue([]);
  vi.mocked(dbManagement.getOpenManagementForMonitored).mockResolvedValue({ id: 7, status: "pending" } as never);
  vi.mocked(dbManagement.endManagement).mockResolvedValue(undefined);
  vi.mocked(dbList.getListsNeedingVisibleNotice).mockResolvedValue([]);
  vi.mocked(dbList.markVisibleNoticeSent).mockResolvedValue(undefined);
  vi.mocked(dbPush.getPushTokensForOpenIds).mockImplementation(
    async (openIds: string[]) => openIds.map((id) => ({ token: `ExpoTok[${id}]` })) as never
  );
  vi.mocked(push.sendExpoPush).mockResolvedValue(1);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("pedido que venceu (7 dias)", () => {
  it("encerra como expired e avisa o cuidador", async () => {
    vi.mocked(dbManagement.getExpiredManagementRequests).mockResolvedValue([request()]);

    const result = await runManagementHousekeeping(NOW);

    expect(dbManagement.getExpiredManagementRequests).toHaveBeenCalledWith(NOW);
    expect(dbManagement.endManagement).toHaveBeenCalledWith(7, "expired");
    expect(push.sendExpoPush).toHaveBeenCalledWith(["ExpoTok[ana]"], {
      title: "Alarmes",
      body: "O pedido para cuidar dos alarmes de Dona Maria venceu.",
      data: { type: "management_expired" },
    });
    expect(result.expired).toBe(1);
  });

  it("encerra ANTES de avisar (aviso de um pedido que não foi encerrado seria mentira)", async () => {
    vi.mocked(dbManagement.getExpiredManagementRequests).mockResolvedValue([request()]);

    await runManagementHousekeeping(NOW);

    const ended = vi.mocked(dbManagement.endManagement).mock.invocationCallOrder[0];
    const pushed = vi.mocked(push.sendExpoPush).mock.invocationCallOrder[0];
    expect(ended).toBeLessThan(pushed);
  });

  it("pedido aceito entre a consulta e o encerramento NÃO é encerrado nem avisado", async () => {
    vi.mocked(dbManagement.getExpiredManagementRequests).mockResolvedValue([request()]);
    vi.mocked(dbManagement.getOpenManagementForMonitored).mockResolvedValue({ id: 7, status: "active" } as never);

    const result = await runManagementHousekeeping(NOW);

    expect(dbManagement.endManagement).not.toHaveBeenCalled();
    expect(push.sendExpoPush).not.toHaveBeenCalled();
    expect(result.expired).toBe(0);
  });

  it("pedido que já não está aberto (cancelado, recusado) é ignorado", async () => {
    vi.mocked(dbManagement.getExpiredManagementRequests).mockResolvedValue([request()]);
    vi.mocked(dbManagement.getOpenManagementForMonitored).mockResolvedValue(null);

    await runManagementHousekeeping(NOW);

    expect(dbManagement.endManagement).not.toHaveBeenCalled();
  });

  it("o aberto ser OUTRO pedido do mesmo idoso também não encerra este", async () => {
    vi.mocked(dbManagement.getExpiredManagementRequests).mockResolvedValue([request({ id: 7 })]);
    vi.mocked(dbManagement.getOpenManagementForMonitored).mockResolvedValue({ id: 9, status: "pending" } as never);

    await runManagementHousekeeping(NOW);

    expect(dbManagement.endManagement).not.toHaveBeenCalled();
  });

  it("cuidador sem token de push: encerra e não manda nada", async () => {
    vi.mocked(dbManagement.getExpiredManagementRequests).mockResolvedValue([request()]);
    vi.mocked(dbPush.getPushTokensForOpenIds).mockResolvedValue([]);

    const result = await runManagementHousekeeping(NOW);

    expect(dbManagement.endManagement).toHaveBeenCalledWith(7, "expired");
    expect(push.sendExpoPush).not.toHaveBeenCalled();
    expect(result.expired).toBe(1);
  });
});

describe("notificação visível de reserva", () => {
  it("manda ao idoso, com o nome do autor, sem nome de remédio, e marca a versão", async () => {
    vi.mocked(dbList.getListsNeedingVisibleNotice).mockResolvedValue([list()]);

    const result = await runManagementHousekeeping(NOW);

    expect(dbList.getListsNeedingVisibleNotice).toHaveBeenCalledWith(NOW);
    expect(push.sendExpoPush).toHaveBeenCalledWith(["ExpoTok[maria]"], {
      title: "Alarmes atualizados",
      body: "Ana atualizou seus alarmes. Abra o Vigora para as mudanças valerem.",
      data: { type: "managed_alarms_updated", version: 3 },
    });
    expect(JSON.stringify(vi.mocked(push.sendExpoPush).mock.calls)).not.toContain("Losartana");
    expect(dbList.markVisibleNoticeSent).toHaveBeenCalledWith("maria", 3);
    expect(result.visibleNotices).toBe(1);
  });

  it("autor sem nome vira 'Seu cuidador'", async () => {
    vi.mocked(dbList.getListsNeedingVisibleNotice).mockResolvedValue([list()]);
    vi.mocked(dbUsers.getUserByOpenId).mockResolvedValueOnce({ name: null } as never);

    await runManagementHousekeeping(NOW);

    expect(vi.mocked(push.sendExpoPush).mock.calls[0][1].body).toBe(
      "Seu cuidador atualizou seus alarmes. Abra o Vigora para as mudanças valerem."
    );
  });

  it("Expo recusou o envio: NÃO marca, para tentar de novo na rodada seguinte", async () => {
    vi.mocked(dbList.getListsNeedingVisibleNotice).mockResolvedValue([list()]);
    vi.mocked(push.sendExpoPush).mockResolvedValue(0);

    const result = await runManagementHousekeeping(NOW);

    expect(dbList.markVisibleNoticeSent).not.toHaveBeenCalled();
    expect(result.visibleNotices).toBe(0);
  });

  it("idoso sem nenhum token (app antigo): marca a versão e não manda nada", async () => {
    vi.mocked(dbList.getListsNeedingVisibleNotice).mockResolvedValue([list()]);
    vi.mocked(dbPush.getPushTokensForOpenIds).mockResolvedValue([]);

    await runManagementHousekeeping(NOW);

    expect(push.sendExpoPush).not.toHaveBeenCalled();
    expect(dbList.markVisibleNoticeSent).toHaveBeenCalledWith("maria", 3);
  });

  it("uma lista com erro não impede as outras; a rotina rejeita sem vazar o erro", async () => {
    vi.mocked(dbList.getListsNeedingVisibleNotice).mockResolvedValue([
      list({ monitoredOpenId: "ruim", version: 1 }),
      list({ monitoredOpenId: "maria", version: 4 }),
    ]);
    vi.mocked(dbList.markVisibleNoticeSent).mockImplementation(async (openId) => {
      if (openId === "ruim") throw new Error("Failed query: update managed_alarm_lists params: Losartana");
    });

    let message = "";
    await runManagementHousekeeping(NOW).catch((e: Error) => {
      message = e.message;
    });

    expect(dbList.markVisibleNoticeSent).toHaveBeenCalledWith("maria", 4);
    expect(message).toBe("Manutenção do acordo: falhou em aviso visível");
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("Losartana");
  });
});

describe("isolamento entre os dois passos", () => {
  it("falha ao buscar pedidos vencidos não impede a notificação de reserva", async () => {
    vi.mocked(dbManagement.getExpiredManagementRequests).mockRejectedValue(new Error("DATABASE_UNAVAILABLE"));
    vi.mocked(dbList.getListsNeedingVisibleNotice).mockResolvedValue([list()]);

    await expect(runManagementHousekeeping(NOW)).rejects.toThrow("Manutenção do acordo: falhou em pedidos vencidos");

    expect(push.sendExpoPush).toHaveBeenCalledTimes(1);
  });
});
