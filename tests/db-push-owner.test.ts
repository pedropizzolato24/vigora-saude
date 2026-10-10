/**
 * db-push-owner.test.ts
 *
 * getPushTokensWithOwner (qual conta é dona de cada token — o ping diário
 * precisa saber de quem foi o token que morreu) e countPushTokens (conta sem
 * nenhum token depois de um DeviceNotRegistered = app removido).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

let rows: unknown[] = [];
let selectCalls = 0;

const fakeDb = {
  select: () => {
    selectCalls++;
    const chain: any = {
      from: () => chain,
      where: () => Promise.resolve(rows),
    };
    return chain;
  },
};

const getDb = vi.fn(async (): Promise<unknown> => fakeDb);
vi.mock("../server/db", () => ({ getDb: () => getDb() }));

import { countPushTokens, getPushTokensWithOwner } from "../server/db-push";

beforeEach(() => {
  rows = [];
  selectCalls = 0;
  getDb.mockReset();
  getDb.mockImplementation(async () => fakeDb);
});

describe("getPushTokensWithOwner", () => {
  it("lista vazia de contas não consulta o banco", async () => {
    await expect(getPushTokensWithOwner([])).resolves.toEqual([]);
    expect(selectCalls).toBe(0);
  });

  it("devolve token e dono de cada linha", async () => {
    rows = [
      { token: "ExpoTok[a]", openId: "maria" },
      { token: "ExpoTok[b]", openId: "joao" },
    ];
    await expect(getPushTokensWithOwner(["maria", "joao"])).resolves.toEqual(rows);
  });

  it("sem banco devolve vazio", async () => {
    getDb.mockImplementation(async () => null);
    await expect(getPushTokensWithOwner(["maria"])).resolves.toEqual([]);
  });
});

describe("countPushTokens", () => {
  it("devolve o total de tokens da conta", async () => {
    rows = [{ n: 2 }];
    await expect(countPushTokens("maria")).resolves.toBe(2);
  });

  it("conta sem linhas devolve 0", async () => {
    rows = [];
    await expect(countPushTokens("maria")).resolves.toBe(0);
  });

  it("sem banco devolve 0", async () => {
    getDb.mockImplementation(async () => null);
    await expect(countPushTokens("maria")).resolves.toBe(0);
  });
});
