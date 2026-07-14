/**
 * monitoring-job.inactivity.test.ts
 *
 * Falso alarme por inatividade (Anexo B do spec
 * docs/design/2026-07-12-monitoring-account-ownership.md):
 * o Passo 2 do dead man's switch não pode escalar aos contatos por PURA
 * ausência de heartbeat — logout, desinstalação ou app em segundo plano não
 * são sinal de perigo. Só escala quando há um evento esperado NÃO confirmado
 * ('missed' | 'not_sent') na janela de look-back.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../server/db-monitoring", () => ({
  getExpiredPendingEvents: vi.fn(async () => []),
  getInactiveDevices: vi.fn(async () => []),
  getLastHeartbeat: vi.fn(async () => null),
  getWarningHistory: vi.fn(async () => []),
  getAppUser: vi.fn(async () => null),
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
import * as whatsapp from "../server/whatsapp";

const THREE_HOURS_AGO = new Date(Date.now() - 3 * 60 * 60 * 1000);

const inactiveDevice = {
  deviceId: "dev-1",
  lastSeenAt: THREE_HOURS_AGO,
  appVersion: null,
} as any;

const appUser = {
  deviceId: "dev-1",
  openId: "user-1",
  userName: "Seu José",
  emergencyContacts: [
    { name: "Filha", phone: "+5551999999999", whatsapp: true, consentToAlerts: true },
  ],
  lastLocation: null,
} as any;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(db.getInactiveDevices).mockResolvedValue([inactiveDevice]);
  vi.mocked(db.getAppUser).mockResolvedValue(appUser);
  vi.mocked(db.claimWarning).mockResolvedValue(1);
  vi.mocked(whatsapp.isWhatsAppApiConfigured).mockReturnValue(true);
  vi.mocked(whatsapp.sendWhatsAppMessage).mockResolvedValue({ success: true } as any);
});

describe("Passo 2 — escalação por inatividade gateada por evento não confirmado", () => {
  it("NÃO escala device inativo sem evento não confirmado (falso alarme)", async () => {
    vi.mocked(db.hasUnconfirmedEvents).mockResolvedValue(false);

    await runMonitoringJob();

    expect(db.claimWarning).not.toHaveBeenCalled();
    expect(whatsapp.sendWhatsAppMessage).not.toHaveBeenCalled();
    // Sanidade: o job chegou aos Passos 3/4 (não morreu dentro do Passo 2)
    expect(db.getMissedCheckinEvents).toHaveBeenCalled();
  });

  it("ESCALA device inativo COM evento não confirmado (perigo real preservado)", async () => {
    vi.mocked(db.hasUnconfirmedEvents).mockResolvedValue(true);

    await runMonitoringJob();

    expect(db.claimWarning).toHaveBeenCalledTimes(1);
    expect(whatsapp.sendWhatsAppMessage).toHaveBeenCalledTimes(1);
  });
});
