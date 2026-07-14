/**
 * whatsapp.auth.test.ts
 *
 * Validates that whatsapp.sendEmergencyAlert is no longer abusable:
 *   - requires auth
 *   - contatos vêm do user_data da PRÓPRIA conta autenticada (posse
 *     implícita por openId — uma conta nunca alcança contatos de outra)
 *   - only sends to contacts that are pre-registered for the account
 *   - rate-limits to prevent spam
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../server/_core/context";
import type { User, EmergencyContactRecord } from "../drizzle/schema";

// In-memory mocks of the DB + WhatsApp send. Mock BEFORE importing the
// router so the module graph picks them up.
const accountContacts = new Map<string, EmergencyContactRecord[]>();
const sendCalls: Array<{ contacts: { phone: string; name: string }[]; message: string }> = [];

// routers-monitoring/links importam estes helpers no mesmo grafo do appRouter.
vi.mock("../server/db-monitoring", () => ({
  recordHeartbeat: vi.fn(async () => undefined),
  getAccountLiveness: vi.fn(async () => null),
  createAlarmEvent: vi.fn(async () => 1),
  updateAlarmEventStatusByAlarmId: vi.fn(async () => undefined),
  getAlarmEventHistory: vi.fn(async () => []),
  getWarningHistory: vi.fn(async () => []),
}));

// Contatos por conta: sendEmergencyAlert lê user_data.emergencyContacts.
vi.mock("../server/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../server/db")>();
  return {
    ...actual,
    getUserData: vi.fn(async (openId: string) => {
      if (!accountContacts.has(openId)) return undefined;
      return { emergencyContacts: accountContacts.get(openId) } as never;
    }),
  };
});

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
    res: { clearCookie: () => undefined, cookie: () => undefined } as unknown as TrpcContext["res"],
  };
}

function registerContacts(openId: string, contacts: EmergencyContactRecord[]) {
  accountContacts.set(openId, contacts);
}

beforeEach(() => {
  accountContacts.clear();
  sendCalls.length = 0;
});

describe("whatsapp.sendEmergencyAlert — auth & posse por conta", () => {
  it("rejects unauthenticated calls", async () => {
    const caller = appRouter.createCaller(makeCtx(null));
    await expect(
      caller.whatsapp.sendEmergencyAlert({
        contacts: [{ phone: "11999999999", name: "Mom" }],
        missedAlarmCount: 1,
      })
    ).rejects.toThrow();
    expect(sendCalls.length).toBe(0);
  });

  it("uma conta nunca alcança os contatos de outra (isolamento por openId)", async () => {
    // alice tem contatos; mallory (outra conta, mesmo aparelho ou não) tenta
    // disparar para o contato de alice — a leitura é do user_data de MALLORY,
    // que está vazio, então nada é enviado.
    registerContacts("alice", [
      { id: "1", name: "Mom", phone: "11999999999", relation: "Mãe", whatsapp: true },
    ]);
    const mallory = appRouter.createCaller(makeCtx(makeUser("mallory")));
    await expect(
      mallory.whatsapp.sendEmergencyAlert({
        contacts: [{ phone: "11999999999", name: "Mom" }],
        missedAlarmCount: 1,
      })
    ).rejects.toThrow(/contato.*emergência|PRECONDITION/i);
    expect(sendCalls.length).toBe(0);
  });

  it("compat: payload antigo com deviceId extra é aceito e ignorado", async () => {
    registerContacts("alice", [
      { id: "1", name: "Mom", phone: "11999999999", relation: "Mãe", whatsapp: true },
    ]);
    const alice = appRouter.createCaller(makeCtx(makeUser("alice")));
    const result = await alice.whatsapp.sendEmergencyAlert({
      deviceId: "device-A",
      contacts: [{ phone: "11999999999", name: "Mom" }],
      missedAlarmCount: 1,
    });
    expect(result.success).toBe(true);
    expect(sendCalls.length).toBe(1);
  });
});

describe("whatsapp.sendEmergencyAlert — recipient whitelist", () => {
  it("rejects phone numbers not registered as emergency contacts", async () => {
    registerContacts("alice", [
      { id: "1", name: "Mom", phone: "(11) 99999-9999", relation: "Mãe", whatsapp: true },
    ]);
    const alice = appRouter.createCaller(makeCtx(makeUser("alice")));
    await expect(
      alice.whatsapp.sendEmergencyAlert({
        contacts: [{ phone: "11888888888", name: "Random Person" }],
        missedAlarmCount: 1,
      })
    ).rejects.toThrow(/lista de contatos|FORBIDDEN/i);
    expect(sendCalls.length).toBe(0);
  });

  it("accepts contacts whose digits match a stored one (ignoring formatting)", async () => {
    registerContacts("alice", [
      { id: "1", name: "Mom", phone: "(11) 99999-9999", relation: "Mãe", whatsapp: true },
    ]);
    const alice = appRouter.createCaller(makeCtx(makeUser("alice")));
    const result = await alice.whatsapp.sendEmergencyAlert({
      // Different formatting but same digits
      contacts: [{ phone: "5511999999999", name: "Mom" }],
      missedAlarmCount: 1,
    });
    expect(result.success).toBe(true);
    expect(sendCalls.length).toBe(1);
  });

  it("rejects when the account has no emergency contacts registered", async () => {
    registerContacts("alice", []);
    const alice = appRouter.createCaller(makeCtx(makeUser("alice")));
    await expect(
      alice.whatsapp.sendEmergencyAlert({
        contacts: [{ phone: "11999999999", name: "Mom" }],
        missedAlarmCount: 1,
      })
    ).rejects.toThrow(/contato.*emergência|PRECONDITION/i);
    expect(sendCalls.length).toBe(0);
  });

  it("rejects if even one of many recipients is not whitelisted", async () => {
    registerContacts("alice", [
      { id: "1", name: "Mom", phone: "11999999999", relation: "Mãe", whatsapp: true },
    ]);
    const alice = appRouter.createCaller(makeCtx(makeUser("alice")));
    await expect(
      alice.whatsapp.sendEmergencyAlert({
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
    registerContacts(openId, [
      { id: "1", name: "Mom", phone: "11999999999", relation: "Mãe", whatsapp: true },
    ]);
    const caller = appRouter.createCaller(makeCtx(makeUser(openId)));
    for (let i = 0; i < 5; i++) {
      await caller.whatsapp.sendEmergencyAlert({
        contacts: [{ phone: "11999999999", name: "Mom" }],
        missedAlarmCount: 1,
      });
    }
    await expect(
      caller.whatsapp.sendEmergencyAlert({
        contacts: [{ phone: "11999999999", name: "Mom" }],
        missedAlarmCount: 1,
      })
    ).rejects.toThrow(/Muitas tentativas|TOO_MANY/i);
  });
});
