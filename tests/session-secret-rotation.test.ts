/**
 * session-secret-rotation.test.ts
 *
 * Troca do JWT_SECRET sem deslogar ninguém (incidente Railway, out/2026): o
 * segredo antigo (JWT_SECRET_PREVIOUS) ainda verifica sessões até a data em
 * JWT_SECRET_PREVIOUS_UNTIL — tempo para o app abrir e o auth.refresh trocar o
 * token. Sessão nova é sempre assinada com o segredo atual.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../server/db", () => ({
  getUserByOpenId: vi.fn(async () => undefined),
  upsertUser: vi.fn(async () => undefined),
}));

import { sdk } from "../server/_core/sdk";
import { assertRequiredSecrets } from "../server/_core/env";

const ANTIGO = "segredo-antigo-vazado-no-railway-0123456789";
const NOVO = "segredo-novo-depois-do-incidente-0123456789";
const AMANHA = new Date(Date.now() + 86_400_000).toISOString();
const ONTEM = new Date(Date.now() - 86_400_000).toISOString();

async function tokenAssinadoCom(segredo: string) {
  process.env.JWT_SECRET = segredo;
  return sdk.createSessionToken("google:123", { name: "Ana" });
}

beforeEach(() => {
  process.env.VITE_APP_ID = "test-app-id";
  delete process.env.JWT_SECRET_PREVIOUS;
  delete process.env.JWT_SECRET_PREVIOUS_UNTIL;
});

afterEach(() => {
  delete process.env.JWT_SECRET_PREVIOUS;
  delete process.env.JWT_SECRET_PREVIOUS_UNTIL;
});

describe("rotação do JWT_SECRET", () => {
  it("aceita sessão do segredo antigo até a data limite", async () => {
    const antigo = await tokenAssinadoCom(ANTIGO);
    process.env.JWT_SECRET = NOVO;
    process.env.JWT_SECRET_PREVIOUS = ANTIGO;
    process.env.JWT_SECRET_PREVIOUS_UNTIL = AMANHA;
    expect((await sdk.verifySession(antigo))?.openId).toBe("google:123");
  });

  it("recusa sessão do segredo antigo depois da data limite", async () => {
    const antigo = await tokenAssinadoCom(ANTIGO);
    process.env.JWT_SECRET = NOVO;
    process.env.JWT_SECRET_PREVIOUS = ANTIGO;
    process.env.JWT_SECRET_PREVIOUS_UNTIL = ONTEM;
    expect(await sdk.verifySession(antigo)).toBeNull();
  });

  it("nunca aceita o segredo antigo sem data limite", async () => {
    const antigo = await tokenAssinadoCom(ANTIGO);
    process.env.JWT_SECRET = NOVO;
    process.env.JWT_SECRET_PREVIOUS = ANTIGO;
    expect(await sdk.verifySession(antigo)).toBeNull();
  });

  it("sessão nova (inclusive a do auth.refresh) sai assinada com o segredo atual", async () => {
    process.env.JWT_SECRET_PREVIOUS = ANTIGO;
    process.env.JWT_SECRET_PREVIOUS_UNTIL = AMANHA;
    const nova = await tokenAssinadoCom(NOVO);
    delete process.env.JWT_SECRET_PREVIOUS;
    delete process.env.JWT_SECRET_PREVIOUS_UNTIL;
    expect((await sdk.verifySession(nova))?.openId).toBe("google:123");
  });

  it("segredo desconhecido continua recusado", async () => {
    const forjado = await tokenAssinadoCom("outro-segredo-qualquer-0123456789abc");
    process.env.JWT_SECRET = NOVO;
    process.env.JWT_SECRET_PREVIOUS = ANTIGO;
    process.env.JWT_SECRET_PREVIOUS_UNTIL = AMANHA;
    expect(await sdk.verifySession(forjado)).toBeNull();
  });

  it("boot recusa JWT_SECRET_PREVIOUS sem data limite válida (deploy falha, versão anterior segue no ar)", () => {
    const base = { NODE_ENV: "production" as const, JWT_SECRET: NOVO, DATABASE_URL: "mysql://x" };
    expect(() => assertRequiredSecrets({ ...base, JWT_SECRET_PREVIOUS: ANTIGO })).toThrow(/JWT_SECRET_PREVIOUS_UNTIL/);
    expect(() =>
      assertRequiredSecrets({ ...base, JWT_SECRET_PREVIOUS: ANTIGO, JWT_SECRET_PREVIOUS_UNTIL: "amanhã" }),
    ).toThrow(/JWT_SECRET_PREVIOUS_UNTIL/);
    expect(() =>
      assertRequiredSecrets({ ...base, JWT_SECRET_PREVIOUS: ANTIGO, JWT_SECRET_PREVIOUS_UNTIL: AMANHA }),
    ).not.toThrow();
  });
});
