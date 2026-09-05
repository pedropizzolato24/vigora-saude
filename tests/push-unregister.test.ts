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
 *
 * SEGURANÇA (auditoria set/2026, V-01): a primeira correção apagava por TOKEN
 * puro, sem checar posse — bastava conhecer o Expo push token de um cuidador
 * para apagá-lo e desarmar, em silêncio, todo o alerta em tempo real do dead
 * man's switch daquela pessoa. Agora a remoção exige prova de posse: a linha é
 * da própria conta, OU o chamador apresenta o `deviceId` gravado nela.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../server/_core/context";
import type { User } from "../drizzle/schema";

interface Linha {
  token: string;
  openId: string;
  deviceId?: string;
}

let linhas: Linha[] = [];
const registros: unknown[] = [];

vi.mock("../server/db-push", () => ({
  upsertPushToken: vi.fn(async (data: unknown) => {
    registros.push(data);
  }),
  // Espelha a regra de posse de db-push.deleteOwnedPushToken sobre linhas em
  // memória, para que os testes abaixo verifiquem o COMPORTAMENTO e não apenas
  // que a função foi chamada.
  deleteOwnedPushToken: vi.fn(
    async (token: string, caller: { openId: string; deviceId?: string }) => {
      const antes = linhas.length;
      linhas = linhas.filter(
        (l) =>
          !(
            l.token === token &&
            (l.openId === caller.openId ||
              (!!caller.deviceId && l.deviceId === caller.deviceId))
          )
      );
      return linhas.length < antes;
    }
  ),
  deletePushToken: vi.fn(async () => {}),
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

const DEVICE_CUIDADOR = "11111111-2222-3333-4444-555555555555";
const DEVICE_ATACANTE = "99999999-8888-7777-6666-555555555555";

beforeEach(() => {
  registros.length = 0;
  linhas = [
    { token: "token-da-maria", openId: "maria", deviceId: DEVICE_CUIDADOR },
    { token: "token-do-cuidador", openId: "cuidador", deviceId: DEVICE_CUIDADOR },
    // Linha anterior à coluna deviceId (migração 0014): só a própria conta
    // consegue removê-la, até o aparelho registrar de novo.
    { token: "token-legado", openId: "cuidador" },
  ];
});

describe("push.unregister", () => {
  it("rejeita chamador não autenticado", async () => {
    const caller = appRouter.createCaller(makeCtx(null));
    await expect(
      caller.push.unregister({ token: "token-da-maria" })
    ).rejects.toThrowError(/login|UNAUTHED|UNAUTHORIZED/i);
  });

  it("apaga a linha da própria conta", async () => {
    const caller = appRouter.createCaller(makeCtx(makeUser("maria")));

    const result = await caller.push.unregister({ token: "token-da-maria" });

    expect(result).toEqual({ success: true, removed: true });
    expect(linhas.some((l) => l.token === "token-da-maria")).toBe(false);
  });

  it("apaga a linha de outra conta quando o aparelho prova posse pelo deviceId", async () => {
    // Caso legítimo que motivou apagar por token: o aparelho registrou como
    // cuidador e depois entrou na conta monitorada. Quem sai é o monitorado, mas
    // a linha segue chaveada no cuidador — é o deviceId que autoriza.
    const caller = appRouter.createCaller(makeCtx(makeUser("monitorado")));

    const result = await caller.push.unregister({
      token: "token-do-cuidador",
      deviceId: DEVICE_CUIDADOR,
    });

    expect(result).toEqual({ success: true, removed: true });
    expect(linhas.some((l) => l.token === "token-do-cuidador")).toBe(false);
  });

  it("NÃO apaga a linha de outra conta sem deviceId (era o IDOR)", async () => {
    // Antes da correção esta chamada apagava a linha e desarmava, em silêncio,
    // o alerta em tempo real do cuidador. Conhecer o token não é autorização.
    const caller = appRouter.createCaller(makeCtx(makeUser("atacante")));

    const result = await caller.push.unregister({ token: "token-do-cuidador" });

    expect(result).toEqual({ success: true, removed: false });
    expect(linhas.some((l) => l.token === "token-do-cuidador")).toBe(true);
  });

  it("NÃO apaga a linha de outra conta com deviceId errado", async () => {
    const caller = appRouter.createCaller(makeCtx(makeUser("atacante")));

    const result = await caller.push.unregister({
      token: "token-do-cuidador",
      deviceId: DEVICE_ATACANTE,
    });

    expect(result).toEqual({ success: true, removed: false });
    expect(linhas.some((l) => l.token === "token-do-cuidador")).toBe(true);
  });

  it("NÃO apaga linha legada (sem deviceId) de outra conta", async () => {
    const caller = appRouter.createCaller(makeCtx(makeUser("atacante")));

    const result = await caller.push.unregister({
      token: "token-legado",
      deviceId: DEVICE_ATACANTE,
    });

    expect(result).toEqual({ success: true, removed: false });
    expect(linhas.some((l) => l.token === "token-legado")).toBe(true);
  });
});

describe("push.register", () => {
  it("grava o deviceId junto do token (prova de posse do aparelho)", async () => {
    const caller = appRouter.createCaller(makeCtx(makeUser("cuidador")));

    await caller.push.register({
      token: "token-novo",
      platform: "android",
      deviceId: DEVICE_CUIDADOR,
    });

    expect(registros[0]).toEqual({
      openId: "cuidador",
      token: "token-novo",
      platform: "android",
      deviceId: DEVICE_CUIDADOR,
    });
  });

  it("aceita cliente antigo que não envia deviceId", async () => {
    const caller = appRouter.createCaller(makeCtx(makeUser("cuidador")));

    await caller.push.register({ token: "token-antigo", platform: "ios" });

    expect(registros[0]).toMatchObject({
      openId: "cuidador",
      token: "token-antigo",
      platform: "ios",
      deviceId: undefined,
    });
  });
});
