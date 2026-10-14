/**
 * monitoring-job.scheduler.test.ts
 *
 * O agendador dispara o job a cada 5 minutos. Se um ciclo demorar mais que isso
 * (Expo ou banco lentos), um segundo ciclo em paralelo leria os mesmos eventos
 * vencidos e mandaria a mesma escalação duas vezes por WhatsApp/SMS. Enquanto o
 * ciclo anterior não termina, a rodada nova é pulada.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

vi.mock("../server/db-account", () => ({
  purgeAbandonedAnonymousAccounts: vi.fn(async () => 0),
}));

vi.mock("../server/db-managed-alarm-list", () => ({
  getManagedList: vi.fn(async () => null),
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

vi.mock("../server/dms-preregister", () => ({
  runPreRegistration: vi.fn(async () => ({ registered: 0 })),
}));
vi.mock("../server/dms-pauses", () => ({
  runDmsPauses: vi.fn(async () => ({ paused: 0, noticesSent: 0, pinged: 0 })),
}));
vi.mock("../server/managed-alarms-housekeeping", () => ({
  runManagementHousekeeping: vi.fn(async () => ({ expired: 0, visibleNotices: 0 })),
}));

import { startMonitoringScheduler } from "../server/monitoring-job";
import * as preRegister from "../server/dms-preregister";

const FIVE_MIN = 5 * 60 * 1000;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("startMonitoringScheduler", () => {
  it("pula a rodada (com log) enquanto o ciclo anterior ainda está rodando; volta a rodar depois", async () => {
    let release: () => void = () => undefined;
    vi.mocked(preRegister.runPreRegistration).mockImplementationOnce(
      () => new Promise((resolve) => (release = () => resolve({ registered: 0 })))
    );

    startMonitoringScheduler();
    expect(preRegister.runPreRegistration).toHaveBeenCalledTimes(1);

    // Ciclo 1 preso: a rodada dos 5 minutos não começa outro em paralelo.
    await vi.advanceTimersByTimeAsync(FIVE_MIN);
    expect(preRegister.runPreRegistration).toHaveBeenCalledTimes(1);
    expect(vi.mocked(console.warn).mock.calls.flat().join(" ")).toContain("ainda está rodando");

    // Ciclo 1 termina: a rodada seguinte roda normalmente.
    release();
    await vi.advanceTimersByTimeAsync(FIVE_MIN);
    expect(preRegister.runPreRegistration).toHaveBeenCalledTimes(2);
  });
});
