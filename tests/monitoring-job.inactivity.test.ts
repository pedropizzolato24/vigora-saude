/**
 * monitoring-job.inactivity.test.ts
 *
 * Falso alarme por inatividade (Anexo B do spec
 * docs/design/2026-07-12-monitoring-account-ownership.md):
 * o Passo 2 do dead man's switch não pode escalar aos contatos por PURA
 * ausência de heartbeat — logout, desinstalação ou app em segundo plano não
 * são sinal de perigo. Só escala quando há um evento esperado NÃO confirmado
 * ('missed' | 'not_sent') na janela de look-back.
 *
 * Modelo por CONTA (openId): liveness em account_liveness, contatos/nome em
 * user_data — o job nunca toca em deviceId.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../server/db-monitoring", () => ({
  getExpiredPendingEvents: vi.fn(async () => []),
  getInactiveAccounts: vi.fn(async () => []),
  getAccountLiveness: vi.fn(async () => null),
  getWarningHistory: vi.fn(async () => []),
  hasUnconfirmedEvents: vi.fn(async () => false),
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

const THREE_HOURS_AGO = new Date(Date.now() - 3 * 60 * 60 * 1000);

const inactiveAccount = {
  openId: "user-1",
  lastSeenAt: THREE_HOURS_AGO,
  lastLocation: null,
  lastLocationAt: null,
  lastDeviceId: "dev-1",
  appVersion: null,
} as any;

const accountData = {
  openId: "user-1",
  anamnesis: { fullName: "Seu José" },
  emergencyContacts: [
    { id: "1", name: "Filha", phone: "+5551999999999", relation: "Filha", whatsapp: true, consentToAlerts: true },
  ],
} as any;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(db.getInactiveAccounts).mockResolvedValue([inactiveAccount]);
  vi.mocked(db.claimWarning).mockResolvedValue(1);
  vi.mocked(accountDb.getUserData).mockResolvedValue(accountData);
  vi.mocked(accountDb.getUserByOpenId).mockResolvedValue({ name: "Seu José" } as any);
  vi.mocked(whatsapp.isWhatsAppApiConfigured).mockReturnValue(true);
  vi.mocked(whatsapp.sendWhatsAppMessage).mockResolvedValue({ success: true } as any);
});

describe("Passo 2 — escalação por inatividade gateada por evento não confirmado", () => {
  it("NÃO escala conta inativa sem evento não confirmado (falso alarme)", async () => {
    vi.mocked(db.hasUnconfirmedEvents).mockResolvedValue(false);

    await runMonitoringJob();

    expect(db.claimWarning).not.toHaveBeenCalled();
    expect(whatsapp.sendWhatsAppMessage).not.toHaveBeenCalled();
    // Sanidade: o job chegou aos Passos 3/4 (não morreu dentro do Passo 2)
    expect(db.getMissedCheckinEvents).toHaveBeenCalled();
  });

  it("ESCALA conta inativa COM evento não confirmado (perigo real preservado)", async () => {
    vi.mocked(db.hasUnconfirmedEvents).mockResolvedValue(true);

    await runMonitoringJob();

    expect(db.claimWarning).toHaveBeenCalledTimes(1);
    expect(vi.mocked(db.claimWarning).mock.calls[0][0].openId).toBe("user-1");
    expect(whatsapp.sendWhatsAppMessage).toHaveBeenCalledTimes(1);
  });
});
