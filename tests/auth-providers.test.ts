import { beforeEach, describe, expect, it, vi } from "vitest";

// db-auth/email-auth/phone-auth importam "./db" (pool MySQL). Mock para os
// caminhos sem banco — a lógica pura (hash, normalização, formatos) não
// depende de conexão.
vi.mock("../server/db", () => ({
  getDb: vi.fn(async () => null),
  getUserByOpenId: vi.fn(async () => undefined),
  upsertUser: vi.fn(async () => {}),
}));

import { hashPassword, verifyPassword } from "../server/email-auth";
import { normalizeBrPhone } from "../server/phone-auth";
import {
  generateCode,
  hashCode,
  normalizeEmail,
  putAuthCode,
  resolveAccount,
} from "../server/db-auth";

describe("password hashing (scrypt)", () => {
  it("verifies the original password and rejects a wrong one", async () => {
    const stored = await hashPassword("senha-correta-123");
    expect(stored.startsWith("scrypt:")).toBe(true);
    expect(await verifyPassword("senha-correta-123", stored)).toBe(true);
    expect(await verifyPassword("senha-errada-123", stored)).toBe(false);
  });

  it("produces unique salts (same password, different hashes)", async () => {
    const a = await hashPassword("mesma-senha");
    const b = await hashPassword("mesma-senha");
    expect(a).not.toBe(b);
    expect(await verifyPassword("mesma-senha", a)).toBe(true);
    expect(await verifyPassword("mesma-senha", b)).toBe(true);
  });

  it("rejects malformed or tampered stored hashes without throwing", async () => {
    expect(await verifyPassword("x", "")).toBe(false);
    expect(await verifyPassword("x", "bcrypt:algo")).toBe(false);
    expect(await verifyPassword("x", "scrypt:16384:8:1:zz:zz")).toBe(false);
    expect(await verifyPassword("x", "scrypt:16384:8:1:abcd")).toBe(false);
    const valid = await hashPassword("x");
    const parts = valid.split(":");
    // troca o último byte do hash
    const tampered = [...parts.slice(0, 5), parts[5].slice(0, -2) + (parts[5].endsWith("00") ? "11" : "00")].join(":");
    expect(await verifyPassword("x", tampered)).toBe(false);
  });
});

describe("normalizeBrPhone", () => {
  it("accepts common BR formats and normalizes to digits with DDI", () => {
    expect(normalizeBrPhone("(51) 99999-9999")).toBe("5551999999999");
    expect(normalizeBrPhone("51999999999")).toBe("5551999999999");
    expect(normalizeBrPhone("+55 51 99999-9999")).toBe("5551999999999");
    expect(normalizeBrPhone("5551999999999")).toBe("5551999999999");
    // fixo (10 dígitos)
    expect(normalizeBrPhone("(51) 3333-4444")).toBe("555133334444");
  });

  it("does not double-prefix a +55 number (no 5555…)", () => {
    expect(normalizeBrPhone("+5551999999999")).toBe("5551999999999");
    expect(normalizeBrPhone("+55 (51) 99999-9999")).toBe("5551999999999");
    // "+55" com contagem implausível não vira um número errado
    expect(normalizeBrPhone("+55 123")).toBeNull();
  });

  it("handles a national number in DDD 55 without mangling", () => {
    // DDD 55 (Santa Maria/RS), celular nacional sem DDI → 55 + 55 + número
    expect(normalizeBrPhone("(55) 99999-9999")).toBe("5555999999999");
  });

  it("rejects numbers that are not plausible BR phones", () => {
    expect(normalizeBrPhone("123")).toBeNull();
    expect(normalizeBrPhone("999999999")).toBeNull(); // 9 dígitos, sem DDD
    expect(normalizeBrPhone("1 555 123 4567 890")).toBeNull();
    expect(normalizeBrPhone("")).toBeNull();
  });
});

describe("auth codes", () => {
  it("generateCode returns 6 digits (zero-padded)", () => {
    for (let i = 0; i < 200; i++) {
      expect(generateCode()).toMatch(/^\d{6}$/);
    }
  });

  it("hashCode binds the code to the target", () => {
    expect(hashCode("a@b.com", "123456")).toBe(hashCode("a@b.com", "123456"));
    expect(hashCode("a@b.com", "123456")).not.toBe(hashCode("x@y.com", "123456"));
    expect(hashCode("a@b.com", "123456")).not.toBe(hashCode("a@b.com", "654321"));
  });

  it("putAuthCode requires the database", async () => {
    await expect(putAuthCode("signup", "a@b.com", "123456")).rejects.toThrow(
      "DATABASE_UNAVAILABLE"
    );
  });
});

describe("normalizeEmail", () => {
  it("lowercases and trims", () => {
    expect(normalizeEmail("  Fulano@Exemplo.COM ")).toBe("fulano@exemplo.com");
  });
});

describe("resolveAccount sem banco (fallback degradado)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("mantém o formato legado provider:sub para OAuth", async () => {
    const google = await resolveAccount({ provider: "google", subject: "12345" });
    expect(google.openId).toBe("google:12345");
    const apple = await resolveAccount({ provider: "apple", subject: "001234.abc" });
    expect(apple.openId).toBe("apple:001234.abc");
  });

  it("gera openId aleatório (sem PII) para contas de e-mail", async () => {
    const a = await resolveAccount({ provider: "email", subject: "a@b.com" });
    expect(a.openId).toMatch(/^email:[0-9a-f]{32}$/);
    expect(a.openId).not.toContain("a@b.com");
  });
});
