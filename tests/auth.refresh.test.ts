/**
 * auth.refresh.test.ts
 *
 * Sliding session: auth.refresh issues a fresh, valid token for an
 * authenticated user and resets the web cookie, and refuses unauthenticated
 * callers. Without this, a session dying after the TTL silently disarms the
 * dead man's switch (heartbeat/sync/events all 401).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../server/_core/context";
import type { User } from "../drizzle/schema";

vi.mock("../server/db", () => ({
  getUserByOpenId: vi.fn(async () => null),
  getUserData: vi.fn(async () => null),
  upsertUser: vi.fn(async () => undefined),
  upsertUserData: vi.fn(async () => undefined),
}));

import { appRouter } from "../server/routers";
import { sdk } from "../server/_core/sdk";

function makeUser(openId: string): User {
  return {
    id: 1,
    openId,
    name: "Vovô Teste",
    email: "vo@example.com",
    phone: null,
    userType: "monitored",
    birthDate: null,
    bloodType: null,
    loginMethod: "google",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
}

function makeCtx(user: User | null) {
  const cookies: { name: string; value: string; options: unknown }[] = [];
  const ctx = {
    user,
    req: { headers: {}, protocol: "https" },
    res: {
      cookie: (name: string, value: string, options: unknown) =>
        cookies.push({ name, value, options }),
      clearCookie: () => undefined,
    },
  } as unknown as TrpcContext;
  return { ctx, cookies };
}

beforeEach(() => {
  process.env.JWT_SECRET = "test-secret-for-refresh";
});

describe("auth.refresh — sliding session", () => {
  it("rejects an unauthenticated caller", async () => {
    const { ctx } = makeCtx(null);
    const caller = appRouter.createCaller(ctx);
    await expect(caller.auth.refresh()).rejects.toThrowError(
      /login|UNAUTHED|UNAUTHORIZED/i
    );
  });

  it("issues a fresh, valid token for the authenticated user", async () => {
    const { ctx } = makeCtx(makeUser("vovo-open-id"));
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.refresh();

    expect(result.success).toBe(true);
    expect(typeof result.token).toBe("string");
    expect(result.token.length).toBeGreaterThan(0);

    // The new token must verify and carry the same identity.
    const decoded = await sdk.verifySession(result.token);
    expect(decoded).not.toBeNull();
    expect(decoded!.openId).toBe("vovo-open-id");
  });

  it("resets the web session cookie", async () => {
    const { ctx, cookies } = makeCtx(makeUser("vovo-open-id"));
    const caller = appRouter.createCaller(ctx);

    await caller.auth.refresh();

    expect(cookies).toHaveLength(1);
    expect(cookies[0].name).toBe("app_session_id");
    expect(typeof cookies[0].value).toBe("string");
  });
});
