/**
 * liveness-signals.test.ts
 *
 * Quem dá "sinal do aparelho" (renova lastSeenAt e retoma a conta pausada) e a
 * rota monitoring.deviceSignedOut (logout pausa o dead man's switch na hora).
 *  - dão sinal: push.register, monitoring.createEvent, monitoring.confirmEvent
 *    (userData.put e managedAlarms.ack têm testes próprios);
 *  - heartbeat/register já gravam lastSeenAt em recordHeartbeat (que também retoma);
 *  - cuidador não dá sinal no push.register, e nunca é pausado no logout.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../server/_core/context";
import type { User } from "../drizzle/schema";

vi.mock("../server/db-monitoring", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../server/db-monitoring")>()),
  touchLiveness: vi.fn(async () => undefined),
  pauseDms: vi.fn(async () => true),
  recordHeartbeat: vi.fn(async () => undefined),
  createAlarmEvent: vi.fn(async () => 1),
  updateAlarmEventStatusByAlarmId: vi.fn(async () => null),
}));
vi.mock("../server/db-push", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../server/db-push")>()),
  upsertPushToken: vi.fn(async () => undefined),
}));

import { appRouter } from "../server/routers";
import * as dbMonitoring from "../server/db-monitoring";
import * as dbPush from "../server/db-push";

function makeUser(openId: string, userType: "monitored" | "caregiver" | null): User {
  return {
    id: 1,
    openId,
    name: "Conta",
    email: "x@example.com",
    phone: null,
    userType,
    birthDate: null,
    bloodType: null,
    loginMethod: "google",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
}

function caller(user: User | null) {
  const ctx: TrpcContext = {
    user,
    req: { headers: {}, protocol: "https" } as TrpcContext["req"],
    res: { clearCookie: () => undefined, cookie: () => undefined } as unknown as TrpcContext["res"],
  };
  return appRouter.createCaller(ctx);
}

const evento = { alarmId: "a1", alarmDescription: "Remédio", scheduledAt: new Date().toISOString() };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("sinal do aparelho nas rotas do idoso", () => {
  it("push.register dá sinal depois de gravar o token", async () => {
    await caller(makeUser("maria", "monitored")).push.register({ token: "ExpoTok[m]", platform: "android" });

    expect(dbPush.upsertPushToken).toHaveBeenCalledTimes(1);
    expect(dbMonitoring.touchLiveness).toHaveBeenCalledWith("maria");
    const [gravou] = vi.mocked(dbPush.upsertPushToken).mock.invocationCallOrder;
    const [tocou] = vi.mocked(dbMonitoring.touchLiveness).mock.invocationCallOrder;
    expect(gravou).toBeLessThan(tocou);
  });

  it("push.register de CUIDADOR grava o token mas não dá sinal", async () => {
    await caller(makeUser("ana", "caregiver")).push.register({ token: "ExpoTok[a]", platform: "ios" });

    expect(dbPush.upsertPushToken).toHaveBeenCalledTimes(1);
    expect(dbMonitoring.touchLiveness).not.toHaveBeenCalled();
  });

  it("conta sem userType (cliente antigo) ainda conta como idoso no register", async () => {
    await caller(makeUser("velho", null)).push.register({ token: "ExpoTok[v]", platform: "android" });

    expect(dbMonitoring.touchLiveness).toHaveBeenCalledWith("velho");
  });

  it("createEvent dá sinal", async () => {
    await caller(makeUser("maria", "monitored")).monitoring.createEvent(evento);

    expect(dbMonitoring.touchLiveness).toHaveBeenCalledWith("maria");
  });

  it("createEvent dá sinal mesmo se a gravação do evento falhar (o aparelho está vivo)", async () => {
    vi.mocked(dbMonitoring.createAlarmEvent).mockRejectedValueOnce(new Error("DB fora do ar"));

    await expect(caller(makeUser("maria", "monitored")).monitoring.createEvent(evento)).rejects.toThrow();
    expect(dbMonitoring.touchLiveness).toHaveBeenCalledWith("maria");
  });

  it("confirmEvent dá sinal", async () => {
    await caller(makeUser("maria", "monitored")).monitoring.confirmEvent({
      alarmId: "a1",
      scheduledAt: new Date().toISOString(),
      status: "responded",
    });

    expect(dbMonitoring.touchLiveness).toHaveBeenCalledWith("maria");
  });

  it("heartbeat segue gravando só pelo recordHeartbeat (que também retoma a conta)", async () => {
    await caller(makeUser("maria", "monitored")).monitoring.heartbeat({ lastDeviceId: "dev-1" });

    expect(dbMonitoring.recordHeartbeat).toHaveBeenCalledTimes(1);
    expect(dbMonitoring.touchLiveness).not.toHaveBeenCalled();
  });
});

describe("monitoring.deviceSignedOut", () => {
  it("o idoso saindo da conta pausa o dead man's switch na hora ('logged_out')", async () => {
    const result = await caller(makeUser("maria", "monitored")).monitoring.deviceSignedOut();

    expect(dbMonitoring.pauseDms).toHaveBeenCalledWith("maria", "logged_out");
    expect(result).toEqual({ success: true, paused: true });
  });

  it("conta que já estava pausada devolve paused:false, sem erro", async () => {
    vi.mocked(dbMonitoring.pauseDms).mockResolvedValueOnce(false);

    await expect(caller(makeUser("maria", "monitored")).monitoring.deviceSignedOut()).resolves.toEqual({
      success: true,
      paused: false,
    });
  });

  it("cuidador saindo da conta não pausa nada", async () => {
    const result = await caller(makeUser("ana", "caregiver")).monitoring.deviceSignedOut();

    expect(dbMonitoring.pauseDms).not.toHaveBeenCalled();
    expect(result).toEqual({ success: true, paused: false });
  });

  it("falha ao pausar nunca derruba o logout e o log não traz a mensagem do erro", async () => {
    vi.mocked(dbMonitoring.pauseDms).mockRejectedValueOnce(
      Object.assign(new Error("parametros secretos: maria"), { code: "ECONNRESET" })
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(caller(makeUser("maria", "monitored")).monitoring.deviceSignedOut()).resolves.toEqual({
      success: true,
      paused: false,
    });
    expect(JSON.stringify(warn.mock.calls)).toContain("ECONNRESET");
    expect(JSON.stringify(warn.mock.calls)).not.toContain("parametros secretos");
  });

  it("sem sessão é UNAUTHORIZED e nada é pausado", async () => {
    await expect(caller(null).monitoring.deviceSignedOut()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(dbMonitoring.pauseDms).not.toHaveBeenCalled();
  });
});
