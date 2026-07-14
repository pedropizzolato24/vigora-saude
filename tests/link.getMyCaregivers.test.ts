/**
 * link.getMyCaregivers.test.ts
 *
 * Regression tests for the link.getMyCaregivers tRPC query.
 * Verifies: auth gate, result shape mapping, scope isolation (caller's openId
 * is used — never an input the caller controls), and null-safety for missing
 * caregiver user records.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../server/_core/context";
import type { User } from "../drizzle/schema";

// ---------------------------------------------------------------------------
// In-memory store: monitoredOpenId → link rows
// ---------------------------------------------------------------------------
const linksByMonitored = new Map<
  string,
  Array<{
    caregiverOpenId: string;
    monitoredOpenId: string;
    relationship: string | null;
    status: "active";
    createdAt: Date;
    method: string;
    displayName: string | null;
    revokedAt: null;
  }>
>();

// In-memory store: caregiverOpenId → partial user (only `name` is read)
const namesByOpenId = new Map<string, { name: string | null }>();

// ---------------------------------------------------------------------------
// Mock db-links BEFORE importing the router
// All named exports from routers-links.ts must resolve; only
// getActiveCaregiversForMonitored needs real behaviour.
// ---------------------------------------------------------------------------
vi.mock("../server/db-links", () => ({
  getActiveCaregiversForMonitored: vi.fn(async (monitoredOpenId: string) => {
    return linksByMonitored.get(monitoredOpenId) ?? [];
  }),
  // no-op stubs for the other imports used by the link router
  createInvite: vi.fn(),
  consumeInviteByCode: vi.fn(),
  getActiveLinkForCaregiver: vi.fn(),
  getInviteByCode: vi.fn(),
  getRecentMissedEventsForAccount: vi.fn(async () => []),
  getRecentWarningsForAccount: vi.fn(async () => []),
  revokeLink: vi.fn(),
  upsertActiveLink: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Partial mock of db — preserve the real module, override getUserByOpenId only
// ---------------------------------------------------------------------------
vi.mock("../server/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../server/db")>();
  return {
    ...actual,
    getUserByOpenId: vi.fn(async (openId: string) => {
      return namesByOpenId.get(openId) ?? undefined;
    }),
  };
});

// Import AFTER mocks are hoisted
import { appRouter } from "../server/routers";

// ---------------------------------------------------------------------------
// Helpers (verbatim from monitoring.auth.test.ts)
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Test data helpers
// ---------------------------------------------------------------------------
function makeLinkRow(
  caregiverOpenId: string,
  monitoredOpenId: string,
  relationship: string | null,
  createdAt: Date
) {
  return {
    caregiverOpenId,
    monitoredOpenId,
    relationship,
    status: "active" as const,
    createdAt,
    method: "code",
    displayName: null,
    revokedAt: null,
  };
}

// ---------------------------------------------------------------------------
// Reset stores before each test
// ---------------------------------------------------------------------------
beforeEach(() => {
  linksByMonitored.clear();
  namesByOpenId.clear();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("link.getMyCaregivers", () => {
  it("rejects unauthenticated callers", async () => {
    const caller = appRouter.createCaller(makeCtx(null));
    await expect(caller.link.getMyCaregivers()).rejects.toThrowError(
      /login|UNAUTHED|UNAUTHORIZED/i
    );
  });

  it("returns mapped caregivers for the authenticated monitored user", async () => {
    const joaoCreatedAt = new Date("2025-01-10T08:00:00Z");
    const anaCreatedAt = new Date("2025-02-15T12:30:00Z");

    // Seed two active links for "maria"
    linksByMonitored.set("maria", [
      makeLinkRow("joao", "maria", "filho", joaoCreatedAt),
      makeLinkRow("ana", "maria", "filha", anaCreatedAt),
    ]);

    // Seed caregiver name records
    namesByOpenId.set("joao", { name: "João Silva" });
    namesByOpenId.set("ana", { name: "Ana Souza" });

    const caller = appRouter.createCaller(makeCtx(makeUser("maria")));
    const result = await caller.link.getMyCaregivers();

    expect(result).toHaveLength(2);

    const joao = result.find((r) => r.caregiverOpenId === "joao");
    expect(joao).toEqual({
      caregiverOpenId: "joao",
      caregiverName: "João Silva",
      relationship: "filho",
      linkedAt: joaoCreatedAt.getTime(),
    });

    const ana = result.find((r) => r.caregiverOpenId === "ana");
    expect(ana).toEqual({
      caregiverOpenId: "ana",
      caregiverName: "Ana Souza",
      relationship: "filha",
      linkedAt: anaCreatedAt.getTime(),
    });
  });

  it("uses ctx.user.openId as the scope key — different callers get their own data", async () => {
    const { getActiveCaregiversForMonitored } = await import(
      "../server/db-links"
    );

    // Seed links only for "maria"
    linksByMonitored.set("maria", [
      makeLinkRow("joao", "maria", "filho", new Date()),
    ]);
    namesByOpenId.set("joao", { name: "João" });

    // "maria" should get her 1 caregiver
    const mariaCaller = appRouter.createCaller(makeCtx(makeUser("maria")));
    const mariaResult = await mariaCaller.link.getMyCaregivers();
    expect(mariaResult).toHaveLength(1);
    expect(mariaResult[0].caregiverOpenId).toBe("joao");

    // Verify the mock was called with "maria"'s openId
    expect(getActiveCaregiversForMonitored).toHaveBeenCalledWith("maria");

    // "bob" has no seeded links — must get []
    const bobCaller = appRouter.createCaller(makeCtx(makeUser("bob")));
    const bobResult = await bobCaller.link.getMyCaregivers();
    expect(bobResult).toHaveLength(0);

    // Verify the mock was called with "bob"'s openId
    expect(getActiveCaregiversForMonitored).toHaveBeenCalledWith("bob");
  });

  it("caregiverName is null when no user record exists for the caregiver", async () => {
    // Seed a link but NO name record for the caregiver
    linksByMonitored.set("rita", [
      makeLinkRow("unknown-caregiver", "rita", "neto", new Date("2025-03-01")),
    ]);
    // namesByOpenId intentionally empty for "unknown-caregiver"

    const caller = appRouter.createCaller(makeCtx(makeUser("rita")));
    const result = await caller.link.getMyCaregivers();

    expect(result).toHaveLength(1);
    expect(result[0].caregiverName).toBeNull();
    expect(result[0].caregiverOpenId).toBe("unknown-caregiver");
  });
});
