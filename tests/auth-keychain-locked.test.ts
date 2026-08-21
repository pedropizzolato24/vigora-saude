/**
 * auth-keychain-locked.test.ts
 *
 * O iPhone apagou a sessão do usuário sozinho durante o spike do AlarmKit, e a
 * causa não é o AlarmKit — é esta cadeia, que já existia em produção:
 *
 *  1. O app abre com o aparelho AINDA BLOQUEADO (dispensar o alarme na lock
 *     screen lança o app por trás dela).
 *  2. `expo-secure-store` grava com kSecAttrAccessibleWhenUnlocked: com o
 *     aparelho bloqueado a leitura FALHA (errSecInteractionNotAllowed).
 *  3. `getSessionToken()` engolia o erro e devolvia null — indistinguível de
 *     "não tem conta". As chamadas de startup saíam sem token → 401.
 *  4. O 401 chama `handleUnauthorized()`, que relê token+user para decidir. Se
 *     o usuário desbloqueia nesse meio-tempo, a releitura AGORA funciona, a
 *     guarda de "instalação virgem" não pega, e ele APAGA credencial válida.
 *
 * Confirmado no aparelho (13/08/2026): das três rodadas do spike, as duas com
 * a tela bloqueada deslogaram; a única com a tela desbloqueada não deslogou.
 *
 * A regra que estes testes travam: falha TÉCNICA de leitura nunca pode ser
 * lida como "não tem sessão". Na dúvida, não apaga.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const getItemAsync = vi.fn();
const deleteItemAsync = vi.fn(async (_key: string) => {});

vi.mock("expo-secure-store", () => ({
  getItemAsync: (...args: unknown[]) => getItemAsync(...(args as [string])),
  setItemAsync: vi.fn(async () => {}),
  deleteItemAsync: (...args: unknown[]) => deleteItemAsync(...(args as [string])),
  AFTER_FIRST_UNLOCK: "AFTER_FIRST_UNLOCK",
}));

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: { getItem: async () => null, setItem: async () => {} },
}));

vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
}));

vi.mock("@/constants/oauth", () => ({
  SESSION_TOKEN_KEY: "session_token",
  USER_INFO_KEY: "user_info",
}));

const USER_JSON = JSON.stringify({ openId: "u-1", name: "Vovó" });

// handleUnauthorized guarda estado de módulo (anti-rajada), então cada caso
// precisa de uma instância limpa.
async function freshAuth() {
  vi.resetModules();
  return import("../lib/_core/auth");
}

beforeEach(() => {
  getItemAsync.mockReset();
  deleteItemAsync.mockReset();
});

describe("handleUnauthorized — keychain indisponível", () => {
  it("NÃO apaga a credencial quando a leitura do keychain falha", async () => {
    getItemAsync.mockRejectedValue(
      Object.assign(new Error("User interaction is not allowed."), { code: "E_SECURESTORE_ERROR" }),
    );
    const Auth = await freshAuth();
    const expired = vi.fn();
    Auth.subscribeSessionExpired(expired);

    await Auth.handleUnauthorized();

    expect(deleteItemAsync).not.toHaveBeenCalled();
    expect(expired).not.toHaveBeenCalled();
  });

  it("NÃO apaga quando só a leitura do token falha e o user info responde", async () => {
    // O caso real do aparelho: leituras em momentos diferentes do desbloqueio.
    getItemAsync.mockImplementation(async (key: string) => {
      if (key === "session_token") throw new Error("User interaction is not allowed.");
      return USER_JSON;
    });
    const Auth = await freshAuth();
    const expired = vi.fn();
    Auth.subscribeSessionExpired(expired);

    await Auth.handleUnauthorized();

    expect(deleteItemAsync).not.toHaveBeenCalled();
    expect(expired).not.toHaveBeenCalled();
  });

  it("continua apagando quando a sessão existe e o servidor a rejeitou", async () => {
    getItemAsync.mockImplementation(async (key: string) =>
      key === "session_token" ? "jwt-valido" : USER_JSON,
    );
    const Auth = await freshAuth();
    const expired = vi.fn();
    Auth.subscribeSessionExpired(expired);

    await Auth.handleUnauthorized();

    expect(deleteItemAsync).toHaveBeenCalledWith("session_token");
    expect(deleteItemAsync).toHaveBeenCalledWith("user_info");
    expect(expired).toHaveBeenCalledTimes(1);
  });

  it("segue no-op na instalação virgem (sem token e sem user)", async () => {
    getItemAsync.mockResolvedValue(null);
    const Auth = await freshAuth();
    const expired = vi.fn();
    Auth.subscribeSessionExpired(expired);

    await Auth.handleUnauthorized();

    expect(deleteItemAsync).not.toHaveBeenCalled();
    expect(expired).not.toHaveBeenCalled();
  });
});
