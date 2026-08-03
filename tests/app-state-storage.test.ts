/**
 * app-state-storage.test.ts
 *
 * Regressão do vazamento entre contas pelo blob legado.
 *
 * `appStateKeyFor(null)` devolvia a chave legada global (`vigora_app_state`),
 * então o app DESLOGADO lia e escrevia nesse blob. Duas consequências:
 *
 * 1. Alarmes carregavam num aparelho sem conta e eram reagendados.
 * 2. O blob escrito enquanto deslogado era ADOTADO pela próxima conta que
 *    logasse no aparelho (a migração adota o legado quando a conta ainda não
 *    tem blob próprio) — dados locais vazando de uma conta para outra.
 *
 * A migração do legado continua valendo para quem tem conta: é ela que
 * preserva os dados de quem atualizou o app vindo da versão pré-refactor.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async (k: string) => store.get(k) ?? null),
    setItem: vi.fn(async (k: string, v: string) => {
      store.set(k, v);
    }),
    removeItem: vi.fn(async (k: string) => {
      store.delete(k);
    }),
  },
}));

vi.mock("@/lib/_core/auth", () => ({
  getUserInfo: vi.fn(async () => null),
}));

import { appStateKeyFor, loadAppStateRaw } from "../lib/app-state-storage";

const LEGACY_KEY = "vigora_app_state";

beforeEach(() => {
  store.clear();
});

describe("appStateKeyFor", () => {
  it("dá uma chave por conta quando há conta", () => {
    expect(appStateKeyFor("abc123")).toBe(`${LEGACY_KEY}:abc123`);
  });

  it("não dá chave nenhuma quando não há conta", () => {
    // Deslogado não tem blob: nem lê nem escreve.
    expect(appStateKeyFor(null)).toBeNull();
    expect(appStateKeyFor(undefined)).toBeNull();
  });
});

describe("loadAppStateRaw", () => {
  it("devolve null quando não há conta, mesmo com blob legado presente", async () => {
    store.set(LEGACY_KEY, JSON.stringify({ alarms: [{ id: "a1", enabled: true }] }));

    expect(await loadAppStateRaw(null)).toBeNull();
    // E não pode consumir o legado: ele ainda pertence à próxima conta que logar.
    expect(store.get(LEGACY_KEY)).toBeTruthy();
  });

  it("lê o blob da conta quando ele existe", async () => {
    store.set(`${LEGACY_KEY}:abc123`, '{"ok":true}');

    expect(await loadAppStateRaw("abc123")).toBe('{"ok":true}');
  });

  it("adota o blob legado na primeira conta que carregar (migração preservada)", async () => {
    store.set(LEGACY_KEY, '{"legado":true}');

    expect(await loadAppStateRaw("abc123")).toBe('{"legado":true}');
    // Adotado sob a chave da conta e removido da chave antiga.
    expect(store.get(`${LEGACY_KEY}:abc123`)).toBe('{"legado":true}');
    expect(store.has(LEGACY_KEY)).toBe(false);
  });
});
