/**
 * anonymous-account.test.ts — item 4 do roadmap (login opcional via conta
 * anônima; spec docs/design/2026-07-12-monitoring-account-ownership.md,
 * "Contas sem login"):
 *   - POST /api/auth/anonymous: validação do deviceId, openId determinístico
 *     (anon:<deviceId>), idempotência, porta fechada após o upgrade;
 *   - getLinkableAnonymousOpenId: só oferece vinculação para sessão anônima;
 *   - guard de vínculo: conta anônima não cria/resgata convites (o vínculo
 *     precisa sobreviver a reinstalação).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../server/_core/context";
import type { User } from "../drizzle/schema";

// --- Estado em memória: users por openId --------------------------------------
const usersByOpenId = new Map<
  string,
  { openId: string; name: string | null; loginMethod: string | null }
>();

vi.mock("../server/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../server/db")>();
  return {
    ...actual,
    getUserByOpenId: vi.fn(async (openId: string) => usersByOpenId.get(openId)),
    upsertUser: vi.fn(
      async (u: { openId: string; loginMethod?: string | null; name?: string | null }) => {
        const prev = usersByOpenId.get(u.openId);
        usersByOpenId.set(u.openId, {
          openId: u.openId,
          name: u.name ?? prev?.name ?? null,
          loginMethod: u.loginMethod ?? prev?.loginMethod ?? null,
        });
      }
    ),
  };
});

// issueSession real assina JWT (JWT_SECRET) — substitui por stub determinístico.
vi.mock("../server/auth-shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../server/auth-shared")>();
  return {
    ...actual,
    issueSession: vi.fn(async (openId: string, name: string) => ({
      sessionToken: `token-${openId}`,
      user: { openId, name } as never,
    })),
  };
});

// Grafo do appRouter (guard de vínculo): stubs mínimos das camadas de dados.
vi.mock("../server/db-links", () => ({
  consumeInviteByCode: vi.fn(async () => true),
  createInvite: vi.fn(async () => undefined),
  getActiveCaregiversForMonitored: vi.fn(async () => []),
  getActiveLinkForCaregiver: vi.fn(async () => null),
  getInviteByCode: vi.fn(async () => null),
  getRecentMissedEventsForAccount: vi.fn(async () => []),
  getRecentWarningsForAccount: vi.fn(async () => []),
  revokeLink: vi.fn(async () => undefined),
  upsertActiveLink: vi.fn(async () => undefined),
}));

vi.mock("../server/db-monitoring", () => ({
  recordHeartbeat: vi.fn(async () => undefined),
  getAccountLiveness: vi.fn(async () => null),
  createAlarmEvent: vi.fn(async () => 1),
  updateAlarmEventStatusByAlarmId: vi.fn(async () => undefined),
  getAlarmEventHistory: vi.fn(async () => []),
  getWarningHistory: vi.fn(async () => []),
}));

import { registerAnonymousAuthRoute } from "../server/anonymous-auth";
import { getLinkableAnonymousOpenId } from "../server/auth-shared";
import { sdk } from "../server/_core/sdk";
import { appRouter } from "../server/routers";
import * as db from "../server/db";

// --- Helpers -------------------------------------------------------------------

const DEVICE_ID = "3fa85f64-5717-4562-b3fc-2c963f66afa6";

type RouteHandler = (req: unknown, res: unknown) => Promise<void> | void;

/** Captura o handler final da rota (depois do rate-limit middleware). */
function captureAnonymousHandler(): RouteHandler {
  let handler: RouteHandler | undefined;
  const app = {
    post: (_path: string, ...handlers: RouteHandler[]) => {
      handler = handlers[handlers.length - 1];
    },
  };
  registerAnonymousAuthRoute(app as never);
  if (!handler) throw new Error("rota não registrada");
  return handler;
}

function fakeRes() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.body = payload;
      return res;
    },
  };
  return res;
}

function makeUser(openId: string, loginMethod: string): User {
  return {
    id: 1,
    openId,
    name: "Test User",
    email: null,
    phone: null,
    userType: "monitored",
    birthDate: null,
    bloodType: null,
    loginMethod,
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
  usersByOpenId.clear();
  vi.clearAllMocks();
});

// --- POST /api/auth/anonymous ---------------------------------------------------

describe("POST /api/auth/anonymous", () => {
  it("rejeita deviceId fora do formato UUID", async () => {
    const handler = captureAnonymousHandler();
    const res = fakeRes();
    await handler({ body: { deviceId: "abc" } }, res);
    expect(res.statusCode).toBe(400);
  });

  it("cria a conta anônima com openId determinístico anon:<deviceId>", async () => {
    const handler = captureAnonymousHandler();
    const res = fakeRes();
    await handler({ body: { deviceId: DEVICE_ID } }, res);

    expect(res.statusCode).toBe(200);
    expect((res.body as { sessionToken: string }).sessionToken).toBe(
      `token-anon:${DEVICE_ID}`
    );
    expect(usersByOpenId.get(`anon:${DEVICE_ID}`)?.loginMethod).toBe("anonymous");
  });

  it("é idempotente: o mesmo deviceId reautentica a MESMA conta", async () => {
    const handler = captureAnonymousHandler();
    await handler({ body: { deviceId: DEVICE_ID } }, fakeRes());
    const res2 = fakeRes();
    await handler({ body: { deviceId: DEVICE_ID } }, res2);

    expect(res2.statusCode).toBe(200);
    expect(usersByOpenId.size).toBe(1);
    expect(vi.mocked(db.upsertUser)).toHaveBeenCalledTimes(2);
  });

  it("fecha a porta após o upgrade: conta com login real não reautentica por deviceId", async () => {
    usersByOpenId.set(`anon:${DEVICE_ID}`, {
      openId: `anon:${DEVICE_ID}`,
      name: "Seu José",
      loginMethod: "google",
    });
    const handler = captureAnonymousHandler();
    const res = fakeRes();
    await handler({ body: { deviceId: DEVICE_ID } }, res);

    expect(res.statusCode).toBe(403);
    // E não rebaixa a conta de volta a anônima.
    expect(usersByOpenId.get(`anon:${DEVICE_ID}`)?.loginMethod).toBe("google");
  });
});

// --- getLinkableAnonymousOpenId --------------------------------------------------

describe("getLinkableAnonymousOpenId", () => {
  it("retorna o openId quando a sessão é de conta anônima", async () => {
    vi.spyOn(sdk, "authenticateRequest").mockResolvedValueOnce(
      makeUser("anon:xyz", "anonymous")
    );
    await expect(getLinkableAnonymousOpenId({} as never)).resolves.toBe("anon:xyz");
  });

  it("retorna undefined para sessão de conta com login real", async () => {
    vi.spyOn(sdk, "authenticateRequest").mockResolvedValueOnce(
      makeUser("google:123", "google")
    );
    await expect(getLinkableAnonymousOpenId({} as never)).resolves.toBeUndefined();
  });

  it("retorna undefined sem sessão (authenticateRequest lança)", async () => {
    vi.spyOn(sdk, "authenticateRequest").mockRejectedValueOnce(new Error("no session"));
    await expect(getLinkableAnonymousOpenId({} as never)).resolves.toBeUndefined();
  });
});

// --- Guard de vínculo para conta anônima ----------------------------------------

describe("vínculo bloqueado para conta anônima", () => {
  it("createInvite (monitorado anônimo) → FORBIDDEN com caminho de upgrade", async () => {
    const caller = appRouter.createCaller(makeCtx(makeUser("anon:a", "anonymous")));
    await expect(caller.link.createInvite()).rejects.toThrow(/proteja sua conta/i);
  });

  it("redeemInvite (cuidador anônimo) → FORBIDDEN", async () => {
    const user = { ...makeUser("anon:b", "anonymous"), userType: "caregiver" as const };
    const caller = appRouter.createCaller(makeCtx(user));
    await expect(
      caller.link.redeemInvite({ code: "ABCDEF", method: "code" })
    ).rejects.toThrow(/proteja sua conta/i);
  });

  it("acceptInvite (monitorado anônimo) → FORBIDDEN", async () => {
    const caller = appRouter.createCaller(makeCtx(makeUser("anon:c", "anonymous")));
    await expect(
      caller.link.acceptInvite({ token: "tok_1234567890" })
    ).rejects.toThrow(/proteja sua conta/i);
  });

  it("conta com login real passa pelo guard (createInvite funciona)", async () => {
    const caller = appRouter.createCaller(makeCtx(makeUser("google:1", "google")));
    const result = await caller.link.createInvite();
    expect(result.code).toMatch(/^[A-Z0-9]{6}$/i);
  });
});
