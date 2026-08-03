/**
 * push-unregister.test.ts
 *
 * Regressão da notificação que chegava em aparelho deslogado.
 *
 * A linha em `push_tokens` era gravada uma vez (login de cuidador) e nunca mais
 * removida nem re-chaveada: não existia procedure de unregister, e o único
 * delete era o pruning de token que o Expo reporta como inválido. Resultado: o
 * servidor continuava entregando alertas do cuidador naquele aparelho mesmo
 * depois de trocar de conta ou sair de todas elas.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../server/_core/context";
import type { User } from "../drizzle/schema";

const deleted: string[] = [];

vi.mock("../server/db-push", () => ({
  upsertPushToken: vi.fn(async () => {}),
  deletePushToken: vi.fn(async (token: string) => {
    deleted.push(token);
  }),
  getPushTokensForOpenIds: vi.fn(async () => []),
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
    res: {
      clearCookie: () => undefined,
      cookie: () => undefined,
    } as unknown as TrpcContext["res"],
  };
}

beforeEach(() => {
  deleted.length = 0;
});

describe("push.unregister", () => {
  it("rejeita chamador não autenticado", async () => {
    const caller = appRouter.createCaller(makeCtx(null));
    await expect(
      caller.push.unregister({ token: "ExponentPushToken[abc]" })
    ).rejects.toThrowError(/login|UNAUTHED|UNAUTHORIZED/i);
  });

  it("apaga a linha do token informado", async () => {
    const caller = appRouter.createCaller(makeCtx(makeUser("maria")));

    const result = await caller.push.unregister({
      token: "ExponentPushToken[abc]",
    });

    expect(result).toEqual({ success: true });
    expect(deleted).toEqual(["ExponentPushToken[abc]"]);
  });

  it("apaga a linha mesmo quando ela pertence a outra conta", async () => {
    // Este é o caso do bug: o aparelho registrou como cuidador, depois trocou
    // para a conta monitorada. Quem sai é a conta monitorada, mas a linha ainda
    // está chaveada no cuidador — apagar por token (e não por openId) é o que
    // realmente para as notificações neste aparelho.
    const caller = appRouter.createCaller(makeCtx(makeUser("monitorado")));

    await caller.push.unregister({ token: "token-do-cuidador" });

    expect(deleted).toEqual(["token-do-cuidador"]);
  });
});
