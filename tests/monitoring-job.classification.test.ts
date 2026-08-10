/**
 * monitoring-job.classification.test.ts
 *
 * Passo 1 — classificação de evento pendente vencido:
 * a pergunta é "houve sinal de vida DEPOIS do horário do disparo?".
 *  - Sim  → 'missed' (o alarme tocou/podia tocar e ninguém respondeu).
 *  - Não  → 'not_sent' (celular desligado/sem conexão: o alarme nem tocou).
 * Regressão do bug "desliguei o celular antes do alarme e o cuidador recebeu
 * 'não respondeu'": o critério antigo aceitava heartbeat até 30min ANTES do
 * horário como prova de que o alarme tocou.
 *
 * Passo 4 — cópia por status:
 *  - 'missed'   → "não respondeu ao alarme"
 *  - 'not_sent' → "não foi entregue / pode estar desligado" (nunca acusar de
 *                  não responder um alarme que não tocou)
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// Simula o ambiente do Railway (UTC) — é onde o bug de fuso aparecia: sem
// timeZone explícito no toLocaleTimeString, 21:00 de Brasília virava "00:00"
// na mensagem ao cuidador. (Vitest isola cada arquivo em seu worker, então o
// TZ não vaza para os outros testes.)
process.env.TZ = "UTC";

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
  sendExpoPush: vi.fn(async () => 1),
}));

import { runMonitoringJob } from "../server/monitoring-job";
import * as db from "../server/db-monitoring";
import * as accountDb from "../server/db";
import * as links from "../server/db-links";
import * as dbPush from "../server/db-push";
import * as push from "../server/push";
import * as whatsapp from "../server/whatsapp";

const SCHEDULED_AT = new Date(Date.now() - 20 * 60 * 1000); // disparo há 20min

const pendingEvent = {
  id: 11,
  openId: "user-1",
  alarmId: "alarm-1",
  alarmDescription: "Remédio da pressão",
  scheduledAt: SCHEDULED_AT,
  status: "pending",
  warningSent: false,
  resolvedAt: null,
  createdAt: SCHEDULED_AT,
} as any;

const liveness = (lastSeenAt: Date) =>
  ({
    openId: "user-1",
    lastSeenAt,
    lastLocation: null,
    lastLocationAt: null,
    lastDeviceId: "dev-1",
    appVersion: null,
  }) as any;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Passo 1 — classificação por sinal de vida APÓS o horário do disparo", () => {
  it("vida depois do horário → 'missed' (alarme tocou, ninguém respondeu)", async () => {
    vi.mocked(db.getExpiredPendingEvents).mockResolvedValue([pendingEvent]);
    vi.mocked(db.getAccountLiveness).mockResolvedValue(
      liveness(new Date(SCHEDULED_AT.getTime() + 60 * 1000))
    );

    await runMonitoringJob();

    expect(db.updateAlarmEventStatus).toHaveBeenCalledWith(11, "missed");
  });

  it("celular desligado ANTES do alarme (heartbeat 5min antes) → 'not_sent', nunca 'missed'", async () => {
    vi.mocked(db.getExpiredPendingEvents).mockResolvedValue([pendingEvent]);
    vi.mocked(db.getAccountLiveness).mockResolvedValue(
      liveness(new Date(SCHEDULED_AT.getTime() - 5 * 60 * 1000))
    );

    await runMonitoringJob();

    expect(db.updateAlarmEventStatus).toHaveBeenCalledWith(11, "not_sent");
  });

  it("sem liveness nenhuma → 'not_sent'", async () => {
    vi.mocked(db.getExpiredPendingEvents).mockResolvedValue([pendingEvent]);
    vi.mocked(db.getAccountLiveness).mockResolvedValue(null);

    await runMonitoringJob();

    expect(db.updateAlarmEventStatus).toHaveBeenCalledWith(11, "not_sent");
  });
});

describe("Passo 4 — cópia por status do evento", () => {
  const accountData = {
    openId: "user-1",
    anamnesis: { fullName: "Seu José" },
    emergencyContacts: [
      { id: "1", name: "Filha", phone: "+5551999999999", relation: "Filha", whatsapp: true, consentToAlerts: true },
    ],
  } as any;

  beforeEach(() => {
    vi.mocked(accountDb.getUserData).mockResolvedValue(accountData);
    vi.mocked(links.getActiveCaregiversForMonitored).mockResolvedValue([
      { caregiverOpenId: "cg-1" } as any,
    ]);
    vi.mocked(dbPush.getPushTokensForOpenIds).mockResolvedValue([
      { token: "ExpoTok[cg-1]" } as any,
    ]);
  });

  it("'not_sent' → 'não entregue / pode estar desligado' no push e no WhatsApp", async () => {
    vi.mocked(db.getMissedMedicationEvents).mockResolvedValue([
      { ...pendingEvent, status: "not_sent" },
    ]);

    await runMonitoringJob();

    const pushCall = vi.mocked(push.sendExpoPush).mock.calls[0];
    expect(pushCall[1].title).toContain("Alarme não entregue");
    expect(pushCall[1].body).toContain("desligado");
    expect(pushCall[1].body).not.toContain("não respondeu");

    const waMessage = vi.mocked(whatsapp.sendWhatsAppMessage).mock.calls[0][1];
    expect(waMessage).toContain("ALARME NÃO ENTREGUE");
    expect(waMessage).toContain("não pôde ser entregue");

    expect(db.markEventWarningSent).toHaveBeenCalledWith(11);
  });

  it("horário nas mensagens é o de Brasília, não o do servidor (UTC)", async () => {
    vi.mocked(db.getMissedMedicationEvents).mockResolvedValue([
      { ...pendingEvent, status: "missed" },
    ]);

    await runMonitoringJob();

    const expected = SCHEDULED_AT.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Sao_Paulo",
    });
    const waMessage = vi.mocked(whatsapp.sendWhatsAppMessage).mock.calls[0][1];
    expect(waMessage).toContain(`previsto para ${expected}`);
  });

  it("horário respeita o fuso do EVENTO: Acre não recebe horário de Brasília", async () => {
    // Regressão: "America/Sao_Paulo" era fixo no servidor, então um alarme das
    // 21:00 no Acre (UTC-5) chegava ao cuidador como 23:00. Horário falso
    // dentro de alerta de saúde é pior do que horário nenhum.
    vi.mocked(db.getMissedMedicationEvents).mockResolvedValue([
      { ...pendingEvent, status: "missed", timezone: "America/Rio_Branco" },
    ]);

    await runMonitoringJob();

    const acre = SCHEDULED_AT.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Rio_Branco",
    });
    const brasilia = SCHEDULED_AT.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Sao_Paulo",
    });
    const waMessage = vi.mocked(whatsapp.sendWhatsAppMessage).mock.calls[0][1];
    expect(waMessage).toContain(`previsto para ${acre}`);
    expect(waMessage).not.toContain(`previsto para ${brasilia}`);
  });

  it("'missed' → cópia 'não respondeu' preservada", async () => {
    vi.mocked(db.getMissedMedicationEvents).mockResolvedValue([
      { ...pendingEvent, status: "missed" },
    ]);

    await runMonitoringJob();

    const pushCall = vi.mocked(push.sendExpoPush).mock.calls[0];
    expect(pushCall[1].title).toContain("Alarme não respondido");
    expect(pushCall[1].body).toContain("não respondeu");

    const waMessage = vi.mocked(whatsapp.sendWhatsAppMessage).mock.calls[0][1];
    expect(waMessage).toContain("ALARME NÃO RESPONDIDO");
  });
});
