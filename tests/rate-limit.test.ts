/**
 * rate-limit.test.ts
 *
 * Validates the IP-keyed rate limit middleware. Combined with the
 * 50MB→1MB body limit reduction (Fix #5), this removes the easy DoS
 * vector that existed on every public endpoint.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";
import { createRateLimit, clientIp } from "../server/_core/rate-limit";

function makeReq(ip = "1.2.3.4", xff?: string): Request {
  const headers: Record<string, string> = {};
  if (xff) headers["x-forwarded-for"] = xff;
  return {
    headers,
    ip,
    socket: { remoteAddress: ip },
  } as unknown as Request;
}

function makeRes() {
  const headers: Record<string, string> = {};
  const state: { statusCode: number; jsonBody?: unknown } = { statusCode: 200 };
  const res = {
    setHeader: vi.fn((name: string, val: string) => {
      headers[name] = val;
    }),
    status: vi.fn((code: number) => {
      state.statusCode = code;
      return res;
    }),
    json: vi.fn((body: unknown) => {
      state.jsonBody = body;
      return res;
    }),
  };
  return { res: res as unknown as Response, headers, state };
}

const middlewares: Array<{ __dispose?: () => void }> = [];

afterEach(() => {
  for (const m of middlewares) m.__dispose?.();
  middlewares.length = 0;
});

function build(max: number, opts: { now?: () => number } = {}) {
  const m = createRateLimit({ max, windowMs: 60_000, ...opts });
  middlewares.push(m as any);
  return m;
}

describe("clientIp", () => {
  it("returns req.ip when no X-Forwarded-For", () => {
    expect(clientIp(makeReq("9.9.9.9"))).toBe("9.9.9.9");
  });

  it("ignores client-supplied X-Forwarded-For and trusts req.ip (anti-spoofing)", () => {
    // req.ip is derived by Express via `trust proxy 1`; the raw header is
    // attacker-controlled. A spoofed XFF must NOT change the rate-limit key.
    expect(clientIp(makeReq("1.1.1.1", "203.0.113.1, 10.0.0.1"))).toBe(
      "1.1.1.1"
    );
  });
});

describe("createRateLimit", () => {
  it("allows up to `max` requests within the window", () => {
    const mw = build(3);
    const next = vi.fn();
    for (let i = 0; i < 3; i++) {
      const { res } = makeRes();
      mw(makeReq(), res, next);
    }
    expect(next).toHaveBeenCalledTimes(3);
  });

  it("returns 429 with Retry-After on the (max+1)-th request", () => {
    const mw = build(3);
    const next = vi.fn();
    for (let i = 0; i < 3; i++) {
      const { res } = makeRes();
      mw(makeReq(), res, next);
    }
    const { res, headers, state } = makeRes();
    mw(makeReq(), res, next);

    expect(state.statusCode).toBe(429);
    expect(headers["Retry-After"]).toBeDefined();
    expect(Number(headers["Retry-After"])).toBeGreaterThan(0);
    expect(state.jsonBody).toMatchObject({ error: expect.any(String) });
    expect(next).toHaveBeenCalledTimes(3); // not invoked for the blocked one
  });

  it("resets the bucket after the window elapses", () => {
    let now = 1_000_000;
    const mw = build(2, { now: () => now });
    const next = vi.fn();

    // Exhaust
    for (let i = 0; i < 2; i++) {
      const { res } = makeRes();
      mw(makeReq(), res, next);
    }
    // Blocked
    const { res: blocked } = makeRes();
    mw(makeReq(), blocked, next);

    // Advance > window
    now += 61_000;
    const { res, state } = makeRes();
    mw(makeReq(), res, next);
    expect(state.statusCode).toBe(200);
    expect(next).toHaveBeenCalledTimes(3); // 2 + 1 after reset
  });

  it("keeps separate budgets for different IPs", () => {
    const mw = build(2);
    const next = vi.fn();

    for (let i = 0; i < 2; i++) {
      const { res } = makeRes();
      mw(makeReq("1.1.1.1"), res, next);
    }
    // 1.1.1.1 is now blocked, but 2.2.2.2 still has its budget
    const { res: blocked1, state: state1 } = makeRes();
    mw(makeReq("1.1.1.1"), blocked1, next);
    expect(state1.statusCode).toBe(429);

    const { res: ok2, state: state2 } = makeRes();
    mw(makeReq("2.2.2.2"), ok2, next);
    expect(state2.statusCode).toBe(200);
  });

  it("sets X-RateLimit-Remaining header", () => {
    const mw = build(5);
    const { res, headers } = makeRes();
    mw(makeReq(), res, vi.fn());
    expect(headers["X-RateLimit-Limit"]).toBe("5");
    expect(headers["X-RateLimit-Remaining"]).toBe("4");
  });

  it("supports a custom keyFn (per-user limits)", () => {
    const mw = createRateLimit({
      max: 1,
      keyFn: (req) => (req as any).user?.openId ?? "anon",
    });
    middlewares.push(mw as any);
    const next = vi.fn();

    const alice1 = makeReq();
    (alice1 as any).user = { openId: "alice" };
    const { res: r1, state: s1 } = makeRes();
    mw(alice1, r1, next);
    expect(s1.statusCode).toBe(200);

    const alice2 = makeReq();
    (alice2 as any).user = { openId: "alice" };
    const { res: r2, state: s2 } = makeRes();
    mw(alice2, r2, next);
    expect(s2.statusCode).toBe(429);

    // Different user is independent
    const bob = makeReq();
    (bob as any).user = { openId: "bob" };
    const { res: r3, state: s3 } = makeRes();
    mw(bob, r3, next);
    expect(s3.statusCode).toBe(200);
  });
});
