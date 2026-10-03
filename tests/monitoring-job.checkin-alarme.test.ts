/**
 * Fase 3: o check-in é um alarme com prazo PRÓPRIO por evento (graceMinutes) e
 * o evento do sistema antigo ('checkin-daily') não escala depois da migração.
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
  purgeStaleData: vi.fn(async () => ({ alarmEvents: 0, alarmChanges: 0, warningLog: 0, locationsCleared: 0 })),
}));
vi.mock("../server/db", () => ({
  getUserData: vi.fn(async () => undefined),
  getUserByOpenId: vi.fn(async () => undefined),
}));
vi.mock("../server/whatsapp", () => ({
  isWhatsAppApiConfigured: vi.fn(() => true),
  sendWhatsAppMessage: vi.fn(async () => ({ success: true })),
}));
vi.mock("../server/db-links", () => ({ getActiveCaregiversForMonitored: vi.fn(async () => []) }));
vi.mock("../server/db-push", () => ({ getPushTokensForOpenIds: vi.fn(async () => []) }));
vi.mock("../server/push", () => ({ sendExpoPush: vi.fn(async () => 1) }));

import { runMonitoringJob } from "../server/monitoring-job";
import * as db from "../server/db-monitoring";
import * as accountDb from "../server/db";

const minAgo = (m: number) => new Date(Date.now() - m * 60_000);

function event(over: Record<string, unknown> = {}) {
  const scheduledAt = (over.scheduledAt as Date) ?? minAgo(20);
  return {
    id: 21,
    openId: "user-1",
    alarmId: "11111111-1111-4111-8111-111111111111",
    alarmDescription: "Check-in",
    kind: "checkin",
    graceMinutes: null,
    scheduledAt,
    status: "pending",
    warningSent: false,
    resolvedAt: null,
    createdAt: scheduledAt,
    ...over,
  } as never;
}

const vivo = (scheduledAt: Date) =>
  ({ openId: "user-1", lastSeenAt: new Date(scheduledAt.getTime() + 60_000), lastLocation: null, lastLocationAt: null, lastDeviceId: "d", appVersion: null }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(accountDb.getUserData).mockResolvedValue({
    openId: "user-1",
    alarms: [{ id: "11111111-1111-4111-8111-111111111111", enabled: true, kind: "checkin" }],
  } as never);
});

describe("Passo 1 — prazo por evento", () => {
  it("graceMinutes 15: com 10 min ainda não venceu", async () => {
    const e = event({ graceMinutes: 15, scheduledAt: minAgo(10) });
    vi.mocked(db.getExpiredPendingEvents).mockResolvedValue([e]);
    vi.mocked(db.getAccountLiveness).mockResolvedValue(vivo(minAgo(10)));

    await runMonitoringJob();

    expect(db.updateAlarmEventStatus).not.toHaveBeenCalled();
    expect(db.deleteAlarmEvent).not.toHaveBeenCalled();
  });

  it("check-in graceMinutes 15: com 16 min ainda está na folga do servidor", async () => {
    const e = event({ graceMinutes: 15, scheduledAt: minAgo(16) });
    vi.mocked(db.getExpiredPendingEvents).mockResolvedValue([e]);
    vi.mocked(db.getAccountLiveness).mockResolvedValue(vivo(minAgo(16)));

    await runMonitoringJob();

    expect(db.updateAlarmEventStatus).not.toHaveBeenCalled();
  });

  it("graceMinutes 15: com 18 min venceu e vira 'missed' (conta viva)", async () => {
    const e = event({ graceMinutes: 15, scheduledAt: minAgo(18) });
    vi.mocked(db.getExpiredPendingEvents).mockResolvedValue([e]);
    vi.mocked(db.getAccountLiveness).mockResolvedValue(vivo(minAgo(18)));

    await runMonitoringJob();

    expect(db.updateAlarmEventStatus).toHaveBeenCalledWith(21, "missed");
  });

  it("sem graceMinutes (remédio) vence aos 5 min como sempre", async () => {
    const e = event({ kind: null, graceMinutes: null, scheduledAt: minAgo(6) });
    vi.mocked(db.getExpiredPendingEvents).mockResolvedValue([e]);
    vi.mocked(db.getAccountLiveness).mockResolvedValue(vivo(minAgo(6)));

    await runMonitoringJob();

    expect(db.updateAlarmEventStatus).toHaveBeenCalledWith(21, "missed");
  });
});

describe("Passo 1 — check-in como alarme passa pela checagem de agenda", () => {
  it("check-in desativado na agenda: evento apagado, não escala", async () => {
    vi.mocked(accountDb.getUserData).mockResolvedValue({
      openId: "user-1",
      alarms: [{ id: "11111111-1111-4111-8111-111111111111", enabled: false, kind: "checkin" }],
    } as never);
    vi.mocked(db.getExpiredPendingEvents).mockResolvedValue([event()]);

    await runMonitoringJob();

    expect(db.deleteAlarmEvent).toHaveBeenCalledWith(21);
    expect(db.updateAlarmEventStatus).not.toHaveBeenCalled();
  });
});

describe("Passo 1 — evento do check-in antigo depois da migração", () => {
  const legacy = () => event({ alarmId: "checkin-daily", kind: null });

  it("conta já tem alarme de check-in: o evento antigo é apagado", async () => {
    vi.mocked(db.getExpiredPendingEvents).mockResolvedValue([legacy()]);

    await runMonitoringJob();

    expect(db.deleteAlarmEvent).toHaveBeenCalledWith(21);
    expect(db.updateAlarmEventStatus).not.toHaveBeenCalled();
  });

  it("conta ainda no sistema antigo (sem alarme de check-in): escala como antes", async () => {
    vi.mocked(accountDb.getUserData).mockResolvedValue({ openId: "user-1", alarms: [] } as never);
    vi.mocked(db.getExpiredPendingEvents).mockResolvedValue([legacy()]);
    vi.mocked(db.getAccountLiveness).mockResolvedValue(vivo(minAgo(20)));

    await runMonitoringJob();

    expect(db.deleteAlarmEvent).not.toHaveBeenCalled();
    expect(db.updateAlarmEventStatus).toHaveBeenCalledWith(21, "missed");
  });
});
