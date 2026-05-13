/**
 * cors.test.ts
 *
 * Validates the CORS middleware:
 *   - Reflects only allowlisted origins
 *   - Never echoes arbitrary origins with credentials
 *   - Rejects preflight from disallowed origins
 *   - Skips CORS headers cleanly for same-origin / non-browser callers
 *
 * The previous implementation reflected ANY Origin alongside
 * `Allow-Credentials: true`, which let any malicious site issue
 * authenticated requests on behalf of the logged-in user.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

beforeEach(() => {
  // Prefix entries must end in '*' (literal trailing wildcard marker).
  // The middleware treats them as `startsWith` matches.
  process.env.CORS_ORIGIN_ALLOWLIST =
    "https://app.example.com,https://staging.*";
});

import { corsMiddleware } from "../server/_core/cors";

function makeReq(opts: { origin?: string; method?: string } = {}): Request {
  return {
    headers: opts.origin ? { origin: opts.origin } : {},
    method: opts.method ?? "GET",
  } as unknown as Request;
}

function makeRes() {
  const headers: Record<string, string> = {};
  const res = {
    statusCode: 200,
    headersSent: false,
    header: vi.fn((name: string, val: string) => {
      headers[name] = val;
      return res;
    }),
    status: vi.fn((code: number) => {
      res.statusCode = code;
      return res;
    }),
    sendStatus: vi.fn((code: number) => {
      res.statusCode = code;
      res.headersSent = true;
      return res;
    }),
    end: vi.fn(() => {
      res.headersSent = true;
      return res;
    }),
  };
  return { res: res as unknown as Response, headers, _res: res };
}

describe("corsMiddleware — origin allowlist", () => {
  it("reflects exact-match allowlisted origin with credentials", () => {
    const req = makeReq({ origin: "https://app.example.com" });
    const { res, headers, _res } = makeRes();
    const next = vi.fn();

    corsMiddleware(req, res, next);

    expect(headers["Access-Control-Allow-Origin"]).toBe(
      "https://app.example.com"
    );
    expect(headers["Access-Control-Allow-Credentials"]).toBe("true");
    expect(headers["Vary"]).toBe("Origin");
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("reflects prefix-match allowlisted origin", () => {
    const req = makeReq({ origin: "https://staging.example.dev" });
    const { res, headers } = makeRes();
    const next = vi.fn();

    corsMiddleware(req, res, next);

    expect(headers["Access-Control-Allow-Origin"]).toBe(
      "https://staging.example.dev"
    );
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("does NOT echo disallowed origin", () => {
    const req = makeReq({ origin: "https://evil.example.org" });
    const { res, headers } = makeRes();
    const next = vi.fn();

    corsMiddleware(req, res, next);

    expect(headers["Access-Control-Allow-Origin"]).toBeUndefined();
    expect(headers["Access-Control-Allow-Credentials"]).toBeUndefined();
    // Still continues to next middleware for non-OPTIONS — server-side
    // auth still gates the actual data.
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("rejects preflight (OPTIONS) from a disallowed origin with 403", () => {
    const req = makeReq({
      origin: "https://evil.example.org",
      method: "OPTIONS",
    });
    const { res, headers, _res } = makeRes();
    const next = vi.fn();

    corsMiddleware(req, res, next);

    expect(_res.statusCode).toBe(403);
    expect(headers["Access-Control-Allow-Origin"]).toBeUndefined();
    expect(next).not.toHaveBeenCalled();
  });

  it("accepts preflight from an allowed origin with 200", () => {
    const req = makeReq({
      origin: "https://app.example.com",
      method: "OPTIONS",
    });
    const { res, headers, _res } = makeRes();
    const next = vi.fn();

    corsMiddleware(req, res, next);

    expect(_res.statusCode).toBe(200);
    expect(headers["Access-Control-Allow-Origin"]).toBe(
      "https://app.example.com"
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("passes through requests with no Origin header (mobile/server-to-server)", () => {
    const req = makeReq();
    const { res, headers } = makeRes();
    const next = vi.fn();

    corsMiddleware(req, res, next);

    expect(headers["Access-Control-Allow-Origin"]).toBeUndefined();
    expect(next).toHaveBeenCalledTimes(1);
  });
});

describe("corsMiddleware — dev fallback (no allowlist set)", () => {
  beforeEach(() => {
    process.env.CORS_ORIGIN_ALLOWLIST = "";
  });

  it("accepts localhost in dev fallback", () => {
    const req = makeReq({ origin: "http://localhost:8081" });
    const { res, headers } = makeRes();
    corsMiddleware(req, res, vi.fn());
    expect(headers["Access-Control-Allow-Origin"]).toBe("http://localhost:8081");
  });

  it("rejects non-localhost in dev fallback", () => {
    const req = makeReq({ origin: "https://evil.example.org" });
    const { res, headers } = makeRes();
    corsMiddleware(req, res, vi.fn());
    expect(headers["Access-Control-Allow-Origin"]).toBeUndefined();
  });
});
