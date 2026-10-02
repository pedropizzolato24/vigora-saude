/**
 * Mudança de alarme no backup (userData.put): grava a mudança e avisa o
 * cuidador. Antes, excluir ou desativar um alarme fazia o monitoring-job apagar
 * o evento pendente em silêncio — o cuidador nunca ficava sabendo.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../server/_core/context";
import type { User } from "../drizzle/schema";

let storedAlarms: unknown = undefined;
let hasStoredRow = true;

vi.mock("../server/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../server/db")>();
  return {
    ...actual,
    getUserData: vi.fn(async () => (hasStoredRow ? { alarms: storedAlarms } : undefined)),
    upsertUserData: vi.fn(async () => undefined),
  };
});
vi.mock("../server/db-alarm-changes", () => ({
  insertAlarmChanges: vi.fn(async () => undefined),
  getRecentAlarmChanges: vi.fn(async () => []),
}));
vi.mock("../server/db-links", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../server/db-links")>()),
  getActiveCaregiversForMonitored: vi.fn(async () => [{ caregiverOpenId: "cg-1" }]),
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
import * as db from "../server/db";
import * as dbChanges from "../server/db-alarm-changes";
import * as dbLinks from "../server/db-links";
import * as push from "../server/push";

const losartana = { id: "a1", time: "08:00", description: "Losartana", enabled: true, repeat: "daily" };
const metformina = { id: "a2", time: "20:00", description: "Metformina", enabled: true, repeat: "daily" };

function makeUser(openId: string): User {
  return {
    id: 1,
    openId,
    name: "Conta Maria",
    email: "maria@example.com",
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

function makeCtx(user: User): TrpcContext {
  return {
    user,
    req: { headers: {}, protocol: "https" } as TrpcContext["req"],
    res: { clearCookie: () => undefined, cookie: () => undefined } as unknown as TrpcContext["res"],
  };
}

/** O push roda solto (fire-and-forget): espera a fila de microtarefas esvaziar. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function put(openId: string, alarms: unknown[]) {
  const caller = appRouter.createCaller(makeCtx(makeUser(openId)));
  return caller.userData.put({
    alarms,
    anamnesis: { fullName: "Vó Maria" },
    dataUpdatedAt: Date.now(),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  storedAlarms = undefined;
  hasStoredRow = true;
});

describe("userData.put — mudanças de alarme", () => {
  it("excluir um alarme grava a mudança e avisa o cuidador com o nome do lembrete", async () => {
    storedAlarms = [losartana, metformina];

    await put("maria-1", [metformina]);
    await flush();

    expect(dbChanges.insertAlarmChanges).toHaveBeenCalledWith([
      expect.objectContaining({
        openId: "maria-1",
        alarmId: "a1",
        alarmDescription: "Losartana",
        changeType: "deleted",
      }),
    ]);
    expect(push.sendExpoPush).toHaveBeenCalledTimes(1);
    const [tokens, message] = vi.mocked(push.sendExpoPush).mock.calls[0];
    expect(tokens).toEqual(["ExpoTok[cg-1]"]);
    expect(message.body).toBe('Vó Maria excluiu o lembrete "Losartana".');
    expect(message.data).toMatchObject({ type: "alarm_changed" });
  });

  it("o mesmo backup repetido não grava nem avisa nada", async () => {
    storedAlarms = [losartana, metformina];

    await put("maria-2", [metformina, losartana]);
    await flush();

    expect(dbChanges.insertAlarmChanges).not.toHaveBeenCalled();
    expect(push.sendExpoPush).not.toHaveBeenCalled();
  });

  it("primeiro backup da conta (sem linha anterior) não gera mudança", async () => {
    hasStoredRow = false;

    await put("maria-3", [losartana]);

    expect(db.upsertUserData).toHaveBeenCalledTimes(1);
    expect(dbChanges.insertAlarmChanges).not.toHaveBeenCalled();
  });

  it("lista anterior ilegível não derruba o backup nem gera aviso", async () => {
    for (const lixo of ["lixo", [null, 42, {}, { id: "" }], { alarms: 1 }]) {
      storedAlarms = lixo;
      await expect(put("maria-4", [losartana])).resolves.toEqual({ success: true });
    }
    expect(dbChanges.insertAlarmChanges).not.toHaveBeenCalled();
    expect(push.sendExpoPush).not.toHaveBeenCalled();
  });

  it("falha ao gravar a mudança não derruba o backup", async () => {
    storedAlarms = [losartana];
    vi.mocked(dbChanges.insertAlarmChanges).mockRejectedValueOnce(new Error("DB fora do ar"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(put("maria-5", [])).resolves.toEqual({ success: true });
    expect(db.upsertUserData).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("sem cuidador vinculado grava a mudança e não manda push", async () => {
    storedAlarms = [losartana];
    vi.mocked(dbLinks.getActiveCaregiversForMonitored).mockResolvedValueOnce([]);

    await put("maria-6", []);
    await flush();

    expect(dbChanges.insertAlarmChanges).toHaveBeenCalledTimes(1);
    expect(push.sendExpoPush).not.toHaveBeenCalled();
  });

  it("limita o push a 5 por minuto, mas grava todas as mudanças", async () => {
    for (let i = 0; i < 6; i++) {
      storedAlarms = [{ ...losartana, id: `x${i}` }];
      await put("maria-7", []);
    }
    await flush();
    expect(dbChanges.insertAlarmChanges).toHaveBeenCalledTimes(6);
    expect(push.sendExpoPush).toHaveBeenCalledTimes(5);
  });

  it("falha ao gravar não vaza openId nem nome do lembrete no log", async () => {
    storedAlarms = [losartana];
    const driverErr = Object.assign(
      new Error("Failed query: insert ... params: maria-8,a1,Losartana"),
      { name: "DrizzleQueryError", cause: { code: "ER_DOWN" } }
    );
    vi.mocked(dbChanges.insertAlarmChanges).mockRejectedValueOnce(driverErr);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await put("maria-8", []);
    await flush();

    const logged = JSON.stringify(warn.mock.calls);
    expect(warn).toHaveBeenCalled();
    expect(logged).not.toContain("Losartana");
    expect(logged).not.toContain("maria-8");
    expect(logged).toContain("ER_DOWN");
    warn.mockRestore();
  });

  it("alarmId com mais de 64 caracteres não é gravado; os demais são", async () => {
    const longId = "x".repeat(65);
    storedAlarms = [{ ...losartana, id: longId }, metformina];

    await put("maria-9", []);
    await flush();

    expect(dbChanges.insertAlarmChanges).toHaveBeenCalledWith([
      expect.objectContaining({ alarmId: "a2", changeType: "deleted" }),
    ]);
  });

  it("put resolve mesmo com o push do Expo ainda pendente", async () => {
    storedAlarms = [losartana];
    vi.mocked(push.sendExpoPush).mockReturnValueOnce(new Promise<number>(() => undefined));

    await expect(put("maria-10", [])).resolves.toEqual({ success: true });
    await flush();
    expect(push.sendExpoPush).toHaveBeenCalledTimes(1);
  });
});
