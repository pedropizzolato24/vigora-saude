/**
 * session-revocation.test.ts
 *
 * Validates:
 *   - New tokens default to the shorter 7-day TTL (not 1 year)
 *   - signed tokens carry a `jti`
 *   - revokeJti makes a previously-valid token reject on verify
 *   - logout (auth.logout tRPC) revokes the caller's token
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../server/db", () => ({
  getUserByOpenId: vi.fn(async () => undefined),
  upsertUser: vi.fn(async () => undefined),
}));

beforeAll(() => {
  process.env.JWT_SECRET = "test-secret-for-session-revocation-tests";
  process.env.VITE_APP_ID = "test-app-id";
});

beforeEach(() => {
  process.env.JWT_SECRET = "test-secret-for-session-revocation-tests";
  process.env.VITE_APP_ID = "test-app-id";
  // ensure SESSION_TTL_MS isn't leaked from other tests
  delete process.env.SESSION_TTL_MS;
});

import { sdk, revokeJti, __resetDenylistForTests } from "../server/_core/sdk";
import { DEFAULT_SESSION_TTL_MS } from "../shared/const";
import { appRouter } from "../server/routers";
import type { TrpcContext } from "../server/_core/context";

afterEach(() => {
  __resetDenylistForTests();
});

function makeReq(headers: Record<string, string> = {}) {
  return {
    headers,
    protocol: "https",
    hostname: "localhost",
  } as unknown as TrpcContext["req"];
}

function makeRes() {
  const cleared: Array<{ name: string; options: unknown }> = [];
  const res = {
    cookie: () => res,
    clearCookie: (name: string, options: unknown) => {
      cleared.push({ name, options });
      return res;
    },
  } as unknown as TrpcContext["res"];
  return { res, cleared };
}

describe("Fix #9 — session TTL", () => {
  it("default TTL is 7 days, not 1 year", () => {
    const SEVEN_DAYS = 1000 * 60 * 60 * 24 * 7;
    const ONE_YEAR = 1000 * 60 * 60 * 24 * 365;
    expect(DEFAULT_SESSION_TTL_MS).toBe(SEVEN_DAYS);
    expect(DEFAULT_SESSION_TTL_MS).not.toBe(ONE_YEAR);
  });

  it("signSession honors SESSION_TTL_MS env override", async () => {
    process.env.SESSION_TTL_MS = String(60_000); // 60s for the test
    const token = await sdk.createSessionToken("alice", { name: "Alice" });
    const decoded = await sdk.verifySession(token);
    expect(decoded).not.toBeNull();
    expect(decoded!.expMs).toBeDefined();
    const expIn = decoded!.expMs! - Date.now();
    // Allow a few seconds of skew
    expect(expIn).toBeGreaterThan(50_000);
    expect(expIn).toBeLessThan(75_000);
  });
});

describe("Fix #9 — jti and revocation", () => {
  it("signed tokens carry a non-empty jti", async () => {
    const token = await sdk.createSessionToken("alice", { name: "Alice" });
    const decoded = await sdk.verifySession(token);
    expect(decoded).not.toBeNull();
    expect(decoded!.jti).toMatch(/^[0-9a-f]{32}$/);
  });

  it("each issued token has a unique jti", async () => {
    const t1 = await sdk.createSessionToken("alice", { name: "Alice" });
    const t2 = await sdk.createSessionToken("alice", { name: "Alice" });
    const d1 = await sdk.verifySession(t1);
    const d2 = await sdk.verifySession(t2);
    expect(d1!.jti).not.toBe(d2!.jti);
  });

  it("verifySession returns null for a revoked jti", async () => {
    const token = await sdk.createSessionToken("alice", { name: "Alice" });
    const decoded = await sdk.verifySession(token);
    expect(decoded).not.toBeNull();
    revokeJti(decoded!.jti!, decoded!.expMs!);

    const second = await sdk.verifySession(token);
    expect(second).toBeNull();
  });

  it("other (non-revoked) tokens still verify", async () => {
    const aliceToken = await sdk.createSessionToken("alice", { name: "Alice" });
    const bobToken = await sdk.createSessionToken("bob", { name: "Bob" });
    const aliceDecoded = await sdk.verifySession(aliceToken);
    revokeJti(aliceDecoded!.jti!, aliceDecoded!.expMs!);

    const stillBob = await sdk.verifySession(bobToken);
    expect(stillBob).not.toBeNull();
    expect(stillBob!.openId).toBe("bob");
  });
});

describe("Fix #9 — auth.logout revokes the caller's token", () => {
  it("after logout, the same token no longer verifies", async () => {
    const token = await sdk.createSessionToken("alice", { name: "Alice" });
    // Sanity
    expect(await sdk.verifySession(token)).not.toBeNull();

    const ctx: TrpcContext = {
      user: {
        id: 1,
        openId: "alice",
        name: "Alice",
        email: null,
        phone: null,
        userType: null,
        loginMethod: null,
        role: "user",
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      },
      req: makeReq({ authorization: `Bearer ${token}` }),
      res: makeRes().res,
    };
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result.success).toBe(true);

    // Token should now be rejected
    const after = await sdk.verifySession(token);
    expect(after).toBeNull();
  });

  it("logout via cookie also revokes the token (web flow)", async () => {
    const token = await sdk.createSessionToken("bob", { name: "Bob" });
    expect(await sdk.verifySession(token)).not.toBeNull();

    const ctx: TrpcContext = {
      user: {
        id: 2,
        openId: "bob",
        name: "Bob",
        email: null,
        phone: null,
        userType: null,
        loginMethod: null,
        role: "user",
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      },
      req: makeReq({ cookie: `app_session_id=${token}` }),
      res: makeRes().res,
    };
    const caller = appRouter.createCaller(ctx);
    await caller.auth.logout();

    expect(await sdk.verifySession(token)).toBeNull();
  });
});
