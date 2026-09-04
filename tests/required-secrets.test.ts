/**
 * required-secrets.test.ts
 *
 * Validates the fail-closed boot guard for JWT_SECRET. Previously the secret
 * silently fell back to "" (env.ts / sdk.ts), which would sign AND verify
 * session JWTs with an empty HMAC key — trivial token forgery for any openId.
 * The server must refuse to boot in production rather than run fail-open.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEV_INSECURE_FLAG, assertRequiredSecrets } from "../server/_core/env";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("assertRequiredSecrets", () => {
  it("throws in production when JWT_SECRET is missing", () => {
    expect(() =>
      assertRequiredSecrets({ NODE_ENV: "production" } as NodeJS.ProcessEnv)
    ).toThrow(/JWT_SECRET/);
  });

  it("throws in production when JWT_SECRET is empty", () => {
    expect(() =>
      assertRequiredSecrets({
        NODE_ENV: "production",
        JWT_SECRET: "",
      } as NodeJS.ProcessEnv)
    ).toThrow(/JWT_SECRET/);
  });

  it("passes in production with a strong (>=32 char) JWT_SECRET", () => {
    expect(() =>
      assertRequiredSecrets({
        NODE_ENV: "production",
        JWT_SECRET: "a".repeat(40),
        DATABASE_URL: "mysql://x",
      } as NodeJS.ProcessEnv)
    ).not.toThrow();
  });

  it("warns (does not throw) in production with a short JWT_SECRET", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() =>
      assertRequiredSecrets({
        NODE_ENV: "production",
        JWT_SECRET: "short",
        DATABASE_URL: "mysql://x",
      } as NodeJS.ProcessEnv)
    ).not.toThrow();
    expect(warn).toHaveBeenCalled();
  });

  // --- A decisão é pela PRESENÇA do segredo, não por NODE_ENV ----------------
  // A versão anterior liberava o boot sempre que NODE_ENV !== "production", então
  // "Production", "prod" ou a variável ausente (Start Command customizado no
  // Railway) subiam o servidor com HMAC de chave vazia — forja de token trivial.

  it("throws without a secret even when NODE_ENV is not 'production'", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() =>
      assertRequiredSecrets({ NODE_ENV: "development" } as NodeJS.ProcessEnv)
    ).toThrow(/JWT_SECRET/);
  });

  it.each(["Production", "prod", "PRODUCTION", undefined])(
    "throws without a secret when NODE_ENV is %s",
    (nodeEnv) => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      expect(() =>
        assertRequiredSecrets({ NODE_ENV: nodeEnv } as NodeJS.ProcessEnv)
      ).toThrow(/JWT_SECRET/);
    }
  );

  it("only allows an empty secret with the explicit dev opt-out", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() =>
      assertRequiredSecrets({
        NODE_ENV: "development",
        [DEV_INSECURE_FLAG]: "1",
      } as NodeJS.ProcessEnv)
    ).not.toThrow();
    expect(warn).toHaveBeenCalled();
  });

  it("fills an ephemeral random secret in dev instead of leaving it empty", () => {
    // Chave HMAC vazia assina E verifica qualquer token. E uma constante fixa no
    // código seria o "default que vira segredo real quando ninguém sobrescreve"
    // — por isso o valor é aleatório por execução, não um literal.
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const env = {
      NODE_ENV: "development",
      [DEV_INSECURE_FLAG]: "1",
    } as NodeJS.ProcessEnv;

    assertRequiredSecrets(env);
    const primeiro = env.JWT_SECRET ?? "";
    expect(primeiro.length).toBeGreaterThanOrEqual(32);

    const outro = {
      NODE_ENV: "development",
      [DEV_INSECURE_FLAG]: "1",
    } as NodeJS.ProcessEnv;
    assertRequiredSecrets(outro);
    expect(outro.JWT_SECRET).not.toBe(primeiro);
  });

  it("ignores the dev opt-out in production", () => {
    expect(() =>
      assertRequiredSecrets({
        NODE_ENV: "production",
        [DEV_INSECURE_FLAG]: "1",
      } as NodeJS.ProcessEnv)
    ).toThrow(/JWT_SECRET/);
  });

  // --- DATABASE_URL ----------------------------------------------------------
  // Banco ausente não é falha aberta, mas foi o que desarmou o dead man's
  // switch por 27h sem ninguém notar. Melhor não subir do que subir cego.

  it("throws when DATABASE_URL is missing", () => {
    expect(() =>
      assertRequiredSecrets({
        NODE_ENV: "production",
        JWT_SECRET: "a".repeat(40),
      } as NodeJS.ProcessEnv)
    ).toThrow(/DATABASE_URL/);
  });

  it("allows a missing DATABASE_URL with the explicit dev opt-out", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() =>
      assertRequiredSecrets({
        NODE_ENV: "development",
        JWT_SECRET: "a".repeat(40),
        [DEV_INSECURE_FLAG]: "1",
      } as NodeJS.ProcessEnv)
    ).not.toThrow();
  });
});
