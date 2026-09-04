/**
 * keychain-accessibility-migration.test.ts
 *
 * Camada 2 do bug de keychain bloqueado (a camada 1 está em
 * auth-keychain-locked.test.ts). Lá o app parou de APAGAR credencial válida;
 * aqui ele passa a conseguir LER a credencial com o aparelho bloqueado.
 *
 * `expo-secure-store` grava com kSecAttrAccessibleWhenUnlocked por padrão:
 * bloqueado, nem o app lê. `AFTER_FIRST_UNLOCK` mantém o item legível depois
 * do primeiro desbloqueio desde que o aparelho ligou — que é o que o AlarmKit
 * exige, porque dispensar o alarme na lock screen abre o app por trás dela.
 *
 * A pegadinha que obriga o delete: `setItemAsync` sobre uma chave existente
 * cai em `SecItemUpdate`, e o updateDictionary do expo-secure-store leva
 * SOMENTE kSecValueData (ios/SecureStoreModule.swift:125-137). O atributo de
 * acessibilidade NÃO é atualizado. Só passar a opção nova migraria zero
 * instalações existentes, em silêncio — mesma armadilha do patch de
 * expo-speech que nunca chegava ao aparelho.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const getItemAsync = vi.fn();
const setItemAsync = vi.fn(async (_k: string, _v: string, _o?: unknown) => {});
const deleteItemAsync = vi.fn(async (_k: string) => {});

vi.mock("expo-secure-store", () => ({
  getItemAsync: (...a: unknown[]) => getItemAsync(...(a as [string])),
  setItemAsync: (...a: unknown[]) => setItemAsync(...(a as [string, string, unknown])),
  deleteItemAsync: (...a: unknown[]) => deleteItemAsync(...(a as [string])),
  AFTER_FIRST_UNLOCK: "AFTER_FIRST_UNLOCK",
  WHEN_UNLOCKED: "WHEN_UNLOCKED",
}));

let platformOS = "ios";
vi.mock("react-native", () => ({
  get Platform() {
    return { OS: platformOS };
  },
}));

vi.mock("@/constants/oauth", () => ({
  SESSION_TOKEN_KEY: "session_token",
  USER_INFO_KEY: "user_info",
}));

const storage = new Map<string, string>();
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (k: string) => storage.get(k) ?? null,
    setItem: async (k: string, v: string) => void storage.set(k, v),
  },
}));

async function freshAuth() {
  vi.resetModules();
  return import("../lib/_core/auth");
}

const AFU = { keychainAccessible: "AFTER_FIRST_UNLOCK" };

beforeEach(() => {
  getItemAsync.mockReset();
  setItemAsync.mockReset();
  deleteItemAsync.mockReset();
  storage.clear();
  platformOS = "ios";
});

describe("migração de acessibilidade do keychain", () => {
  it("regrava com AFTER_FIRST_UNLOCK apagando antes (update não troca o atributo)", async () => {
    getItemAsync.mockImplementation(async (k: string) =>
      k === "session_token" ? "jwt-antigo" : '{"openId":"u-1"}',
    );
    const Auth = await freshAuth();

    await Auth.migrateKeychainAccessibility();

    expect(deleteItemAsync).toHaveBeenCalledWith("session_token");
    expect(deleteItemAsync).toHaveBeenCalledWith("user_info");
    expect(setItemAsync).toHaveBeenCalledWith("session_token", "jwt-antigo", AFU);
    expect(setItemAsync).toHaveBeenCalledWith("user_info", '{"openId":"u-1"}', AFU);
  });

  it("NÃO mexe em nada com o keychain bloqueado, e tenta de novo no próximo boot", async () => {
    getItemAsync.mockRejectedValue(new Error("User interaction is not allowed."));
    const Auth = await freshAuth();

    await Auth.migrateKeychainAccessibility();

    expect(deleteItemAsync).not.toHaveBeenCalled();
    expect(setItemAsync).not.toHaveBeenCalled();

    // Segundo boot, agora desbloqueado: a migração precisa acontecer.
    getItemAsync.mockImplementation(async (k: string) =>
      k === "session_token" ? "jwt-antigo" : null,
    );
    const Auth2 = await freshAuth();
    await Auth2.migrateKeychainAccessibility();

    expect(setItemAsync).toHaveBeenCalledWith("session_token", "jwt-antigo", AFU);
  });

  it("não repete a migração em boots seguintes", async () => {
    getItemAsync.mockResolvedValue("jwt-antigo");
    const Auth = await freshAuth();
    await Auth.migrateKeychainAccessibility();
    setItemAsync.mockClear();
    deleteItemAsync.mockClear();

    const Auth2 = await freshAuth();
    await Auth2.migrateKeychainAccessibility();

    expect(deleteItemAsync).not.toHaveBeenCalled();
    expect(setItemAsync).not.toHaveBeenCalled();
  });

  it("tenta regravar de novo se a primeira regravação falhar (senão o usuário perde a sessão)", async () => {
    getItemAsync.mockImplementation(async (k: string) =>
      k === "session_token" ? "jwt-antigo" : null,
    );
    setItemAsync.mockRejectedValueOnce(new Error("keychain busy"));
    const Auth = await freshAuth();

    await Auth.migrateKeychainAccessibility();

    const tokenWrites = setItemAsync.mock.calls.filter((c) => c[0] === "session_token");
    expect(tokenWrites.length).toBe(2);
    expect(tokenWrites[1]).toEqual(["session_token", "jwt-antigo", AFU]);
  });

  it("é no-op no Android (EncryptedSharedPreferences não tem acessibilidade)", async () => {
    platformOS = "android";
    getItemAsync.mockResolvedValue("jwt-antigo");
    const Auth = await freshAuth();

    await Auth.migrateKeychainAccessibility();

    expect(deleteItemAsync).not.toHaveBeenCalled();
    expect(setItemAsync).not.toHaveBeenCalled();
  });
});

describe("gravações novas já nascem com AFTER_FIRST_UNLOCK", () => {
  it("setSessionToken grava com a opção", async () => {
    const Auth = await freshAuth();
    await Auth.setSessionToken("jwt-novo");
    expect(setItemAsync).toHaveBeenCalledWith("session_token", "jwt-novo", AFU);
  });

  it("setUserInfo grava com a opção", async () => {
    const Auth = await freshAuth();
    await Auth.setUserInfo({ openId: "u-1", userType: "monitored" } as never);
    expect(setItemAsync).toHaveBeenCalledWith("user_info", expect.any(String), AFU);
  });
});
