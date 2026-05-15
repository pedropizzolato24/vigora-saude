/**
 * whatsapp.auth.test.ts
 *
 * Validates that whatsapp.sendEmergencyAlert is no longer abusable:
 *   - requires auth
 *   - enforces device ownership
 *   - only sends to contacts that are pre-registered for the device
 *   - rate-limits to prevent spam
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../server/_core/context";
import type { User, EmergencyContactRecord } from "../drizzle/schema";

// In-memory mocks of the DB + WhatsApp send. Mock BEFORE importing the
// router so the module graph picks them up.
const deviceOwners = new Map<string, string | null>();
const deviceContacts = new Map<string, EmergencyContactRecord[]>();
const sendCalls: Array<{ contacts: { phone: string; name: string }[]; message: string }> = [];

vi.mock("../server/db-monitoring", () => ({
  assertDeviceOwnership: vi.fn(async (deviceId: string, openId: string) => {
    if (!deviceOwners.has(deviceId)) throw new Error("DEVICE_NOT_REGISTERED");
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
    if (owner !== openId) return null;
    return {
      deviceId,
      openId,
      emergencyContacts: deviceContacts.get(deviceId) ?? [],
    };
  }),
  getAppUser: vi.fn(async () => null),
  recordHeartbeat: vi.fn(),
  replaceAllSyncedAlarms: vi.fn(),
  createAlarmEvent: vi.fn(async () => 1),
  updateAlarmEventStatusByAlarmId: vi.fn(),
  getAlarmEventHistory: vi.fn(async () => []),
  getWarningHistory: vi.fn(async () => []),
  getLastHeartbeat: vi.fn(async () => null),
  getSyncedAlarms: vi.fn(async () => []),
}));

vi.mock("../server/whatsapp", () => ({
  isWhatsAppApiConfigured: vi.fn(() => true),
  sendEmergencyAlerts: vi.fn(async (contacts: { phone: string; name: string }[], message: string) => {
    sendCalls.push({ contacts, message });
    return {
      sent: contacts.length,
      failed: 0,
      results: contacts.map((c) => ({
        name: c.name,
        phone: c.phone,
        result: { success: true, messageId: "stub" },
      })),
    };
  }),
}));

import { appRouter } from "../server/routers";

function makeUser(openId: string): User {
  return {
    id: 1,
    openId,
    name: "Test User",
    email: "test@example.com",
    phone: null,
    userType: null,
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
    res: { clearCookie: () => undefined, cookie: () => undefined } as unknown as TrpcContext["res"],
  };
}

function registerDevice(openId: string, deviceId: string, contacts: EmergencyContactRecord[]) {
  deviceOwners.set(deviceId, openId);
  deviceContacts.set(deviceId, contacts);
}

beforeEach(() => {
  deviceOwners.clear();
  deviceContacts.clear();
  sendCalls.length = 0;
});

describe("whatsapp.sendEmergencyAlert — auth & ownership", () => {
  it("rejects unauthenticated calls", async () => {
    const caller = appRouter.createCaller(makeCtx(null));
    await expect(
      caller.whatsapp.sendEmergencyAlert({
        deviceId: "device-A",
        contacts: [{ phone: "11999999999", name: "Mom" }],
        missedAlarmCount: 1,
      })
    ).rejects.toThrow();
    expect(sendCalls.length).toBe(0);
  });

  it("rejects when device is owned by another user", async () => {
    registerDevice("alice", "device-A", [
      { id: "1", name: "Mom", phone: "11999999999", relation: "Mãe", whatsapp: true },
    ]);
    const mallory = appRouter.createCaller(makeCtx(makeUser("mallory")));
    await expect(
      mallory.whatsapp.sendEmergencyAlert({
        deviceId: "device-A",
        contacts: [{ phone: "11999999999", name: "Mom" }],
        missedAlarmCount: 1,
      })
    ).rejects.toThrow(/outro usuário|FORBIDDEN/i);
    expect(sendCalls.length).toBe(0);
  });
});

describe("whatsapp.sendEmergencyAlert — recipient whitelist", () => {
  it("rejects phone numbers not registered as emergency contacts", async () => {
    registerDevice("alice", "device-A", [
      { id: "1", name: "Mom", phone: "(11) 99999-9999", relation: "Mãe", whatsapp: true },
    ]);
    const alice = appRouter.createCaller(makeCtx(makeUser("alice")));
    await expect(
      alice.whatsapp.sendEmergencyAlert({
        deviceId: "device-A",
        contacts: [{ phone: "11888888888", name: "Random Person" }],
        missedAlarmCount: 1,
      })
    ).rejects.toThrow(/lista de contatos|FORBIDDEN/i);
    expect(sendCalls.length).toBe(0);
  });

  it("accepts contacts whose digits match a stored one (ignoring formatting)", async () => {
    registerDevice("alice", "device-A", [
      { id: "1", name: "Mom", phone: "(11) 99999-9999", relation: "Mãe", whatsapp: true },
    ]);
    const alice = appRouter.createCaller(makeCtx(makeUser("alice")));
    const result = await alice.whatsapp.sendEmergencyAlert({
      deviceId: "device-A",
      // Different formatting but same digits
      contacts: [{ phone: "5511999999999", name: "Mom" }],
      missedAlarmCount: 1,
    });
    expect(result.success).toBe(true);
    expect(sendCalls.length).toBe(1);
  });

  it("rejects when device has no emergency contacts registered", async () => {
    registerDevice("alice", "device-A", []);
    const alice = appRouter.createCaller(makeCtx(makeUser("alice")));
    await expect(
      alice.whatsapp.sendEmergencyAlert({
        deviceId: "device-A",
        contacts: [{ phone: "11999999999", name: "Mom" }],
        missedAlarmCount: 1,
      })
    ).rejects.toThrow(/contato.*emergência|PRECONDITION/i);
    expect(sendCalls.length).toBe(0);
  });

  it("rejects if even one of many recipients is not whitelisted", async () => {
    registerDevice("alice", "device-A", [
      { id: "1", name: "Mom", phone: "11999999999", relation: "Mãe", whatsapp: true },
    ]);
    const alice = appRouter.createCaller(makeCtx(makeUser("alice")));
    await expect(
      alice.whatsapp.sendEmergencyAlert({
        deviceId: "device-A",
        contacts: [
          { phone: "11999999999", name: "Mom" },
          { phone: "11888888888", name: "Attacker target" },
        ],
        missedAlarmCount: 1,
      })
    ).rejects.toThrow(/lista de contatos|FORBIDDEN/i);
    expect(sendCalls.length).toBe(0);
  });
});

describe("whatsapp.sendEmergencyAlert — rate limit", () => {
  it("rate-limits more than 5 calls in the same minute", async () => {
    // Use a fresh openId because the rate-limit map persists across tests
    // within the same vitest worker (it lives at module scope).
    const openId = `rate-test-${Date.now()}-${Math.random()}`;
    registerDevice(openId, "device-RL", [
      { id: "1", name: "Mom", phone: "11999999999", relation: "Mãe", whatsapp: true },
    ]);
    const caller = appRouter.createCaller(makeCtx(makeUser(openId)));
    for (let i = 0; i < 5; i++) {
      await caller.whatsapp.sendEmergencyAlert({
        deviceId: "device-RL",
        contacts: [{ phone: "11999999999", name: "Mom" }],
        missedAlarmCount: 1,
      });
    }
    await expect(
      caller.whatsapp.sendEmergencyAlert({
        deviceId: "device-RL",
        contacts: [{ phone: "11999999999", name: "Mom" }],
        missedAlarmCount: 1,
      })
    ).rejects.toThrow(/Muitas tentativas|TOO_MANY/i);
  });
});
