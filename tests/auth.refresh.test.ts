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

function makeCtx(user: User | null, opts: { bearer?: boolean } = {}) {
  const cookies: { name: string; value: string; options: unknown }[] = [];
  const headers: Record<string, string> = {};
  // Nativo autentica via Bearer; web via cookie (sem Authorization).
  if (opts.bearer) headers.authorization = "Bearer some-native-token";
  const ctx = {
    user,
    req: { headers, protocol: "https" },
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

  it("native (Bearer): issues a fresh, valid token in the response body", async () => {
    const { ctx } = makeCtx(makeUser("vovo-open-id"), { bearer: true });
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.refresh();

    expect(result.success).toBe(true);
    expect("token" in result && typeof result.token === "string").toBe(true);
    const token = (result as { token: string }).token;
    expect(token.length).toBeGreaterThan(0);

    // The new token must verify and carry the same identity.
    const decoded = await sdk.verifySession(token);
    expect(decoded).not.toBeNull();
    expect(decoded!.openId).toBe("vovo-open-id");
  });

  it("native (Bearer): a user with NO name still gets a token that verifies", async () => {
    // Regressão: contas sem nome no banco (cadastro por telefone, ou Google/
    // e-mail que não gravou nome) tinham ctx.user.name === null. O refresh emitia
    // `name: ""`, que verifySession REJEITA -> 403 na requisição seguinte ->
    // usuário chutado de volta pro login logo após entrar.
    const user = makeUser("sem-nome-open-id");
    user.name = null;
    const { ctx } = makeCtx(user, { bearer: true });
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.refresh();

    expect(result.success).toBe(true);
    const token = (result as { token: string }).token;
    // O token PRECISA verificar — senão a próxima chamada protegida dá 403.
    const decoded = await sdk.verifySession(token);
    expect(decoded).not.toBeNull();
    expect(decoded!.openId).toBe("sem-nome-open-id");
  });

  it("web (cookie): resets the cookie but does NOT leak the token in the body", async () => {
    // No Bearer header => web client. The token must stay in the httpOnly
    // cookie only; returning it in the body would expose it to JS (XSS).
    const { ctx, cookies } = makeCtx(makeUser("vovo-open-id"));
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.refresh();

    expect(result.success).toBe(true);
    expect("token" in result).toBe(false);

    expect(cookies).toHaveLength(1);
    expect(cookies[0].name).toBe("app_session_id");
    expect(typeof cookies[0].value).toBe("string");
  });
});
