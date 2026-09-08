/**
 * monitoring-job.sms.test.ts
 *
 * O SMS sai JUNTO com o WhatsApp na escalação, não em cascata.
 *
 * Os dois canais falham por motivos diferentes (o WhatsApp precisa de internet
 * e do app no aparelho do contato; o SMS só de sinal de celular). Um aviso de
 * dead man's switch que não chega a ninguém custa mais caro que a mensagem
 * duplicada — então o contato conta como alcançado se QUALQUER um entregou, e
 * a claim só é liberada para retry quando NENHUM canal (nem o push) chegou.
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

vi.mock("../server/sms", () => ({
  isSmsConfigured: vi.fn(() => true),
  sendSms: vi.fn(async () => ({ success: true })),
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
import * as sms from "../server/sms";

const hoursAgo = (h: number) => new Date(Date.now() - h * 60 * 60 * 1000);

const accountData = {
  openId: "user-1",
  anamnesis: { fullName: "Seu José" },
  emergencyContacts: [
    { id: "1", name: "Filha", phone: "+5551999999999", relation: "Filha", whatsapp: true, consentToAlerts: true },
  ],
} as any;

/** Conta com alarme sem resposta há 3h => nível 2 do Passo 2. */
function armEscalation() {
  vi.mocked(db.getAccountsWithUnconfirmedEvents).mockResolvedValue([
    { openId: "user-1", oldestUnconfirmedAt: hoursAgo(3) },
  ] as any);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(db.claimWarning).mockResolvedValue(1);
  vi.mocked(accountDb.getUserData).mockResolvedValue(accountData);
  vi.mocked(accountDb.getUserByOpenId).mockResolvedValue({ name: "Seu José" } as any);
  vi.mocked(whatsapp.isWhatsAppApiConfigured).mockReturnValue(true);
  vi.mocked(whatsapp.sendWhatsAppMessage).mockResolvedValue({ success: true } as any);
  vi.mocked(sms.isSmsConfigured).mockReturnValue(true);
  vi.mocked(sms.sendSms).mockResolvedValue({ success: true } as any);
});

describe("escalação por dois canais", () => {
  it("manda WhatsApp E SMS para o mesmo contato", async () => {
    armEscalation();

    await runMonitoringJob();

    expect(whatsapp.sendWhatsAppMessage).toHaveBeenCalledTimes(1);
    expect(sms.sendSms).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sms.sendSms).mock.calls[0][0]).toBe("+5551999999999");
  });

  it("o texto do SMS é curto e não repete a mensagem longa do WhatsApp", async () => {
    armEscalation();

    await runMonitoringJob();

    const whatsappText = vi.mocked(whatsapp.sendWhatsAppMessage).mock.calls[0][1];
    const smsText = vi.mocked(sms.sendSms).mock.calls[0][1];

    expect(smsText).toContain("Seu José");
    expect(smsText.length).toBeLessThan(whatsappText.length);
    // Emoji cortaria o segmento de 160 para 70 chars — a dobra final é do
    // toGsm7(), mas o texto já nasce sem eles.
    expect(smsText).not.toMatch(/[⚠️🚨📍]/u);
  });

  it("SMS entregue salva a escalação quando o WhatsApp falha", async () => {
    armEscalation();
    vi.mocked(whatsapp.sendWhatsAppMessage).mockResolvedValue({
      success: false,
      error: "recipient not on WhatsApp",
    } as any);

    await runMonitoringJob();

    // Alcançou 1 contato: a claim é confirmada, não liberada para retry.
    expect(db.updateWarningResult).toHaveBeenCalledWith(1, 1, false);
    expect(db.releaseWarning).not.toHaveBeenCalled();
  });

  it("libera a claim para retry só quando NENHUM canal entrega", async () => {
    armEscalation();
    vi.mocked(whatsapp.sendWhatsAppMessage).mockResolvedValue({ success: false } as any);
    vi.mocked(sms.sendSms).mockResolvedValue({ success: false } as any);

    await runMonitoringJob();

    expect(db.releaseWarning).toHaveBeenCalledWith(1);
    expect(db.updateWarningResult).not.toHaveBeenCalled();
  });

  it("Twilio ausente não derruba a escalação — o WhatsApp segue sozinho", async () => {
    armEscalation();
    vi.mocked(sms.isSmsConfigured).mockReturnValue(false);

    await runMonitoringJob();

    expect(sms.sendSms).not.toHaveBeenCalled();
    expect(whatsapp.sendWhatsAppMessage).toHaveBeenCalledTimes(1);
    expect(db.updateWarningResult).toHaveBeenCalledWith(1, 1, false);
  });

  it("contato sem WhatsApp ainda recebe o SMS", async () => {
    armEscalation();
    vi.mocked(accountDb.getUserData).mockResolvedValue({
      ...accountData,
      emergencyContacts: [
        { id: "1", name: "Filha", phone: "+5551999999999", relation: "Filha", whatsapp: false, consentToAlerts: true },
      ],
    } as any);

    await runMonitoringJob();

    expect(whatsapp.sendWhatsAppMessage).not.toHaveBeenCalled();
    expect(sms.sendSms).toHaveBeenCalledTimes(1);
    expect(db.updateWarningResult).toHaveBeenCalledWith(1, 1, false);
  });
});
