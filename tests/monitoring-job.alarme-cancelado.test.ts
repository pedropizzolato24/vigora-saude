/**
 * monitoring-job.alarme-cancelado.test.ts
 *
 * Regressão do alarme falso: desativar (ou apagar) um alarme não cancelava o
 * evento que ele já havia pré-registrado no servidor.
 *
 * `syncAlarmsToServer` só CRIA evento pendente para alarme habilitado — quando
 * o usuário desativa o alarme, a função apenas pula o item e o evento que já
 * estava no banco continua pendente. Cinco minutos depois do horário o Passo 1
 * o resolvia como 'missed'/'not_sent' e a escada disparava WhatsApp para os
 * contatos de emergência e push para os cuidadores, por um alarme que o usuário
 * desligou de propósito.
 *
 * A agenda autoritativa da conta está em `user_data.alarms` (sobe no cloud
 * backup). O Passo 1 passa a consultá-la antes de resolver.
 *
 * DIREÇÃO DO ERRO IMPORTA: falso positivo assusta a família; falso negativo
 * cala o dead man's switch. Por isso só cancelamos com PROVA POSITIVA de que o
 * alarme saiu do ar — blob ausente ou sem a lista de alarmes escala como antes.
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
  deleteAlarmEvent: vi.fn(async () => undefined),
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

import { isAlarmStillArmed, runMonitoringJob } from "../server/monitoring-job";
import * as db from "../server/db-monitoring";
import * as accountDb from "../server/db";

const SCHEDULED_AT = new Date(Date.now() - 20 * 60 * 1000);

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

/** Conta viva depois do disparo: sem o cancelamento, isto vira 'missed'. */
const livenessDepoisDoDisparo = {
  openId: "user-1",
  lastSeenAt: new Date(SCHEDULED_AT.getTime() + 60 * 1000),
  lastLocation: null,
  lastLocationAt: null,
  lastDeviceId: "dev-1",
  appVersion: null,
} as any;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(db.getExpiredPendingEvents).mockResolvedValue([pendingEvent]);
  vi.mocked(db.getAccountLiveness).mockResolvedValue(livenessDepoisDoDisparo);
});

describe("isAlarmStillArmed — prova positiva antes de cancelar", () => {
  it("alarme habilitado na agenda → segue armado", () => {
    expect(isAlarmStillArmed([{ id: "alarm-1", enabled: true }], "alarm-1")).toBe(true);
  });

  it("alarme desabilitado na agenda → não está mais armado", () => {
    expect(isAlarmStillArmed([{ id: "alarm-1", enabled: false }], "alarm-1")).toBe(false);
  });

  it("alarme ausente de uma agenda existente (apagado) → não está mais armado", () => {
    expect(isAlarmStillArmed([{ id: "outro", enabled: true }], "alarm-1")).toBe(false);
  });

  it("agenda vazia é agenda: o usuário apagou tudo", () => {
    expect(isAlarmStillArmed([], "alarm-1")).toBe(false);
  });

  it("sem agenda no servidor (null/undefined) → assume armado, NUNCA cala o switch", () => {
    expect(isAlarmStillArmed(null, "alarm-1")).toBe(true);
    expect(isAlarmStillArmed(undefined, "alarm-1")).toBe(true);
  });

  it("agenda corrompida (não é lista) → assume armado", () => {
    expect(isAlarmStillArmed({ nao: "e uma lista" } as any, "alarm-1")).toBe(true);
  });

  it("item sem 'enabled' explícito conta como armado (formato antigo)", () => {
    expect(isAlarmStillArmed([{ id: "alarm-1" }], "alarm-1")).toBe(true);
  });
});

describe("Passo 1 — evento de alarme desativado não escala", () => {
  it("alarme desativado → evento apagado, sem virar 'missed'", async () => {
    vi.mocked(accountDb.getUserData).mockResolvedValue({
      openId: "user-1",
      alarms: [{ id: "alarm-1", enabled: false }],
    } as any);

    await runMonitoringJob();

    expect(db.deleteAlarmEvent).toHaveBeenCalledWith(11);
    expect(db.updateAlarmEventStatus).not.toHaveBeenCalled();
  });

  it("alarme apagado pelo usuário → evento apagado", async () => {
    vi.mocked(accountDb.getUserData).mockResolvedValue({
      openId: "user-1",
      alarms: [{ id: "outro-alarme", enabled: true }],
    } as any);

    await runMonitoringJob();

    expect(db.deleteAlarmEvent).toHaveBeenCalledWith(11);
    expect(db.updateAlarmEventStatus).not.toHaveBeenCalled();
  });

  it("alarme ainda habilitado → resolve normalmente como 'missed'", async () => {
    vi.mocked(accountDb.getUserData).mockResolvedValue({
      openId: "user-1",
      alarms: [{ id: "alarm-1", enabled: true }],
    } as any);

    await runMonitoringJob();

    expect(db.updateAlarmEventStatus).toHaveBeenCalledWith(11, "missed");
    expect(db.deleteAlarmEvent).not.toHaveBeenCalled();
  });

  it("conta sem user_data no servidor → escala como antes (não cala o switch)", async () => {
    vi.mocked(accountDb.getUserData).mockResolvedValue(undefined);

    await runMonitoringJob();

    expect(db.updateAlarmEventStatus).toHaveBeenCalledWith(11, "missed");
    expect(db.deleteAlarmEvent).not.toHaveBeenCalled();
  });

  it("check-in diário nunca é cancelado: não vive na lista de alarmes do usuário", async () => {
    vi.mocked(db.getExpiredPendingEvents).mockResolvedValue([
      { ...pendingEvent, id: 12, alarmId: "checkin-daily" },
    ]);
    vi.mocked(accountDb.getUserData).mockResolvedValue({
      openId: "user-1",
      alarms: [{ id: "alarm-1", enabled: true }],
    } as any);

    await runMonitoringJob();

    expect(db.updateAlarmEventStatus).toHaveBeenCalledWith(12, "missed");
    expect(db.deleteAlarmEvent).not.toHaveBeenCalled();
  });

  it("lê a agenda uma vez por conta, não uma vez por evento", async () => {
    vi.mocked(db.getExpiredPendingEvents).mockResolvedValue([
      pendingEvent,
      { ...pendingEvent, id: 12, alarmId: "alarm-2" },
      { ...pendingEvent, id: 13, alarmId: "alarm-3" },
    ]);
    vi.mocked(accountDb.getUserData).mockResolvedValue({
      openId: "user-1",
      alarms: [{ id: "alarm-1", enabled: true }],
    } as any);

    await runMonitoringJob();

    expect(vi.mocked(accountDb.getUserData).mock.calls.length).toBe(1);
  });
});
