/**
 * required-secrets.test.ts
 *
 * Validates the fail-closed boot guard for JWT_SECRET. Previously the secret
 * silently fell back to "" (env.ts / sdk.ts), which would sign AND verify
 * session JWTs with an empty HMAC key — trivial token forgery for any openId.
 * The server must refuse to boot in production rather than run fail-open.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { assertRequiredSecrets } from "../server/_core/env";

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
      } as NodeJS.ProcessEnv)
    ).not.toThrow();
  });

  it("warns (does not throw) in production with a short JWT_SECRET", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() =>
      assertRequiredSecrets({
        NODE_ENV: "production",
        JWT_SECRET: "short",
      } as NodeJS.ProcessEnv)
    ).not.toThrow();
    expect(warn).toHaveBeenCalled();
  });

  it("never throws in development, even without a secret", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() =>
      assertRequiredSecrets({ NODE_ENV: "development" } as NodeJS.ProcessEnv)
    ).not.toThrow();
  });
});
