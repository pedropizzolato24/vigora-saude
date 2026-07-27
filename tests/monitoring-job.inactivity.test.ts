/**
 * monitoring-job.inactivity.test.ts
 *
 * Passo 2 — a escada de escalação é ancorada na IDADE DO EVENTO não confirmado,
 * não na ausência de heartbeat.
 *
 * O critério antigo ("conta sem heartbeat há 30min E tem evento não
 * confirmado") media a coisa errada nos dois sentidos, porque o heartbeat só
 * corre com o app em primeiro plano:
 *  - RUÍDO: quem responde ao alarme e fecha o app fica "offline" para sempre.
 *  - BURACO: quem deixa o app ABERTO e não responde nunca entrava na lista de
 *    inativos, e a família NUNCA era avisada.
 *
 * O gate anti-falso-alarme do Anexo B (spec 2026-07-12) continua valendo e fica
 * ainda mais forte: sem evento não confirmado não há escalação — agora por
 * construção da query, não por um `if` posterior.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../server/db-monitoring", () => ({
  getExpiredPendingEvents: vi.fn(async () => []),
  getAccountsWithUnconfirmedEvents: vi.fn(async () => []),
  getAccountLiveness: vi.fn(async () => null),
  getWarningHistory: vi.fn(async () => []),
  claimWarning: vi.fn(async () => 1),
  updateWarningResult: vi.fn(async () => undefined),
  releaseWarning: vi.fn(async () => undefined),
  getMissedCheckinEvents: vi.fn(async () => []),
  getMissedMedicationEvents: vi.fn(async () => []),
  markEventWarningSent: vi.fn(async () => undefined),
  updateAlarmEventStatus: vi.fn(async () => undefined),
  purgeStaleData: vi.fn(async () => ({ alarmEvents: 0, warningLog: 0, locationsCleared: 0 })),
}));

vi.mock("../server/db", () => ({
  getUserData: vi.fn(async () => undefined),
  getUserByOpenId: vi.fn(async () => undefined),
}));

vi.mock("../server/whatsapp", () => ({
  isWhatsAppApiConfigured: vi.fn(() => true),
  sendWhatsAppMessage: vi.fn(async () => ({ success: true })),
}));

vi.mock("../server/db-links", () => ({
  getActiveCaregiversForMonitored: vi.fn(async () => []),
}));

vi.mock("../server/db-push", () => ({
  getPushTokensForOpenIds: vi.fn(async () => []),
}));

vi.mock("../server/push", () => ({
  sendExpoPush: vi.fn(async () => 0),
}));

import { runMonitoringJob } from "../server/monitoring-job";
import * as db from "../server/db-monitoring";
import * as accountDb from "../server/db";
import * as whatsapp from "../server/whatsapp";

const hoursAgo = (h: number) => new Date(Date.now() - h * 60 * 60 * 1000);

const accountData = {
  openId: "user-1",
  anamnesis: { fullName: "Seu José" },
  emergencyContacts: [
    { id: "1", name: "Filha", phone: "+5551999999999", relation: "Filha", whatsapp: true, consentToAlerts: true },
  ],
} as any;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(db.claimWarning).mockResolvedValue(1);
  vi.mocked(accountDb.getUserData).mockResolvedValue(accountData);
  vi.mocked(accountDb.getUserByOpenId).mockResolvedValue({ name: "Seu José" } as any);
  vi.mocked(whatsapp.isWhatsAppApiConfigured).mockReturnValue(true);
  vi.mocked(whatsapp.sendWhatsAppMessage).mockResolvedValue({ success: true } as any);
});

describe("Passo 2 — escalação ancorada no evento não confirmado", () => {
  it("NÃO escala quando não há evento não confirmado (sem falso alarme)", async () => {
    vi.mocked(db.getAccountsWithUnconfirmedEvents).mockResolvedValue([]);

    await runMonitoringJob();

    expect(db.claimWarning).not.toHaveBeenCalled();
    expect(whatsapp.sendWhatsAppMessage).not.toHaveBeenCalled();
    // Sanidade: o job chegou aos Passos 3/4 (não morreu dentro do Passo 2)
    expect(db.getMissedCheckinEvents).toHaveBeenCalled();
  });

  it("ESCALA com evento não confirmado mesmo com heartbeat FRESCO (fecha o buraco do app aberto)", async () => {
    vi.mocked(db.getAccountsWithUnconfirmedEvents).mockResolvedValue([
      { openId: "user-1", oldestUnconfirmedAt: hoursAgo(3) },
    ]);
    // Heartbeat AGORA — no critério antigo isto tirava a conta da lista de
    // inativos e a família nunca era avisada, mesmo com o alarme sem resposta.
    vi.mocked(db.getAccountLiveness).mockResolvedValue({
      openId: "user-1",
      lastSeenAt: new Date(),
      lastLocation: null,
    } as any);

    await runMonitoringJob();

    expect(db.claimWarning).toHaveBeenCalledTimes(1);
    expect(vi.mocked(db.claimWarning).mock.calls[0][0].openId).toBe("user-1");
    expect(whatsapp.sendWhatsAppMessage).toHaveBeenCalledTimes(1);
  });

  it("o nível vem da idade do evento, não do último heartbeat", async () => {
    vi.mocked(db.getAccountsWithUnconfirmedEvents).mockResolvedValue([
      { openId: "user-1", oldestUnconfirmedAt: hoursAgo(7) },
    ]);

    await runMonitoringJob();

    // 7h sem resposta => nível 3 (limiar de 6h)
    expect(db.claimWarning).toHaveBeenCalledWith(
      expect.objectContaining({ openId: "user-1", level: 3 })
    );
  });

  it("evento recente demais (abaixo de 30min) ainda não escala", async () => {
    vi.mocked(db.getAccountsWithUnconfirmedEvents).mockResolvedValue([
      { openId: "user-1", oldestUnconfirmedAt: hoursAgo(0.2) },
    ]);

    await runMonitoringJob();

    expect(db.claimWarning).not.toHaveBeenCalled();
  });

  it("dedup: não reenvia o mesmo nível dentro da janela mínima", async () => {
    vi.mocked(db.getAccountsWithUnconfirmedEvents).mockResolvedValue([
      { openId: "user-1", oldestUnconfirmedAt: hoursAgo(7) },
    ]);
    vi.mocked(db.getWarningHistory).mockResolvedValue([
      { level: 3, sentAt: new Date(Date.now() - 10 * 60 * 1000) },
    ] as any);

    await runMonitoringJob();

    expect(db.claimWarning).not.toHaveBeenCalled();
    expect(whatsapp.sendWhatsAppMessage).not.toHaveBeenCalled();
  });

  it("a mensagem fala do alarme sem resposta, nunca de 'sem atividade no app'", async () => {
    vi.mocked(db.getAccountsWithUnconfirmedEvents).mockResolvedValue([
      { openId: "user-1", oldestUnconfirmedAt: hoursAgo(3) },
    ]);

    await runMonitoringJob();

    const message = vi.mocked(whatsapp.sendWhatsAppMessage).mock.calls[0][1];
    expect(message).toContain("sem responder aos alarmes");
    expect(message).not.toContain("sem atividade");
  });
});
