/**
 * managed-alarms-stale-backup.test.ts
 *
 * Conta gerenciada: quem decide se um alarme ainda é cobrado é a lista que o
 * celular CONFIRMOU (appliedAlarms − failedAlarmIds), nunca o backup
 * `user_data.alarms`, que chega pelo pushCloudData com atraso (debounce, sem
 * retry). Cenário: a cuidadora apaga o alarme A, o celular confirma, o backup
 * ainda tem A. O disparo de A que o servidor já tinha pré-registrado não pode
 * vencer como "não respondeu" e avisar a família.
 *
 * Roda o router `managedAlarms` e o job de verdade sobre os dublês em memória
 * (_managed-alarms-fakes) e uma tabela de eventos em memória.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type FakeEvent = {
  id: number;
  openId: string;
  alarmId: string;
  alarmDescription: string;
  scheduledAt: Date;
  status: "pending" | "confirmed" | "missed" | "not_sent";
  kind: string | null;
  graceMinutes: number | null;
  timezone: string | null;
  warningSent: boolean;
};

const events: FakeEvent[] = [];
const LEGACY_CHECKIN = "checkin-daily";
const unanswered = (e: FakeEvent) => e.status === "missed" || e.status === "not_sent";

vi.mock("../server/db-alarm-management", async () => (await import("./_managed-alarms-fakes")).fakeManagementModule);
vi.mock("../server/db-managed-alarm-list", async () => (await import("./_managed-alarms-fakes")).fakeListModule);
vi.mock("../server/db-links", async () => (await import("./_managed-alarms-fakes")).fakeLinksModule);
vi.mock("../server/db-push", async () => (await import("./_managed-alarms-fakes")).fakePushDbModule);
vi.mock("../server/push", async () => (await import("./_managed-alarms-fakes")).fakePushModule);
vi.mock("../server/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../server/db")>()),
  ...(await import("./_managed-alarms-fakes")).fakeDbOverrides,
}));
vi.mock("../server/alarm-changes", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../server/alarm-changes")>()),
  recordCaregiverAlarmChanges: vi.fn(async () => undefined),
}));
vi.mock("../server/db-monitoring", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../server/db-monitoring")>()),
  touchLiveness: vi.fn(async () => undefined),
  deleteFuturePendingEventsExcept: vi.fn(async (openId: string, keepAlarmIds: string[], now: Date) => {
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i];
      if (
        e.openId === openId &&
        e.status === "pending" &&
        e.scheduledAt > now &&
        e.alarmId !== LEGACY_CHECKIN &&
        !keepAlarmIds.includes(e.alarmId)
      ) {
        events.splice(i, 1);
      }
    }
  }),
  getExpiredPendingEvents: vi.fn(async (graceMinutes: number) =>
    events.filter(
      (e) => e.status === "pending" && e.scheduledAt.getTime() <= Date.now() - graceMinutes * 60_000
    )
  ),
  deleteAlarmEvent: vi.fn(async (id: number) => {
    const i = events.findIndex((e) => e.id === id);
    if (i >= 0) events.splice(i, 1);
  }),
  updateAlarmEventStatus: vi.fn(async (id: number, status: FakeEvent["status"]) => {
    const e = events.find((x) => x.id === id);
    if (e) e.status = status;
  }),
  // Celular deu sinal agora: sem a correção, o evento de A viraria 'missed'.
  getAccountLiveness: vi.fn(async () => ({ lastSeenAt: new Date() })),
  getAccountsWithUnconfirmedEvents: vi.fn(async () => {
    const byAccount = new Map<string, Date>();
    for (const e of events.filter(unanswered)) {
      const prev = byAccount.get(e.openId);
      if (!prev || e.scheduledAt < prev) byAccount.set(e.openId, e.scheduledAt);
    }
    return [...byAccount].map(([openId, oldestUnconfirmedAt]) => ({ openId, oldestUnconfirmedAt }));
  }),
  getWarningHistory: vi.fn(async () => []),
  claimWarning: vi.fn(async () => 1),
  updateWarningResult: vi.fn(async () => undefined),
  releaseWarning: vi.fn(async () => undefined),
  getMissedCheckinEvents: vi.fn(async () => []),
  getMissedMedicationEvents: vi.fn(async () => events.filter((e) => unanswered(e) && !e.warningSent)),
  markEventWarningSent: vi.fn(async (id: number) => {
    const e = events.find((x) => x.id === id);
    if (e) e.warningSent = true;
  }),
}));
vi.mock("../server/whatsapp", () => ({
  isWhatsAppApiConfigured: vi.fn(() => true),
  sendWhatsAppMessage: vi.fn(async () => ({ success: true })),
}));
vi.mock("../server/sms", () => ({
  isSmsConfigured: vi.fn(() => false),
  sendSms: vi.fn(async () => ({ success: false })),
}));
vi.mock("../server/db-account", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../server/db-account")>()),
  purgeAbandonedAnonymousAccounts: vi.fn(async () => 0),
}));
vi.mock("../server/dms-preregister", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../server/dms-preregister")>()),
  runPreRegistration: vi.fn(async () => ({ registered: 0 })),
}));
vi.mock("../server/dms-pauses", () => ({
  runDmsPauses: vi.fn(async () => ({ paused: 0, noticesSent: 0, pinged: 0 })),
}));
vi.mock("../server/managed-alarms-housekeeping", () => ({
  runManagementHousekeeping: vi.fn(async () => ({ expired: 0, visibleNotices: 0 })),
}));

import { appRouter } from "../server/routers";
import { runMonitoringJob } from "../server/monitoring-job";
import * as db from "../server/db";
import * as dbMonitoring from "../server/db-monitoring";
import * as push from "../server/push";
import { makeCtx, resetStore, sampleAlarm, seedActiveAgreement } from "./_managed-alarms-fakes";

const as = (openId: string) => appRouter.createCaller(makeCtx(openId));

// 07:00 em São Paulo; A toca às 08:00 (11:00Z), B às 20:00.
const T0 = new Date("2026-10-14T10:00:00.000Z");
const A_AT = new Date("2026-10-14T11:00:00.000Z");

const alarmA = sampleAlarm({ id: "A", time: "08:00", description: "Remédio A" });
const alarmB = sampleAlarm({ id: "B", time: "20:00", description: "Remédio B" });

function seedEvent(alarmId: string, scheduledAt: Date): FakeEvent {
  const e: FakeEvent = {
    id: events.length + 1,
    openId: "maria",
    alarmId,
    alarmDescription: alarmId === "A" ? "Remédio A" : "Remédio B",
    scheduledAt,
    status: "pending",
    kind: "medication",
    graceMinutes: null,
    timezone: "America/Sao_Paulo",
    warningSent: false,
  };
  events.push(e);
  return e;
}

const missedAlarmPushes = () =>
  vi
    .mocked(push.sendExpoPush)
    .mock.calls.filter(([, payload]) => (payload as { data?: { type?: string } }).data?.type === "missed_alarm");

beforeEach(() => {
  vi.clearAllMocks();
  resetStore();
  events.length = 0;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
  // Backup ATRASADO: ainda tem o alarme A.
  vi.mocked(db.getUserData).mockImplementation(
    async () => ({ anamnesis: { fullName: "Vó Maria" }, alarms: [alarmA, alarmB] }) as never
  );
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("conta gerenciada com backup atrasado", () => {
  it("cuidadora apaga A, celular confirma, backup ainda tem A: o disparo de A não vira 'não respondeu'", async () => {
    seedActiveAgreement({ caregiverOpenId: "ana", alarms: [alarmA, alarmB] });
    const eventA = seedEvent("A", A_AT);

    await as("ana").managedAlarms.deleteAlarm({ baseVersion: 1, alarmId: "A" }); // v2: só B
    await expect(as("maria").managedAlarms.ack({ version: 2, failedAlarmIds: [] })).resolves.toEqual({
      recorded: true,
    });

    vi.setSystemTime(new Date(A_AT.getTime() + 30 * 60_000));
    await runMonitoringJob();

    expect(events.find((e) => e.id === eventA.id)).toBeUndefined();
    expect(dbMonitoring.updateAlarmEventStatus).not.toHaveBeenCalledWith(eventA.id, expect.anything());
    expect(missedAlarmPushes()).toHaveLength(0);
  });

  it("o ack apaga JÁ os disparos futuros que deixaram de ser cobrados (os de B ficam)", async () => {
    seedActiveAgreement({ caregiverOpenId: "ana", alarms: [alarmA, alarmB] });
    seedEvent("A", A_AT);
    const eventB = seedEvent("B", new Date("2026-10-14T23:00:00.000Z"));

    await as("ana").managedAlarms.deleteAlarm({ baseVersion: 1, alarmId: "A" });
    await as("maria").managedAlarms.ack({ version: 2, failedAlarmIds: [] });

    expect(dbMonitoring.deleteFuturePendingEventsExcept).toHaveBeenCalledWith("maria", ["B"], expect.any(Date));
    expect(events.map((e) => e.id)).toEqual([eventB.id]);
  });

  it("alarme que o celular não conseguiu agendar também sai dos disparos futuros", async () => {
    seedActiveAgreement({ caregiverOpenId: "ana", alarms: [alarmA, alarmB] });
    seedEvent("A", A_AT);

    const { id: _id, ...inputB } = alarmB;
    await as("ana").managedAlarms.updateAlarm({ baseVersion: 1, alarmId: "B", alarm: { ...inputB, time: "21:00" } });
    await as("maria").managedAlarms.ack({ version: 2, failedAlarmIds: ["A"] });

    expect(dbMonitoring.deleteFuturePendingEventsExcept).toHaveBeenCalledWith("maria", ["B"], expect.any(Date));
    expect(events).toHaveLength(0);
  });

  it("limpeza no ack falhou: o ack segue gravado e o Passo 1 decide pela lista confirmada, não pelo backup", async () => {
    seedActiveAgreement({ caregiverOpenId: "ana", alarms: [alarmA, alarmB] });
    const eventA = seedEvent("A", A_AT);
    vi.mocked(dbMonitoring.deleteFuturePendingEventsExcept).mockRejectedValueOnce(new Error("DB fora do ar"));

    await as("ana").managedAlarms.deleteAlarm({ baseVersion: 1, alarmId: "A" });
    await expect(as("maria").managedAlarms.ack({ version: 2, failedAlarmIds: [] })).resolves.toEqual({
      recorded: true,
    });
    expect(events.find((e) => e.id === eventA.id)?.status).toBe("pending");

    vi.setSystemTime(new Date(A_AT.getTime() + 30 * 60_000));
    await runMonitoringJob();

    expect(dbMonitoring.deleteAlarmEvent).toHaveBeenCalledWith(eventA.id);
    expect(dbMonitoring.updateAlarmEventStatus).not.toHaveBeenCalledWith(eventA.id, expect.anything());
    expect(missedAlarmPushes()).toHaveLength(0);
  });

  it("controle: alarme que continua na lista confirmada vence normalmente e avisa a cuidadora", async () => {
    seedActiveAgreement({ caregiverOpenId: "ana", alarms: [alarmA, alarmB] });
    const eventA = seedEvent("A", A_AT);

    vi.setSystemTime(new Date(A_AT.getTime() + 30 * 60_000));
    await runMonitoringJob();

    expect(dbMonitoring.updateAlarmEventStatus).toHaveBeenCalledWith(eventA.id, "missed");
    expect(missedAlarmPushes()).toHaveLength(1);
  });
});
