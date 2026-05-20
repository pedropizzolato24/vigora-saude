/**
 * monitoring.auth.test.ts
 *
 * Validates that the monitoring router enforces authentication and
 * per-user device ownership. These tests use vi.mock to stub the
 * db-monitoring helpers so we exercise the router logic in isolation.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import type { TrpcContext } from "../server/_core/context";
import type { User } from "../drizzle/schema";

// --- Mock the DB layer BEFORE importing the router ---------------------------
// In-memory store keyed by deviceId: { openId | null }
const deviceOwners = new Map<string, string | null>();

vi.mock("../server/db-monitoring", () => {
  return {
    assertDeviceOwnership: vi.fn(async (deviceId: string, openId: string) => {
      if (!deviceOwners.has(deviceId)) {
        throw new Error("DEVICE_NOT_REGISTERED");
      }
      const owner = deviceOwners.get(deviceId);
      if (owner !== null && owner !== openId) {
        throw new Error("DEVICE_OWNED_BY_ANOTHER_USER");
      }
    }),
    upsertAppUser: vi.fn(async (data: { deviceId: string; openId: string }) => {
      deviceOwners.set(data.deviceId, data.openId);
    }),
    getAppUserForOwner: vi.fn(async (deviceId: string, openId: string) => {
      const owner = deviceOwners.get(deviceId);
      if (owner === openId) {
        return { deviceId, openId };
      }
      return null;
    }),
    recordHeartbeat: vi.fn(async () => undefined),
    replaceAllSyncedAlarms: vi.fn(async () => undefined),
    createAlarmEvent: vi.fn(async () => 42),
    updateAlarmEventStatusByAlarmId: vi.fn(async () => undefined),
    getAlarmEventHistory: vi.fn(async () => []),
    getWarningHistory: vi.fn(async () => []),
    getLastHeartbeat: vi.fn(async () => null),
    getSyncedAlarms: vi.fn(async () => []),
  };
});

// Import the router AFTER mocking
import { appRouter } from "../server/routers";

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
  deviceOwners.clear();
});

describe("monitoring router — authentication", () => {
  it("rejects unauthenticated heartbeat with UNAUTHORIZED", async () => {
    const caller = appRouter.createCaller(makeCtx(null));
    await expect(
      caller.monitoring.heartbeat({ deviceId: "device-A" })
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
      caller.monitoring.getHistory({ deviceId: "device-A", limit: 10 })
    ).rejects.toThrow();
  });

  it("rejects unauthenticated syncAlarms", async () => {
    const caller = appRouter.createCaller(makeCtx(null));
    await expect(
      caller.monitoring.syncAlarms({ deviceId: "device-A", alarms: [] })
    ).rejects.toThrow();
  });

  it("rejects unauthenticated getProfile", async () => {
    const caller = appRouter.createCaller(makeCtx(null));
    await expect(
      caller.monitoring.getProfile({ deviceId: "device-A" })
    ).rejects.toThrow();
  });
});

describe("monitoring router — ownership enforcement", () => {
  it("allows the owner to use their own device", async () => {
    const alice = makeCtx(makeUser("alice"));
    const caller = appRouter.createCaller(alice);
    await caller.monitoring.register({ deviceId: "device-A" });
    const result = await caller.monitoring.heartbeat({ deviceId: "device-A" });
    expect(result.success).toBe(true);
  });

  it("blocks a different user from using a registered device", async () => {
    const alice = appRouter.createCaller(makeCtx(makeUser("alice")));
    await alice.monitoring.register({ deviceId: "device-A" });

    const mallory = appRouter.createCaller(makeCtx(makeUser("mallory")));
    await expect(
      mallory.monitoring.heartbeat({ deviceId: "device-A" })
    ).rejects.toThrow(/outro usuário|FORBIDDEN/i);
  });

  it("blocks a different user from reading another's history", async () => {
    const alice = appRouter.createCaller(makeCtx(makeUser("alice")));
    await alice.monitoring.register({ deviceId: "device-A" });

    const mallory = appRouter.createCaller(makeCtx(makeUser("mallory")));
    await expect(
      mallory.monitoring.getHistory({ deviceId: "device-A", limit: 50 })
    ).rejects.toThrow(/outro usuário|FORBIDDEN/i);
  });

  it("blocks a different user from overwriting contacts via register", async () => {
    const alice = appRouter.createCaller(makeCtx(makeUser("alice")));
    await alice.monitoring.register({ deviceId: "device-A" });

    const mallory = appRouter.createCaller(makeCtx(makeUser("mallory")));
    await expect(
      mallory.monitoring.register({
        deviceId: "device-A",
        emergencyContacts: [
          {
            id: "x",
            name: "Attacker",
            phone: "0",
            relation: "x",
            whatsapp: true,
          },
        ],
      })
    ).rejects.toThrow(/outro usuário|FORBIDDEN/i);
  });

  it("blocks calls to unregistered devices (must register first)", async () => {
    const caller = appRouter.createCaller(makeCtx(makeUser("alice")));
    await expect(
      caller.monitoring.heartbeat({ deviceId: "device-Z" })
    ).rejects.toThrow(/não registrado|PRECONDITION/i);
  });

  it("getProfile returns null for a device not owned by the caller", async () => {
    const alice = appRouter.createCaller(makeCtx(makeUser("alice")));
    await alice.monitoring.register({ deviceId: "device-A" });

    const mallory = appRouter.createCaller(makeCtx(makeUser("mallory")));
    const result = await mallory.monitoring.getProfile({ deviceId: "device-A" });
    expect(result.user).toBeNull();
  });
});
