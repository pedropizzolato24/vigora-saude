/**
 * user-data-put-managed.test.ts
 *
 * userData.put com o modo gerenciado:
 *  - com acordo ATIVO da conta, o backup é gravado mas o diff de alarmes NÃO
 *    roda (quem muda a lista é o cuidador, e cada mudança dele já foi
 *    registrada na gravação; sem isto o celular da Maria, ao aplicar o que a Ana
 *    apagou, geraria "Maria apagou…");
 *  - pedido pendente, acordo encerrado ou acordo de OUTRA conta não mudam nada;
 *  - o fuso do aparelho vai para user_data.timezone;
 *  - o put é sinal de vida do idoso (touchLiveness), mas não do cuidador.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../server/_core/context";
import type { User } from "../drizzle/schema";

let storedAlarms: unknown = [];
const comAcordoAtivo = new Set<string>();
let consultaFalha = false;

vi.mock("../server/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../server/db")>()),
  getUserData: vi.fn(async () => ({ alarms: storedAlarms })),
  upsertUserData: vi.fn(async () => undefined),
}));
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
vi.mock("../server/db-alarm-management", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../server/db-alarm-management")>()),
  getActiveManagementForMonitored: vi.fn(async (openId: string) => {
    if (consultaFalha) throw new Error("DB fora do ar");
    return comAcordoAtivo.has(openId) ? { id: 1, monitoredOpenId: openId, status: "active" } : null;
  }),
}));
vi.mock("../server/db-monitoring", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../server/db-monitoring")>()),
  touchLiveness: vi.fn(async () => undefined),
}));

import { appRouter } from "../server/routers";
import * as db from "../server/db";
import * as dbChanges from "../server/db-alarm-changes";
import * as dbManagement from "../server/db-alarm-management";
import * as dbMonitoring from "../server/db-monitoring";
import * as push from "../server/push";

const losartana = { id: "a1", time: "08:00", description: "Losartana", enabled: true, repeat: "daily" };

function makeUser(openId: string, userType: "monitored" | "caregiver" = "monitored"): User {
  return {
    id: 1,
    openId,
    name: "Conta Maria",
    email: "maria@example.com",
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

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

function put(openId: string, extra: Record<string, unknown> = {}, userType: "monitored" | "caregiver" = "monitored") {
  const caller = appRouter.createCaller(makeCtx(makeUser(openId, userType)));
  return caller.userData.put({
    alarms: [],
    anamnesis: { fullName: "Vó Maria" },
    dataUpdatedAt: Date.now(),
    ...extra,
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  storedAlarms = [losartana];
  comAcordoAtivo.clear();
  consultaFalha = false;
});

describe("userData.put — diff de alarmes e acordo gerenciado", () => {
  it("com acordo ATIVO o backup é gravado, mas o diff não roda (nada registrado, nenhum push)", async () => {
    comAcordoAtivo.add("maria-1");

    await put("maria-1");
    await flush();

    expect(db.upsertUserData).toHaveBeenCalledTimes(1);
    expect(vi.mocked(db.upsertUserData).mock.calls[0][0]).toMatchObject({ openId: "maria-1", alarms: [] });
    expect(dbChanges.insertAlarmChanges).not.toHaveBeenCalled();
    expect(push.sendExpoPush).not.toHaveBeenCalled();
  });

  it("sem acordo o diff roda como sempre (registra a exclusão e avisa o cuidador)", async () => {
    await put("maria-2");
    await flush();

    expect(dbChanges.insertAlarmChanges).toHaveBeenCalledWith([
      expect.objectContaining({ openId: "maria-2", alarmId: "a1", changeType: "deleted" }),
    ]);
    expect(push.sendExpoPush).toHaveBeenCalledTimes(1);
  });

  it("a consulta é do acordo ATIVO da própria conta (pedido pendente e encerrado não contam)", async () => {
    await put("maria-3");

    expect(dbManagement.getActiveManagementForMonitored).toHaveBeenCalledWith("maria-3");
    expect(dbChanges.insertAlarmChanges).toHaveBeenCalledTimes(1);
  });

  it("acordo ativo de OUTRA conta não silencia o diff desta", async () => {
    comAcordoAtivo.add("joao-1");

    await put("maria-4");

    expect(dbChanges.insertAlarmChanges).toHaveBeenCalledTimes(1);
  });

  it("quando o acordo acaba, o próximo backup volta a registrar", async () => {
    comAcordoAtivo.add("maria-5");
    await put("maria-5");
    expect(dbChanges.insertAlarmChanges).not.toHaveBeenCalled();

    comAcordoAtivo.clear();
    storedAlarms = [losartana];
    await put("maria-5");

    expect(dbChanges.insertAlarmChanges).toHaveBeenCalledTimes(1);
  });

  it("se não der para saber do acordo, o backup é gravado e o diff fica quieto (calar é melhor que acusar)", async () => {
    consultaFalha = true;
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(put("maria-6")).resolves.toEqual({ success: true });
    await flush();

    expect(db.upsertUserData).toHaveBeenCalledTimes(1);
    expect(dbChanges.insertAlarmChanges).not.toHaveBeenCalled();
    expect(push.sendExpoPush).not.toHaveBeenCalled();
  });
});

describe("userData.put — fuso do aparelho", () => {
  it("manda o fuso para o upsert", async () => {
    await put("maria-7", { timezone: "America/Manaus" });

    expect(vi.mocked(db.upsertUserData).mock.calls[0][0]).toMatchObject({ timezone: "America/Manaus" });
  });

  it("null chega como null (apaga) e ausente chega como undefined (preserva)", async () => {
    await put("maria-8", { timezone: null });
    await put("maria-8");

    expect(vi.mocked(db.upsertUserData).mock.calls[0][0].timezone).toBeNull();
    expect(vi.mocked(db.upsertUserData).mock.calls[1][0].timezone).toBeUndefined();
  });

  it("fuso com mais de 64 caracteres é recusado", async () => {
    await expect(put("maria-9", { timezone: "x".repeat(65) })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.upsertUserData).not.toHaveBeenCalled();
  });
});

describe("userData.put — sinal de vida", () => {
  it("o idoso dá sinal", async () => {
    await put("maria-10");

    expect(dbMonitoring.touchLiveness).toHaveBeenCalledWith("maria-10");
  });

  it("o cuidador não dá sinal (não tem dead man's switch)", async () => {
    await put("cuidador-1", {}, "caregiver");

    expect(dbMonitoring.touchLiveness).not.toHaveBeenCalled();
    expect(db.upsertUserData).toHaveBeenCalledTimes(1);
  });
});
