/**
 * monitoring-missed-alarm-push.test.ts
 *
 * Fecha o vão do push ao cuidador quando o app do monitorado está VIVO e
 * confirma um alarme como perdido (confirmEvent status='missed'). Antes, esse
 * caminho só mandava WhatsApp aos contatos — o push ao cuidador só saía pelo
 * backstop do servidor (Passo 4), que é bloqueado justamente porque o cliente
 * já setou warningSent=true. Ver docs/claude/alarmes.md.
 *
 * Regras verificadas:
 *  - confirmEvent(missed) COM transição real (pending->missed) => push ao cuidador.
 *  - confirmEvent(responded) => nunca push.
 *  - confirmEvent(missed) SEM transição (retry/idempotência) => nunca push.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../server/_core/context";
import type { User } from "../drizzle/schema";

// updateAlarmEventStatusByAlarmId é controlado por teste: devolve um evento
// (transição real) ou null (nada a atualizar / idempotência).
let transitionResult: { id: number } | null = { id: 1 };

vi.mock("../server/db-monitoring", () => ({
  recordHeartbeat: vi.fn(async () => undefined),
  getAccountLiveness: vi.fn(async () => null),
  createAlarmEvent: vi.fn(async () => 1),
  updateAlarmEventStatusByAlarmId: vi.fn(async () => transitionResult),
  getAlarmEventHistory: vi.fn(async () => []),
  getWarningHistory: vi.fn(async () => []),
}));

// Só sobrescreve o alvo; o resto do módulo continua real para não quebrar o
// import do appRouter (outros routers importam daqui).
vi.mock("../server/db-links", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../server/db-links")>()),
  getActiveCaregiversForMonitored: vi.fn(async () => [
    { caregiverOpenId: "cg-1" },
  ]),
}));
vi.mock("../server/db-push", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../server/db-push")>()),
  getPushTokensForOpenIds: vi.fn(async () => [{ token: "ExpoTok[cg-1]" }]),
}));
vi.mock("../server/push", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../server/push")>()),
  sendExpoPush: vi.fn(async () => 1),
}));

import { appRouter } from "../server/routers";
import * as push from "../server/push";

function makeUser(openId: string): User {
  return {
    id: 1,
    openId,
    name: "Vô João",
    email: "joao@example.com",
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
  transitionResult = { id: 1 };
  vi.clearAllMocks();
});

describe("confirmEvent — push ao cuidador em alarme perdido (app vivo)", () => {
  it("missed COM transição real => empurra push 'missed_alarm' aos cuidadores", async () => {
    const caller = appRouter.createCaller(makeCtx(makeUser("vovo")));
    await caller.monitoring.confirmEvent({
      alarmId: "a1",
      scheduledAt: new Date().toISOString(),
      status: "missed",
    });

    expect(push.sendExpoPush).toHaveBeenCalledTimes(1);
    const [tokens, message] = vi.mocked(push.sendExpoPush).mock.calls[0];
    expect(tokens).toEqual(["ExpoTok[cg-1]"]);
    expect(message.data).toMatchObject({ type: "missed_alarm" });
  });

  it("missed de check-in => push 'missed_checkin' (não 'missed_alarm')", async () => {
    const caller = appRouter.createCaller(makeCtx(makeUser("vovo")));
    await caller.monitoring.confirmEvent({
      alarmId: "checkin-daily",
      scheduledAt: new Date().toISOString(),
      status: "missed",
    });

    expect(push.sendExpoPush).toHaveBeenCalledTimes(1);
    const [, message] = vi.mocked(push.sendExpoPush).mock.calls[0];
    expect(message.data).toMatchObject({ type: "missed_checkin" });
    expect(message.title).toMatch(/Check-in/i);
  });

  it("responded => nunca notifica o cuidador", async () => {
    const caller = appRouter.createCaller(makeCtx(makeUser("vovo")));
    await caller.monitoring.confirmEvent({
      alarmId: "a1",
      scheduledAt: new Date().toISOString(),
      status: "responded",
    });
    expect(push.sendExpoPush).not.toHaveBeenCalled();
  });

  it("missed SEM transição (retry/idempotência) => não duplica o push", async () => {
    transitionResult = null; // nenhum evento pendente foi atualizado
    const caller = appRouter.createCaller(makeCtx(makeUser("vovo")));
    await caller.monitoring.confirmEvent({
      alarmId: "a1",
      scheduledAt: new Date().toISOString(),
      status: "missed",
    });
    expect(push.sendExpoPush).not.toHaveBeenCalled();
  });
});

describe("confirmEvent — rate limit do push de alarme perdido ao cuidador", () => {
  // openIds próprios (não "vovo") para não herdar contagem das describes acima
  // — o limitador é estado de módulo (Map por processo), não resetado por teste.

  it("limita o push após N chamadas rápidas para a MESMA conta (evento sempre gravado)", async () => {
    const caller = appRouter.createCaller(makeCtx(makeUser("rl-conta-1")));
    for (let i = 0; i < 12; i++) {
      const result = await caller.monitoring.confirmEvent({
        alarmId: `a${i}`,
        scheduledAt: new Date().toISOString(),
        status: "missed",
      });
      expect(result.success).toBe(true); // o evento em si sempre "grava" (mock)
    }
    // Limite é 10 — as 2 últimas chamadas não geram push, mas confirmEvent segue OK.
    expect(push.sendExpoPush).toHaveBeenCalledTimes(10);
  });

  it("o limite é POR CONTA — uma conta diferente não é afetada", async () => {
    const contaA = appRouter.createCaller(makeCtx(makeUser("rl-conta-2")));
    for (let i = 0; i < 10; i++) {
      await contaA.monitoring.confirmEvent({
        alarmId: `a${i}`,
        scheduledAt: new Date().toISOString(),
        status: "missed",
      });
    }
    expect(push.sendExpoPush).toHaveBeenCalledTimes(10);

    const contaB = appRouter.createCaller(makeCtx(makeUser("rl-conta-3")));
    await contaB.monitoring.confirmEvent({
      alarmId: "b1",
      scheduledAt: new Date().toISOString(),
      status: "missed",
    });
    expect(push.sendExpoPush).toHaveBeenCalledTimes(11);
  });
});
