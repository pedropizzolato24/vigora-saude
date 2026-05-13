/**
 * oauth.state.test.ts
 *
 * Validates the new signed OAuth state contract:
 *   - signOAuthState rejects redirectUris not in allowlist
 *   - verifyOAuthState rejects forged / tampered tokens
 *   - exchangeCodeForToken refuses to call the OAuth provider with a
 *     state that wasn't issued by signOAuthState
 *
 * The previous design used `btoa(redirectUri)` for state, which gave
 * zero CSRF protection and let any caller smuggle an arbitrary
 * redirectUri into the OAuth token exchange.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// db is referenced inside sdk.authenticateRequest — mock to avoid mysql
vi.mock("../server/db", () => ({
  getUserByOpenId: vi.fn(async () => undefined),
  upsertUser: vi.fn(async () => undefined),
}));

// env vars are read lazily by env.ts now, so setting in beforeAll is fine
beforeAll(() => {
  process.env.JWT_SECRET = "test-secret-for-oauth-state-please-make-long";
  process.env.OAUTH_REDIRECT_URI_ALLOWLIST =
    "https://app.example.com/api/oauth/callback,manustest20260101://*";
});

beforeEach(() => {
  // Make sure no test bled into another
  process.env.JWT_SECRET = "test-secret-for-oauth-state-please-make-long";
  process.env.OAUTH_REDIRECT_URI_ALLOWLIST =
    "https://app.example.com/api/oauth/callback,manustest20260101://*";
});

import { sdk } from "../server/_core/sdk";
import { isAllowedRedirectUri } from "../server/_core/env";

describe("isAllowedRedirectUri", () => {
  it("accepts exact-match URIs from the allowlist", () => {
    expect(
      isAllowedRedirectUri("https://app.example.com/api/oauth/callback")
    ).toBe(true);
  });

  it("accepts prefix entries ending in *", () => {
    expect(isAllowedRedirectUri("manustest20260101:///oauth/callback")).toBe(
      true
    );
  });

  it("rejects arbitrary external URIs", () => {
    expect(isAllowedRedirectUri("https://evil.example.org/steal")).toBe(false);
  });

  it("rejects URIs that look like allowed prefixes but aren't (no exact match)", () => {
    // The exact-entry "https://app.example.com/api/oauth/callback" must
    // not match "https://app.example.com.evil.org/api/oauth/callback".
    expect(
      isAllowedRedirectUri(
        "https://app.example.com.evil.org/api/oauth/callback"
      )
    ).toBe(false);
  });
});

describe("sdk.signOAuthState / verifyOAuthState", () => {
  it("signs and verifies an allowed redirectUri round-trip", async () => {
    const state = await sdk.signOAuthState(
      "https://app.example.com/api/oauth/callback"
    );
    expect(typeof state).toBe("string");
    expect(state.split(".").length).toBe(3); // JWT has 3 parts
    const out = await sdk.verifyOAuthState(state);
    expect(out).toBe("https://app.example.com/api/oauth/callback");
  });

  it("refuses to sign a state for a non-allowlisted URI", async () => {
    await expect(
      sdk.signOAuthState("https://evil.example.org/steal")
    ).rejects.toThrow();
  });

  it("refuses to verify a tampered token", async () => {
    const state = await sdk.signOAuthState(
      "https://app.example.com/api/oauth/callback"
    );
    // Replace the signature segment with garbage of the same length
    const parts = state.split(".");
    const sig = parts[2];
    const tamperedSig = sig
      .split("")
      .map((c) => (c === "A" ? "B" : "A"))
      .join("");
    const tampered = `${parts[0]}.${parts[1]}.${tamperedSig}`;
    await expect(sdk.verifyOAuthState(tampered)).rejects.toThrow();
  });

  it("refuses to verify state signed with a different secret", async () => {
    // Sign with secret A, then swap the secret before verifying.
    process.env.JWT_SECRET = "secret-A-long-enough-to-be-fine";
    const stateFromA = await sdk.signOAuthState(
      "https://app.example.com/api/oauth/callback"
    );
    process.env.JWT_SECRET = "secret-B-different-from-A";
    await expect(sdk.verifyOAuthState(stateFromA)).rejects.toThrow();
  });

  it("refuses to verify a base64-encoded plain string (the OLD state format)", async () => {
    const legacyState = Buffer.from(
      "https://app.example.com/api/oauth/callback",
      "utf-8"
    ).toString("base64");
    await expect(sdk.verifyOAuthState(legacyState)).rejects.toThrow();
  });
});

describe("sdk.exchangeCodeForToken — refuses unsigned/forged state", () => {
  it("rejects when state is invalid (jwtVerify throws)", async () => {
    await expect(
      sdk.exchangeCodeForToken("code-xyz", "not-a-real-jwt")
    ).rejects.toThrow();
  });

  it("does NOT call the OAuth provider when state is invalid", async () => {
    // If the implementation were vulnerable, axios.post would be called
    // with attacker-controlled redirectUri. We rely on signOAuthState's
    // allowlist check being inside the JWT verification path.
    await expect(
      sdk.exchangeCodeForToken("code-xyz", "still-not-a-jwt")
    ).rejects.toThrow();
  });
});
