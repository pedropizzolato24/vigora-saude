import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../server/_core/context";
import type { User } from "../drizzle/schema";

let transitionResult: { id: number; timezone?: string | null; kind?: string | null } | null = { id: 1 };

vi.mock("../server/db-monitoring", () => ({
  recordHeartbeat: vi.fn(async () => undefined),
  getAccountLiveness: vi.fn(async () => null),
  createAlarmEvent: vi.fn(async () => 1),
  updateAlarmEventStatusByAlarmId: vi.fn(async () => transitionResult),
  getAlarmEventHistory: vi.fn(async () => []),
  getWarningHistory: vi.fn(async () => []),
}));
vi.mock("../server/db-links", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../server/db-links")>()),
  getActiveCaregiversForMonitored: vi.fn(async () => [{ caregiverOpenId: "cg-1" }]),
}));
vi.mock("../server/db-push", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../server/db-push")>()),
  getPushTokensForOpenIds: vi.fn(async () => [{ token: "ExpoTok[cg-1]" }]),
}));
vi.mock("../server/push", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../server/push")>()),
  sendExpoPush: vi.fn(async () => 1),
}));

import { appRouter } from "../server/routers";
import * as dbMon from "../server/db-monitoring";
import * as push from "../server/push";

function makeCaller() {
  const user = {
    id: 1, openId: "vovo", name: "Vô", email: "v@x.com", phone: null, userType: "monitored",
    birthDate: null, bloodType: null, loginMethod: "google", role: "user",
    createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
  } as User;
  const ctx: TrpcContext = {
    user,
    req: { headers: {}, protocol: "https" } as TrpcContext["req"],
    res: { clearCookie: () => undefined, cookie: () => undefined } as unknown as TrpcContext["res"],
  };
  return appRouter.createCaller(ctx);
}

const scheduledAt = new Date().toISOString();

beforeEach(() => {
  vi.clearAllMocks();
  transitionResult = { id: 1 };
});

describe("monitoring.createEvent — kind e graceMinutes", () => {
  it("repassa kind e graceMinutes ao banco", async () => {
    await makeCaller().monitoring.createEvent({
      alarmId: "a1", alarmDescription: "Check-in", scheduledAt, kind: "checkin", graceMinutes: 15,
    });
    expect(dbMon.createAlarmEvent).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "checkin", graceMinutes: 15 })
    );
  });

  it("clientes antigos (sem os campos) continuam funcionando", async () => {
    await makeCaller().monitoring.createEvent({ alarmId: "a1", alarmDescription: "x", scheduledAt });
    expect(dbMon.createAlarmEvent).toHaveBeenCalledWith(
      expect.objectContaining({ kind: null, graceMinutes: null })
    );
  });

  it("recusa atraso fora de 5, 10, 15 e 30 e tipo desconhecido", async () => {
    const caller = makeCaller();
    await expect(
      caller.monitoring.createEvent({ alarmId: "a", alarmDescription: "x", scheduledAt, graceMinutes: 7 as never })
    ).rejects.toThrow();
    await expect(
      caller.monitoring.createEvent({ alarmId: "a", alarmDescription: "x", scheduledAt, kind: "outro" as never })
    ).rejects.toThrow();
  });
});

describe("confirmEvent — push por tipo do evento", () => {
  it("check-in novo (kind) perdido => 'missed_checkin', mesmo com id de alarme comum", async () => {
    transitionResult = { id: 1, kind: "checkin" };
    await makeCaller().monitoring.confirmEvent({ alarmId: "uuid-qualquer", scheduledAt, status: "missed" });
    const [, message] = vi.mocked(push.sendExpoPush).mock.calls[0];
    expect(message.data).toMatchObject({ type: "missed_checkin" });
    expect(message.title).toMatch(/Check-in/i);
  });

  it("remédio perdido continua 'missed_alarm'", async () => {
    transitionResult = { id: 1, kind: null };
    await makeCaller().monitoring.confirmEvent({ alarmId: "uuid-qualquer", scheduledAt, status: "missed" });
    const [, message] = vi.mocked(push.sendExpoPush).mock.calls[0];
    expect(message.data).toMatchObject({ type: "missed_alarm" });
  });
});
