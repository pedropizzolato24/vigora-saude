// tests/google-auth.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mocks declared BEFORE importing the module under test
vi.mock("../server/db", () => ({
  // Sem banco, resolveAccount (db-auth) degrada para o openId legado
  // `google:<sub>` — o formato que estas asserções cobrem.
  getDb: vi.fn().mockResolvedValue(null),
  upsertUser: vi.fn().mockResolvedValue(undefined),
  getUserByOpenId: vi.fn().mockResolvedValue({
    id: 1,
    openId: "google:abc123",
    name: "Test User",
    email: "test@example.com",
    phone: null,
    userType: null,
    birthDate: null,
    bloodType: null,
    loginMethod: "google",
    lastSignedIn: new Date("2026-01-01"),
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    role: "user",
  }),
}));

vi.mock("../server/_core/sdk", () => ({
  sdk: {
    signSession: vi.fn().mockResolvedValue("mock-session-token"),
  },
}));

import { handleGoogleAuth, verifyGoogleIdToken } from "../server/google-auth";
import { upsertUser } from "../server/db";

// aud precisa ser um client id conhecido do Vigora (verifyGoogleIdToken o valida).
const MOCK_TOKEN_INFO = {
  sub: "abc123",
  email: "test@example.com",
  email_verified: "true",
  name: "Test User",
  aud: "39705729598-q49ldjevjp58hg9tvre49tphuo076s08.apps.googleusercontent.com",
  iss: "accounts.google.com",
  exp: String(Math.floor(Date.now() / 1000) + 3600),
};

describe("verifyGoogleIdToken", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("retorna payload quando Google responde 200", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(MOCK_TOKEN_INFO), { status: 200 })
    );

    const result = await verifyGoogleIdToken("valid-token");

    expect(result.sub).toBe("abc123");
    expect(result.email).toBe("test@example.com");
    expect(result.name).toBe("Test User");
  });

  it("lança INVALID_TOKEN quando Google responde com status não-200", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "invalid_token" }), { status: 400 })
    );

    await expect(verifyGoogleIdToken("bad-token")).rejects.toThrow(
      "INVALID_TOKEN"
    );
  });

  it("lança INVALID_TOKEN quando o aud não é um client id do Vigora", async () => {
    // Token Google legítimo, mas emitido para OUTRO app (replay attack).
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ...MOCK_TOKEN_INFO,
          aud: "999-evil.apps.googleusercontent.com",
        }),
        { status: 200 }
      )
    );

    await expect(verifyGoogleIdToken("replayed-token")).rejects.toThrow(
      "INVALID_TOKEN"
    );
  });

  it("chama o endpoint correto do Google", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(MOCK_TOKEN_INFO), { status: 200 })
    );

    await verifyGoogleIdToken("my-token");

    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      expect.stringContaining("oauth2.googleapis.com/tokeninfo?id_token=my-token")
    );
  });
});

describe("handleGoogleAuth", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(MOCK_TOKEN_INFO), { status: 200 })
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("retorna sessionToken e user em caso de sucesso", async () => {
    const result = await handleGoogleAuth("valid-id-token");

    expect(result.sessionToken).toBe("mock-session-token");
    expect(result.user.openId).toBe("google:abc123");
    expect(result.user.email).toBe("test@example.com");
    expect(result.user.loginMethod).toBe("google");
  });

  it("faz upsert com openId prefixado com 'google:'", async () => {
    await handleGoogleAuth("valid-id-token");

    expect(vi.mocked(upsertUser)).toHaveBeenCalledWith(
      expect.objectContaining({
        openId: "google:abc123",
        loginMethod: "google",
      })
    );
  });

  it("propaga INVALID_TOKEN quando Google recusa o token", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "invalid_token" }), { status: 400 })
    );

    await expect(handleGoogleAuth("bad-token")).rejects.toThrow("INVALID_TOKEN");
  });
});
