/**
 * user-data-export.test.ts
 *
 * Cobre o endpoint userData.export (LGPD Art. 18, V): gate de autenticação,
 * escopo pelo openId do chamador (nunca por input) e a garantia de que
 * segredos operacionais não vazam no payload.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../server/_core/context";
import type { User } from "../drizzle/schema";

const alarmsByOpenId = new Map<string, unknown[]>();
const warningsByOpenId = new Map<string, unknown[]>();

vi.mock("../server/db-monitoring", () => ({
  getAlarmEventHistory: vi.fn(async (openId: string) => alarmsByOpenId.get(openId) ?? []),
  getWarningHistory: vi.fn(async (openId: string) => warningsByOpenId.get(openId) ?? []),
  getAccountLiveness: vi.fn(async (openId: string) => ({ openId, lastHeartbeat: 111 })),
}));

vi.mock("../server/db-links", () => ({
  getActiveCaregiversForMonitored: vi.fn(async () => []),
  createInvite: vi.fn(),
  consumeInviteByCode: vi.fn(),
  getActiveLinkForCaregiver: vi.fn(),
  getInviteByCode: vi.fn(),
  getRecentMissedEventsForAccount: vi.fn(async () => []),
  getRecentWarningsForAccount: vi.fn(async () => []),
  revokeLink: vi.fn(),
  upsertActiveLink: vi.fn(),
}));

vi.mock("../server/db-alarm-changes", () => ({
  getRecentAlarmChanges: vi.fn(async () => [{ id: 1, alarmId: "a1", changeType: "deleted" }]),
  insertAlarmChanges: vi.fn(),
}));

vi.mock("../server/db-alarm-management", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../server/db-alarm-management")>()),
  getManagementHistory: vi.fn(async (openId: string) =>
    openId === "maria"
      ? [{ id: 1, monitoredOpenId: "maria", caregiverOpenId: "ana", status: "ended", endedReason: "declined" }]
      : [],
  ),
}));

vi.mock("../server/db-managed-alarm-list", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../server/db-managed-alarm-list")>()),
  getManagedList: vi.fn(async (openId: string) =>
    openId === "maria" ? { monitoredOpenId: "maria", version: 3, alarms: [{ id: "a1" }] } : null,
  ),
}));

vi.mock("../server/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../server/db")>();
  return {
    ...actual,
    getUserByOpenId: vi.fn(async (openId: string) => ({
      name: "João",
      email: "joao@example.com",
      phone: null,
      openId,
    })),
    getUserData: vi.fn(async () => ({
      anamnesis: { fullName: "João" },
      emergencyContacts: [],
      alarms: [],
      settings: null,
      healthMetrics: [],
      profile: null,
      dataUpdatedAt: 42,
    })),
  };
});

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
  alarmsByOpenId.clear();
  warningsByOpenId.clear();
});

describe("userData.export", () => {
  it("rejeita chamador não autenticado", async () => {
    const caller = appRouter.createCaller(makeCtx(null));
    await expect(caller.userData.export()).rejects.toThrowError(
      /login|UNAUTHED|UNAUTHORIZED/i
    );
  });

  it("devolve todas as seções para o usuário autenticado", async () => {
    alarmsByOpenId.set("maria", [{ id: 1, status: "confirmed" }]);
    warningsByOpenId.set("maria", [{ id: 9, contactsReached: 2 }]);

    const caller = appRouter.createCaller(makeCtx(makeUser("maria")));
    const result = await caller.userData.export();

    expect(result.conta).toEqual({
      nome: "João",
      email: "joao@example.com",
      telefone: null,
    });
    expect(result.historicoDeAlarmes).toHaveLength(1);
    expect(result.alertasEnviados).toHaveLength(1);
    expect(result.sinalDeVida).toBeTruthy();
    expect(result.cuidadoresVinculados).toEqual([]);
    expect(result.dadosDaConta).toBeTruthy();
    expect(result.historicoDeAlteracoesDeAlarmes).toHaveLength(1);
  });

  it("inclui o histórico do acordo de gerenciamento e a lista gerenciada (LGPD Art. 18, V)", async () => {
    const { getManagementHistory } = await import("../server/db-alarm-management");
    const { getManagedList } = await import("../server/db-managed-alarm-list");

    const maria = await appRouter.createCaller(makeCtx(makeUser("maria"))).userData.export();
    expect(maria.acordosDeGerenciamento).toEqual([
      expect.objectContaining({ caregiverOpenId: "ana", status: "ended", endedReason: "declined" }),
    ]);
    expect(maria.listaGerenciada).toMatchObject({ version: 3, alarms: [{ id: "a1" }] });
    expect(getManagementHistory).toHaveBeenCalledWith("maria");
    expect(getManagedList).toHaveBeenCalledWith("maria");

    const bob = await appRouter.createCaller(makeCtx(makeUser("bob"))).userData.export();
    expect(bob.acordosDeGerenciamento).toEqual([]);
    expect(bob.listaGerenciada).toBeNull();
  });

  it("usa ctx.user.openId como escopo — cada chamador recebe o seu", async () => {
    const { getAlarmEventHistory } = await import("../server/db-monitoring");

    alarmsByOpenId.set("maria", [{ id: 1 }]);

    const maria = appRouter.createCaller(makeCtx(makeUser("maria")));
    const mariaResult = await maria.userData.export();
    expect(mariaResult.historicoDeAlarmes).toHaveLength(1);
    expect(getAlarmEventHistory).toHaveBeenCalledWith("maria", expect.any(Number));

    const bob = appRouter.createCaller(makeCtx(makeUser("bob")));
    const bobResult = await bob.userData.export();
    expect(bobResult.historicoDeAlarmes).toHaveLength(0);
    expect(getAlarmEventHistory).toHaveBeenCalledWith("bob", expect.any(Number));
  });

  it("não vaza segredos operacionais no payload", async () => {
    const caller = appRouter.createCaller(makeCtx(makeUser("maria")));
    const result = await caller.userData.export();

    const serialized = JSON.stringify(result);
    expect(serialized).not.toMatch(/authCodes|auth_codes/i);
    expect(serialized).not.toMatch(/pushTokens|push_tokens|ExponentPushToken/i);
    expect(serialized).not.toMatch(/linkInvites|link_invites/i);
  });
});
