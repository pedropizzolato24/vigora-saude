/**
 * - getMonitoredAlerts devolve as mudanças de alarme do monitorado VINCULADO
 *   (a conta vem do vínculo, nunca de input).
 * - Quando o monitorado encerra o vínculo, o cuidador é avisado. `otherOpenId`
 *   vem do cliente: só avisa quem de fato estava vinculado.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../server/_core/context";
import type { User } from "../drizzle/schema";

vi.mock("../server/db-links", () => ({
  getActiveCaregiversForMonitored: vi.fn(async () => [{ caregiverOpenId: "cg-1" }]),
  createInvite: vi.fn(),
  consumeInviteByCode: vi.fn(),
  getActiveLinkForCaregiver: vi.fn(async () => ({ monitoredOpenId: "vovo" })),
  getInviteByCode: vi.fn(),
  getRecentMissedEventsForAccount: vi.fn(async () => []),
  getRecentWarningsForAccount: vi.fn(async () => []),
  revokeLink: vi.fn(async () => undefined),
  upsertActiveLink: vi.fn(),
}));
vi.mock("../server/db-alarm-changes", () => ({
  insertAlarmChanges: vi.fn(),
  getRecentAlarmChanges: vi.fn(async () => [
    {
      id: 7,
      alarmId: "a1",
      alarmDescription: "Losartana",
      changeType: "deleted",
      oldTime: "08:00",
      newTime: null,
      createdAt: new Date("2026-10-02T17:32:00Z"),
    },
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
vi.mock("../server/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../server/db")>()),
  getUserByOpenId: vi.fn(async () => ({ name: "Conta Vovó", openId: "vovo" })),
  getUserData: vi.fn(async () => ({ anamnesis: { fullName: "Vovó Dona" } })),
}));

import { appRouter } from "../server/routers";
import * as dbLinks from "../server/db-links";
import * as dbChanges from "../server/db-alarm-changes";
import * as dbPush from "../server/db-push";
import * as push from "../server/push";

function makeUser(openId: string, userType: "monitored" | "caregiver"): User {
  return {
    id: 1,
    openId,
    name: "Conta",
    email: "x@example.com",
    phone: null,
    userType,
    birthDate: null,
    bloodType: null,
    loginMethod: "google",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
}

function makeCtx(user: User): TrpcContext {
  return {
    user,
    req: { headers: {}, protocol: "https" } as TrpcContext["req"],
    res: { clearCookie: () => undefined, cookie: () => undefined } as unknown as TrpcContext["res"],
  };
}

/** O push do desvínculo é fire-and-forget: espera a fila de microtasks/timers esvaziar. */
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("link.getMonitoredAlerts — mudanças de alarme", () => {
  it("devolve as mudanças do monitorado vinculado, com createdAt em epoch-ms", async () => {
    const caller = appRouter.createCaller(makeCtx(makeUser("cg-1", "caregiver")));
    const result = await caller.link.getMonitoredAlerts();

    expect(dbChanges.getRecentAlarmChanges).toHaveBeenCalledWith("vovo", 20);
    expect(result.changes).toEqual([
      {
        id: 7,
        alarmId: "a1",
        alarmDescription: "Losartana",
        changeType: "deleted",
        oldTime: "08:00",
        newTime: null,
        createdAt: new Date("2026-10-02T17:32:00Z").getTime(),
      },
    ]);
  });

  it("sem vínculo ativo é proibido", async () => {
    vi.mocked(dbLinks.getActiveLinkForCaregiver).mockResolvedValueOnce(null);
    const caller = appRouter.createCaller(makeCtx(makeUser("cg-2", "caregiver")));
    await expect(caller.link.getMonitoredAlerts()).rejects.toThrow(/vinculado/i);
  });
});

describe("link.revokeLink — aviso ao cuidador", () => {
  it("monitorado encerra o vínculo: o cuidador vinculado recebe 'link_revoked'", async () => {
    const caller = appRouter.createCaller(makeCtx(makeUser("vovo", "monitored")));
    await caller.link.revokeLink({ otherOpenId: "cg-1" });
    await flush();

    expect(dbLinks.revokeLink).toHaveBeenCalledWith("cg-1", "vovo");
    expect(dbPush.getPushTokensForOpenIds).toHaveBeenCalledWith(["cg-1"]);
    expect(push.sendExpoPush).toHaveBeenCalledTimes(1);
    const [tokens, message] = vi.mocked(push.sendExpoPush).mock.calls[0];
    expect(tokens).toEqual(["ExpoTok[cg-1]"]);
    expect(message.body).toBe("Vovó Dona encerrou o acompanhamento.");
    expect(message.data).toMatchObject({ type: "link_revoked", url: "/(caregiver-tabs)/link" });
  });

  it("otherOpenId de quem NÃO é cuidador vinculado não recebe push", async () => {
    const caller = appRouter.createCaller(makeCtx(makeUser("vovo", "monitored")));
    await caller.link.revokeLink({ otherOpenId: "estranho" });
    await flush();

    expect(push.sendExpoPush).not.toHaveBeenCalled();
  });

  it("cuidador desvincula: ninguém é avisado", async () => {
    const caller = appRouter.createCaller(makeCtx(makeUser("cg-1", "caregiver")));
    await caller.link.revokeLink({ otherOpenId: "vovo" });
    await flush();

    expect(dbLinks.revokeLink).toHaveBeenCalledWith("cg-1", "vovo");
    expect(push.sendExpoPush).not.toHaveBeenCalled();
  });

  it("falha no push não impede o desvínculo", async () => {
    vi.mocked(push.sendExpoPush).mockRejectedValueOnce(new Error("Expo fora do ar"));
    const caller = appRouter.createCaller(makeCtx(makeUser("vovo", "monitored")));
    await expect(caller.link.revokeLink({ otherOpenId: "cg-1" })).resolves.toEqual({ success: true });
    await flush();
  });
});
