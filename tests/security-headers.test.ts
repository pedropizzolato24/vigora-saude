/**
 * security-headers.test.ts
 *
 * Validates that the middleware emits the expected security headers
 * on every response. These headers were entirely missing from the
 * original server — combined with SameSite=none cookies, the lack of
 * X-Frame-Options enabled clickjacking and no HSTS allowed downgrade
 * attacks.
 */
import { describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { securityHeadersMiddleware } from "../server/_core/security-headers";

function makeRes() {
  const headers: Record<string, string> = {};
  const res = {
    setHeader: vi.fn((name: string, val: string) => {
      headers[name] = val;
    }),
  };
  return { res: res as unknown as Response, headers };
}

describe("securityHeadersMiddleware", () => {
  it("sets X-Content-Type-Options: nosniff", () => {
    const { res, headers } = makeRes();
    const next = vi.fn();
    securityHeadersMiddleware({} as Request, res, next);
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("sets X-Frame-Options: DENY (anti-clickjacking)", () => {
    const { res, headers } = makeRes();
    securityHeadersMiddleware({} as Request, res, vi.fn());
    expect(headers["X-Frame-Options"]).toBe("DENY");
  });

  it("sets a strict Referrer-Policy", () => {
    const { res, headers } = makeRes();
    securityHeadersMiddleware({} as Request, res, vi.fn());
    expect(headers["Referrer-Policy"]).toBe(
      "strict-origin-when-cross-origin"
    );
  });

  it("sets HSTS with at least 6 months max-age and includeSubDomains", () => {
    const { res, headers } = makeRes();
    securityHeadersMiddleware({} as Request, res, vi.fn());
    const hsts = headers["Strict-Transport-Security"];
    expect(hsts).toBeDefined();
    const m = hsts.match(/max-age=(\d+)/);
    expect(m).not.toBeNull();
    const maxAge = Number(m![1]);
    const SIX_MONTHS = 60 * 60 * 24 * 180;
    expect(maxAge).toBeGreaterThanOrEqual(SIX_MONTHS);
    expect(hsts).toMatch(/includeSubDomains/);
  });

  it("sets a Permissions-Policy that disables sensitive APIs", () => {
    const { res, headers } = makeRes();
    securityHeadersMiddleware({} as Request, res, vi.fn());
    const pp = headers["Permissions-Policy"];
    expect(pp).toBeDefined();
    expect(pp).toMatch(/camera=\(\)/);
    expect(pp).toMatch(/microphone=\(\)/);
    expect(pp).toMatch(/geolocation=\(\)/);
  });

  it("sets Cross-Origin-Opener-Policy and Cross-Origin-Resource-Policy", () => {
    const { res, headers } = makeRes();
    securityHeadersMiddleware({} as Request, res, vi.fn());
    expect(headers["Cross-Origin-Opener-Policy"]).toBe("same-origin");
    expect(headers["Cross-Origin-Resource-Policy"]).toBe("same-site");
  });

  it("sets a restrictive Content-Security-Policy", () => {
    const { res, headers } = makeRes();
    securityHeadersMiddleware({} as Request, res, vi.fn());
    const csp = headers["Content-Security-Policy"];
    expect(csp).toBeDefined();
    expect(csp).toMatch(/default-src 'none'/);
    expect(csp).toMatch(/frame-ancestors 'none'/);
  });

  it("calls next() exactly once", () => {
    const { res } = makeRes();
    const next = vi.fn();
    securityHeadersMiddleware({} as Request, res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
