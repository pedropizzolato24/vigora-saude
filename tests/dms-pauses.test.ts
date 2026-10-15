/**
 * dms-pauses.test.ts
 *
 * Pausa do dead man's switch: 48 h sem sinal, aviso único ao cuidador, e a
 * verificação diária (ping + recibos) que descobre app removido. Direção do
 * erro: pausar à toa cala o switch de um idoso que está bem; deixar de pausar
 * faz a família ser avisada todo dia sobre um celular abandonado.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../server/db-monitoring", () => ({
  getStaleUnpausedMonitoredAccounts: vi.fn(async () => []),
  pauseDms: vi.fn(async () => true),
  getPausesNeedingNotice: vi.fn(async () => []),
  markPauseNoticeSent: vi.fn(async () => undefined),
  getPreRegisterCandidates: vi.fn(async () => []),
  getAccountLiveness: vi.fn(async () => null),
}));

vi.mock("../server/db", () => ({
  getUserData: vi.fn(async () => ({ anamnesis: { fullName: "Dona Maria" } })),
  getUserByOpenId: vi.fn(async () => ({ name: "Conta" })),
}));

vi.mock("../server/db-links", () => ({
  getActiveCaregiversForMonitored: vi.fn(async () => [{ caregiverOpenId: "ana" }]),
}));

vi.mock("../server/db-push", () => ({
  getPushTokensForOpenIds: vi.fn(async () => [{ token: "ExpoTok[ana]" }]),
  getPushTokensWithOwner: vi.fn(async () => []),
  countPushTokens: vi.fn(async () => 0),
  deletePushToken: vi.fn(async () => undefined),
}));

vi.mock("../server/push", () => ({
  sendExpoPush: vi.fn(async () => 1),
  sendExpoDataPush: vi.fn(async () => []),
  fetchExpoReceipts: vi.fn(async () => ({})),
}));

import { __testing, buildPauseNoticeBody, PAUSE_NOTICE_TITLE, runDmsPauses } from "../server/dms-pauses";
import * as db from "../server/db-monitoring";
import * as dbCore from "../server/db";
import * as dbLinks from "../server/db-links";
import * as dbPush from "../server/db-push";
import * as push from "../server/push";

const NOW = new Date("2026-10-10T12:00:00.000Z");
const later = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);

/** Um idoso com um aparelho, pronto para o ping. */
function withDevice(token = "T1", openId = "maria") {
  vi.mocked(db.getPreRegisterCandidates).mockResolvedValue([
    { openId, alarms: [], timezone: null, eventTimezone: null, managed: null },
  ]);
  vi.mocked(dbPush.getPushTokensWithOwner).mockResolvedValue([{ token, openId }]);
}

beforeEach(() => {
  vi.clearAllMocks();
  __testing.reset();
  vi.mocked(db.getStaleUnpausedMonitoredAccounts).mockResolvedValue([]);
  vi.mocked(db.pauseDms).mockResolvedValue(true);
  vi.mocked(db.getPausesNeedingNotice).mockResolvedValue([]);
  vi.mocked(db.markPauseNoticeSent).mockResolvedValue(undefined);
  vi.mocked(db.getPreRegisterCandidates).mockResolvedValue([]);
  vi.mocked(db.getAccountLiveness).mockResolvedValue(null);
  vi.mocked(dbLinks.getActiveCaregiversForMonitored).mockResolvedValue([{ caregiverOpenId: "ana" }] as never);
  vi.mocked(dbPush.getPushTokensForOpenIds).mockResolvedValue([{ token: "ExpoTok[ana]" }] as never);
  vi.mocked(dbPush.getPushTokensWithOwner).mockResolvedValue([]);
  vi.mocked(dbPush.countPushTokens).mockResolvedValue(0);
  vi.mocked(push.sendExpoPush).mockResolvedValue(1);
  vi.mocked(push.sendExpoDataPush).mockResolvedValue([]);
  vi.mocked(push.fetchExpoReceipts).mockResolvedValue({});
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("48 h sem sinal", () => {
  it("pausa cada conta parada como no_signal e conta só as que pausou agora", async () => {
    vi.mocked(db.getStaleUnpausedMonitoredAccounts).mockResolvedValue(["a", "b"]);
    vi.mocked(db.pauseDms).mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    const result = await runDmsPauses(NOW);

    expect(db.getStaleUnpausedMonitoredAccounts).toHaveBeenCalledWith(NOW);
    expect(db.pauseDms).toHaveBeenCalledWith("a", "no_signal");
    expect(db.pauseDms).toHaveBeenCalledWith("b", "no_signal");
    expect(result.paused).toBe(1);
  });

  it("falha numa conta não impede as outras; a rotina rejeita sem vazar o erro", async () => {
    vi.mocked(db.getStaleUnpausedMonitoredAccounts).mockResolvedValue(["a", "b"]);
    vi.mocked(db.pauseDms).mockImplementation(async (openId) => {
      if (openId === "a") throw new Error("Failed query: delete from alarm_events params: Losartana");
      return true;
    });

    let message = "";
    await runDmsPauses(NOW).catch((e: Error) => {
      message = e.message;
    });

    expect(db.pauseDms).toHaveBeenCalledWith("b", "no_signal");
    expect(message).toBe("Pausas: falhou em sem sinal");
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("Losartana");
  });

  it("um passo quebrado não impede os avisos das pausas que já existem", async () => {
    vi.mocked(db.getStaleUnpausedMonitoredAccounts).mockRejectedValue(new Error("DATABASE_UNAVAILABLE"));
    vi.mocked(db.getPausesNeedingNotice).mockResolvedValue([{ openId: "maria", reason: "logged_out" }]);

    await expect(runDmsPauses(NOW)).rejects.toThrow("Pausas: falhou em sem sinal");

    expect(push.sendExpoPush).toHaveBeenCalledTimes(1);
  });

  it("conta parada há mais de 7 dias pausa em silêncio (aviso marcado na hora); a de 3 dias recebe aviso", async () => {
    vi.mocked(db.getStaleUnpausedMonitoredAccounts).mockResolvedValue(["antiga", "recente"]);
    vi.mocked(db.pauseDms).mockResolvedValue(true);
    vi.mocked(db.getAccountLiveness).mockImplementation(async (openId: string) =>
      ({
        openId,
        lastSeenAt: new Date(NOW.getTime() - (openId === "antiga" ? 40 : 3) * 24 * 60 * 60 * 1000),
      }) as never
    );

    await runDmsPauses(NOW);

    expect(db.markPauseNoticeSent).toHaveBeenCalledWith("antiga");
    expect(db.markPauseNoticeSent).not.toHaveBeenCalledWith("recente");
  });

  it("conta que já estava pausada não é consultada nem marcada", async () => {
    vi.mocked(db.getStaleUnpausedMonitoredAccounts).mockResolvedValue(["x"]);
    vi.mocked(db.pauseDms).mockResolvedValue(false);

    await runDmsPauses(NOW);

    expect(db.getAccountLiveness).not.toHaveBeenCalled();
    expect(db.markPauseNoticeSent).not.toHaveBeenCalled();
  });
});

describe("aviso da pausa ao cuidador", () => {
  it.each([
    [
      "logged_out",
      "Dona Maria saiu da conta do Vigora no celular. Os avisos automáticos estão pausados até Dona Maria entrar de novo.",
    ],
    [
      "app_removed",
      "O Vigora parece ter sido removido do celular de Dona Maria. Os avisos automáticos estão pausados.",
    ],
    [
      "no_signal",
      "O celular de Dona Maria não dá sinal há 2 dias. Os avisos automáticos estão pausados até ele voltar a se comunicar.",
    ],
  ] as const)("texto exato do motivo %s", async (reason, body) => {
    expect(buildPauseNoticeBody(reason, "Dona Maria")).toBe(body);

    vi.mocked(db.getPausesNeedingNotice).mockResolvedValue([{ openId: "maria", reason }]);
    await runDmsPauses(NOW);

    expect(push.sendExpoPush).toHaveBeenCalledWith(["ExpoTok[ana]"], {
      title: PAUSE_NOTICE_TITLE,
      body,
      data: { type: "dms_paused", url: "/(caregiver-tabs)/person" },
    });
    expect(PAUSE_NOTICE_TITLE).toBe("Avisos pausados — Vigora");
  });

  it("vai para todos os cuidadores vinculados, num só envio, e marca como avisado", async () => {
    vi.mocked(dbLinks.getActiveCaregiversForMonitored).mockResolvedValue([
      { caregiverOpenId: "ana" },
      { caregiverOpenId: "beto" },
    ] as never);
    vi.mocked(dbPush.getPushTokensForOpenIds).mockResolvedValue([
      { token: "ExpoTok[ana]" },
      { token: "ExpoTok[beto]" },
    ] as never);
    vi.mocked(db.getPausesNeedingNotice).mockResolvedValue([{ openId: "maria", reason: "no_signal" }]);

    const result = await runDmsPauses(NOW);

    expect(dbPush.getPushTokensForOpenIds).toHaveBeenCalledWith(["ana", "beto"]);
    expect(push.sendExpoPush).toHaveBeenCalledTimes(1);
    expect(vi.mocked(push.sendExpoPush).mock.calls[0][0]).toEqual(["ExpoTok[ana]", "ExpoTok[beto]"]);
    expect(db.markPauseNoticeSent).toHaveBeenCalledWith("maria");
    expect(result.noticesSent).toBe(1);
  });

  it("UM aviso por pausa: a rodada seguinte não repete", async () => {
    let pending = [{ openId: "maria", reason: "no_signal" as const }];
    vi.mocked(db.getPausesNeedingNotice).mockImplementation(async () => [...pending]);
    vi.mocked(db.markPauseNoticeSent).mockImplementation(async (openId) => {
      pending = pending.filter((p) => p.openId !== openId);
    });

    await runDmsPauses(NOW);
    await runDmsPauses(later(5));
    await runDmsPauses(later(10));

    expect(push.sendExpoPush).toHaveBeenCalledTimes(1);
  });

  it("ninguém alcançado (Expo recusou): NÃO marca, para tentar de novo na rodada seguinte", async () => {
    vi.mocked(db.getPausesNeedingNotice).mockResolvedValue([{ openId: "maria", reason: "no_signal" }]);
    vi.mocked(push.sendExpoPush).mockResolvedValue(0);

    const result = await runDmsPauses(NOW);

    expect(db.markPauseNoticeSent).not.toHaveBeenCalled();
    expect(result.noticesSent).toBe(0);
  });

  it("cuidador sem nenhum token de push: marca como avisado (ninguém a alcançar), sem ler o perfil nem repetir", async () => {
    vi.mocked(db.getPausesNeedingNotice).mockResolvedValue([{ openId: "maria", reason: "no_signal" }]);
    vi.mocked(dbPush.getPushTokensForOpenIds).mockResolvedValue([]);

    const result = await runDmsPauses(NOW);

    expect(push.sendExpoPush).not.toHaveBeenCalled();
    expect(dbCore.getUserData).not.toHaveBeenCalled();
    expect(db.markPauseNoticeSent).toHaveBeenCalledWith("maria");
    expect(result.noticesSent).toBe(0);
  });

  it("sem cuidador vinculado: marca como avisado, sem push", async () => {
    vi.mocked(db.getPausesNeedingNotice).mockResolvedValue([{ openId: "maria", reason: "logged_out" }]);
    vi.mocked(dbLinks.getActiveCaregiversForMonitored).mockResolvedValue([]);

    await runDmsPauses(NOW);

    expect(push.sendExpoPush).not.toHaveBeenCalled();
    expect(db.markPauseNoticeSent).toHaveBeenCalledWith("maria");
  });
});

describe("verificação diária: ping", () => {
  it("manda push silencioso { type: 'ping' } só aos tokens de idosos não pausados", async () => {
    withDevice("T1", "maria");
    vi.mocked(push.sendExpoDataPush).mockResolvedValue([{ token: "T1", ticketId: "t-1", deviceNotRegistered: false }]);

    const result = await runDmsPauses(NOW);

    expect(dbPush.getPushTokensWithOwner).toHaveBeenCalledWith(["maria"]);
    expect(push.sendExpoDataPush).toHaveBeenCalledWith(["T1"], { type: "ping" });
    expect(result.pinged).toBe(1);
  });

  it("uma vez a cada 24 h", async () => {
    withDevice();
    vi.mocked(push.sendExpoDataPush).mockResolvedValue([{ token: "T1", ticketId: "t-1", deviceNotRegistered: false }]);

    await runDmsPauses(NOW);
    await runDmsPauses(later(5));
    await runDmsPauses(later(23 * 60));
    expect(push.sendExpoDataPush).toHaveBeenCalledTimes(1);

    await runDmsPauses(later(25 * 60));
    expect(push.sendExpoDataPush).toHaveBeenCalledTimes(2);
  });

  it("conta sem token (app antigo que nunca registrou) não é pingada nem pausada", async () => {
    vi.mocked(db.getPreRegisterCandidates).mockResolvedValue([
      { openId: "vovo", alarms: [], timezone: null, eventTimezone: null, managed: null },
    ]);
    vi.mocked(dbPush.getPushTokensWithOwner).mockResolvedValue([]);

    await runDmsPauses(NOW);

    expect(push.sendExpoDataPush).not.toHaveBeenCalled();
    expect(db.pauseDms).not.toHaveBeenCalled();
  });

  it("DeviceNotRegistered no ticket e conta sem nenhum token: apaga o token e pausa como app_removed", async () => {
    withDevice("T1", "maria");
    vi.mocked(push.sendExpoDataPush).mockResolvedValue([{ token: "T1", ticketId: null, deviceNotRegistered: true }]);
    vi.mocked(dbPush.countPushTokens).mockResolvedValue(0);

    const result = await runDmsPauses(NOW);

    expect(dbPush.deletePushToken).toHaveBeenCalledWith("T1");
    expect(db.pauseDms).toHaveBeenCalledWith("maria", "app_removed");
    expect(result.paused).toBe(1);
  });

  it("DeviceNotRegistered mas a conta ainda tem outro token (reinstalou, ou outro aparelho): apaga o morto e NÃO pausa", async () => {
    withDevice("TVELHO", "maria");
    vi.mocked(push.sendExpoDataPush).mockResolvedValue([{ token: "TVELHO", ticketId: null, deviceNotRegistered: true }]);
    vi.mocked(dbPush.countPushTokens).mockResolvedValue(1);

    await runDmsPauses(NOW);

    expect(dbPush.deletePushToken).toHaveBeenCalledWith("TVELHO");
    expect(db.pauseDms).not.toHaveBeenCalled();
  });

  it("ping aceito (token vivo) não pausa nem apaga nada", async () => {
    withDevice();
    vi.mocked(push.sendExpoDataPush).mockResolvedValue([{ token: "T1", ticketId: "t-1", deviceNotRegistered: false }]);

    await runDmsPauses(NOW);

    expect(db.pauseDms).not.toHaveBeenCalled();
    expect(dbPush.deletePushToken).not.toHaveBeenCalled();
  });
});

describe("verificação diária: recibos", () => {
  const receiptError = (error: string) => ({ "t-1": { status: "error" as const, details: { error } } });

  async function pingOnce() {
    withDevice("T1", "maria");
    vi.mocked(push.sendExpoDataPush).mockResolvedValueOnce([
      { token: "T1", ticketId: "t-1", deviceNotRegistered: false },
    ]);
    await runDmsPauses(NOW);
  }

  it("recibo com DeviceNotRegistered na rodada seguinte: apaga o token e pausa como app_removed", async () => {
    await pingOnce();
    expect(db.pauseDms).not.toHaveBeenCalled();
    vi.mocked(push.fetchExpoReceipts).mockResolvedValue(receiptError("DeviceNotRegistered"));

    const result = await runDmsPauses(later(5));

    expect(push.fetchExpoReceipts).toHaveBeenCalledWith(["t-1"]);
    expect(dbPush.deletePushToken).toHaveBeenCalledWith("T1");
    expect(db.pauseDms).toHaveBeenCalledWith("maria", "app_removed");
    expect(result.paused).toBe(1);
  });

  it("recibo consumido não é consultado de novo", async () => {
    await pingOnce();
    vi.mocked(push.fetchExpoReceipts).mockResolvedValue(receiptError("DeviceNotRegistered"));

    await runDmsPauses(later(5));
    await runDmsPauses(later(10));

    expect(push.fetchExpoReceipts).toHaveBeenCalledTimes(1);
  });

  it("recibo DeviceNotRegistered com outro token na conta: não pausa", async () => {
    await pingOnce();
    vi.mocked(push.fetchExpoReceipts).mockResolvedValue(receiptError("DeviceNotRegistered"));
    vi.mocked(dbPush.countPushTokens).mockResolvedValue(1);

    await runDmsPauses(later(5));

    expect(db.pauseDms).not.toHaveBeenCalled();
  });

  it("recibo ok: nada acontece e o ticket sai da fila", async () => {
    await pingOnce();
    vi.mocked(push.fetchExpoReceipts).mockResolvedValue({ "t-1": { status: "ok" } });

    await runDmsPauses(later(5));
    await runDmsPauses(later(10));

    expect(db.pauseDms).not.toHaveBeenCalled();
    expect(dbPush.deletePushToken).not.toHaveBeenCalled();
    expect(push.fetchExpoReceipts).toHaveBeenCalledTimes(1);
  });

  it("recibo ainda indisponível: o ticket fica e é consultado de novo", async () => {
    await pingOnce();

    await runDmsPauses(later(5));
    await runDmsPauses(later(10));

    expect(push.fetchExpoReceipts).toHaveBeenCalledTimes(2);
    expect(db.pauseDms).not.toHaveBeenCalled();
  });

  it("erro de recibo que não é DeviceNotRegistered não apaga token nem pausa", async () => {
    await pingOnce();
    vi.mocked(push.fetchExpoReceipts).mockResolvedValue(receiptError("MessageRateExceeded"));

    await runDmsPauses(later(5));

    expect(dbPush.deletePushToken).not.toHaveBeenCalled();
    expect(db.pauseDms).not.toHaveBeenCalled();
  });

  it("ticket com mais de 24 h é descartado sem consulta", async () => {
    await pingOnce();

    await runDmsPauses(later(25 * 60));

    expect(push.fetchExpoReceipts).not.toHaveBeenCalled();
  });
});
