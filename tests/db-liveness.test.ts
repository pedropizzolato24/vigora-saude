/**
 * db-liveness.test.ts
 *
 * touchLiveness e recordHeartbeat: qualquer sinal do aparelho renova o
 * `lastSeenAt` e RETOMA uma conta pausada (spec 5.5). touchLiveness nunca lança.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

interface Gravacao {
  values: Record<string, unknown>;
  set: Record<string, unknown>;
}
let gravacoes: Gravacao[] = [];
let falharAoGravar = false;

const fakeDb = {
  insert: () => ({
    values: (values: Record<string, unknown>) => ({
      onDuplicateKeyUpdate: ({ set }: { set: Record<string, unknown> }) => {
        if (falharAoGravar) return Promise.reject(Object.assign(new Error("parametros secretos: maria-1"), { code: "ECONNRESET" }));
        gravacoes.push({ values, set });
        return Promise.resolve();
      },
    }),
  }),
};

const getDb = vi.fn(async (): Promise<unknown> => fakeDb);
vi.mock("../server/db", () => ({ getDb: () => getDb() }));

import { recordHeartbeat, touchLiveness } from "../server/db-monitoring";

const PAUSA_LIMPA = { dmsPausedReason: null, dmsPausedAt: null, pauseNoticeSentAt: null };

beforeEach(() => {
  vi.restoreAllMocks();
  gravacoes = [];
  falharAoGravar = false;
  getDb.mockReset();
  getDb.mockImplementation(async () => fakeDb);
});

describe("touchLiveness", () => {
  it("renova o lastSeenAt e limpa a pausa (retoma a conta)", async () => {
    const antes = Date.now();
    await touchLiveness("maria-1");

    expect(gravacoes).toHaveLength(1);
    expect(gravacoes[0].values).toMatchObject({ openId: "maria-1" });
    expect(gravacoes[0].set).toMatchObject(PAUSA_LIMPA);
    const visto = gravacoes[0].set.lastSeenAt as Date;
    expect(visto).toBeInstanceOf(Date);
    expect(visto.getTime()).toBeGreaterThanOrEqual(antes);
  });

  it("conta sem linha de liveness nasce com lastSeenAt agora", async () => {
    await touchLiveness("maria-2");

    expect(gravacoes[0].values.lastSeenAt).toBeInstanceOf(Date);
  });

  it("não mexe em localização, aparelho nem versão (só o sinal e a pausa)", async () => {
    await touchLiveness("maria-3");

    expect(Object.keys(gravacoes[0].set).sort()).toEqual(
      ["dmsPausedAt", "dmsPausedReason", "lastSeenAt", "pauseNoticeSentAt"].sort()
    );
  });

  it("sem banco não faz nada e não lança", async () => {
    getDb.mockImplementation(async () => null);
    await expect(touchLiveness("maria-4")).resolves.toBeUndefined();
    expect(gravacoes).toHaveLength(0);
  });

  it("erro de banco não lança e o log não traz a mensagem do erro (tem parâmetros da query)", async () => {
    falharAoGravar = true;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(touchLiveness("maria-5")).resolves.toBeUndefined();

    const logado = JSON.stringify(warn.mock.calls);
    expect(logado).toContain("ECONNRESET");
    expect(logado).not.toContain("maria-1");
    expect(logado).not.toContain("parametros secretos");
  });
});

describe("recordHeartbeat — retoma a conta pausada", () => {
  it("o heartbeat também limpa a pausa", async () => {
    await recordHeartbeat("maria-6", { appVersion: "1.2.3", lastDeviceId: "dev-1" });

    expect(gravacoes[0].set).toMatchObject({ appVersion: "1.2.3", lastDeviceId: "dev-1", ...PAUSA_LIMPA });
  });

  it("sem coordenada nova, o último fix conhecido é preservado (não entra no set)", async () => {
    await recordHeartbeat("maria-7");

    expect(gravacoes[0].set).not.toHaveProperty("lastLocation");
    expect(gravacoes[0].set).toMatchObject(PAUSA_LIMPA);
  });
});
