/**
 * monitoring.auth.test.ts
 *
 * Valida autenticação e ISOLAMENTO POR CONTA do roteador de monitoramento.
 * A posse dos dados é implícita pelo openId autenticado (não existe mais
 * posse por deviceId): duas contas no MESMO aparelho — o cenário do bug
 * original, o loop ao trocar de conta — não colidem nem se enxergam.
 * These tests use vi.mock to stub the db helpers so we exercise the router
 * logic in isolation.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../server/_core/context";
import type { User } from "../drizzle/schema";

// --- Mock the DB layer BEFORE importing the router ---------------------------
// Eventos em memória, chaveados por openId (a conta).
const eventsByAccount = new Map<
  string,
  Array<{ id: number; alarmId: string; scheduledAt: Date; status: string }>
>();
let nextEventId = 1;

vi.mock("../server/db-monitoring", () => ({
  recordHeartbeat: vi.fn(async () => undefined),
  getAccountLiveness: vi.fn(async () => null),
  createAlarmEvent: vi.fn(
    async (data: { openId: string; alarmId: string; scheduledAt: Date }) => {
      const list = eventsByAccount.get(data.openId) ?? [];
      const id = nextEventId++;
      list.push({
        id,
        alarmId: data.alarmId,
        scheduledAt: data.scheduledAt,
        status: "pending",
      });
      eventsByAccount.set(data.openId, list);
      return id;
    }
  ),
  updateAlarmEventStatusByAlarmId: vi.fn(async () => undefined),
  getAlarmEventHistory: vi.fn(
    async (openId: string) => eventsByAccount.get(openId) ?? []
  ),
  getWarningHistory: vi.fn(async () => []),
}));

// Import the router AFTER mocking
import { appRouter } from "../server/routers";
import * as dbMonitoring from "../server/db-monitoring";

function makeUser(openId: string): User {
  return {
    id: 1,
    openId,
    name: "Test User",
    email: "test@example.com",
    phone: null,
    userType: null,
    birthDate: null,
    bloodType: null,
    loginMethod: "google",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
}

function makeCtx(user: User | null): TrpcContext {
  return {
    user,
    req: { headers: {}, protocol: "https" } as TrpcContext["req"],
    res: {
      clearCookie: () => undefined,
      cookie: () => undefined,
    } as unknown as TrpcContext["res"],
  };
}

beforeEach(() => {
  eventsByAccount.clear();
  vi.clearAllMocks();
});

describe("monitoring router — authentication", () => {
  it("rejects unauthenticated heartbeat with UNAUTHORIZED", async () => {
    const caller = appRouter.createCaller(makeCtx(null));
    await expect(
      caller.monitoring.heartbeat({ lastDeviceId: "device-A" })
    ).rejects.toThrowError(/login|UNAUTHED|UNAUTHORIZED/i);
  });

  it("rejects unauthenticated register", async () => {
    const caller = appRouter.createCaller(makeCtx(null));
    await expect(
      caller.monitoring.register({ deviceId: "device-A" })
    ).rejects.toThrow();
  });

  it("rejects unauthenticated getHistory", async () => {
    const caller = appRouter.createCaller(makeCtx(null));
    await expect(
      caller.monitoring.getHistory({ limit: 10 })
    ).rejects.toThrow();
  });

  it("rejects unauthenticated syncAlarms", async () => {
    const caller = appRouter.createCaller(makeCtx(null));
    await expect(
      caller.monitoring.syncAlarms({ alarms: [] })
    ).rejects.toThrow();
  });

  it("rejects unauthenticated createEvent", async () => {
    const caller = appRouter.createCaller(makeCtx(null));
    await expect(
      caller.monitoring.createEvent({
        alarmId: "a1",
        alarmDescription: "Remédio",
        scheduledAt: new Date().toISOString(),
      })
    ).rejects.toThrow();
  });
});

describe("monitoring router — isolamento por conta (mesmo aparelho)", () => {
  it("duas contas usam o MESMO aparelho sem colisão (bug do loop de login)", async () => {
    const alice = appRouter.createCaller(makeCtx(makeUser("alice")));
    const bob = appRouter.createCaller(makeCtx(makeUser("bob")));

    await alice.monitoring.register({ deviceId: "device-A" });
    // bob loga no mesmo aparelho físico: nada de DEVICE_OWNED_BY_ANOTHER_USER.
    const reg = await bob.monitoring.register({ deviceId: "device-A" });
    expect(reg.success).toBe(true);

    const hb = await bob.monitoring.heartbeat({ lastDeviceId: "device-A" });
    expect(hb.success).toBe(true);

    // Liveness registrada para CADA conta, com o device como mero metadado.
    const calls = vi.mocked(dbMonitoring.recordHeartbeat).mock.calls;
    expect(calls.some(([openId]) => openId === "alice")).toBe(true);
    expect(calls.some(([openId]) => openId === "bob")).toBe(true);
  });

  it("eventos de uma conta não aparecem no histórico da outra", async () => {
    const alice = appRouter.createCaller(makeCtx(makeUser("alice")));
    const bob = appRouter.createCaller(makeCtx(makeUser("bob")));

    await alice.monitoring.createEvent({
      alarmId: "a1",
      alarmDescription: "Remédio da manhã",
      scheduledAt: new Date().toISOString(),
    });

    const aliceHist = await alice.monitoring.getHistory({ limit: 50 });
    const bobHist = await bob.monitoring.getHistory({ limit: 50 });
    expect(aliceHist.events).toHaveLength(1);
    expect(bobHist.events).toHaveLength(0);
  });

  it("createEvent usa o openId autenticado — nunca input do cliente", async () => {
    const alice = appRouter.createCaller(makeCtx(makeUser("alice")));
    await alice.monitoring.createEvent({
      alarmId: "a1",
      alarmDescription: "x",
      scheduledAt: new Date().toISOString(),
    });
    const call = vi.mocked(dbMonitoring.createAlarmEvent).mock.calls[0][0];
    expect(call.openId).toBe("alice");
  });

  it("compat: payload antigo com deviceId extra é aceito e ignorado", async () => {
    const alice = appRouter.createCaller(makeCtx(makeUser("alice")));
    // Cliente antigo manda deviceId no createEvent — zod descarta a chave.
    const result = await alice.monitoring.createEvent({
      deviceId: "device-A",
      alarmId: "a1",
      alarmDescription: "Remédio",
      scheduledAt: new Date().toISOString(),
    } as never);
    expect(result.success).toBe(true);
    const call = vi.mocked(dbMonitoring.createAlarmEvent).mock.calls[0][0];
    expect(call.openId).toBe("alice");
    expect("deviceId" in call).toBe(false);
  });
});
