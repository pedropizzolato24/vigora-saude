/**
 * edge-function-auth.test.ts
 *
 * Validates the shared-secret authorization for the Supabase Edge
 * Function check-missed-alarms. Previously the function used
 * Deno.serve(async () => {...}) with no auth — anyone could hit it to
 * burn WhatsApp quota or mark alarm events as escalated.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { authorizeRequest, __testing } from "../supabase/functions/check-missed-alarms/auth";

const SECRET = "super-secret-cron-token-please-rotate";
const HEADER = __testing.SECRET_HEADER;

beforeEach(() => {
  process.env.CHECK_MISSED_ALARMS_SECRET = SECRET;
});

afterEach(() => {
  delete process.env.CHECK_MISSED_ALARMS_SECRET;
});

function makeReq(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/", { headers });
}

describe("authorizeRequest", () => {
  it("returns null (allow) when the correct secret is supplied", () => {
    const res = authorizeRequest(makeReq({ [HEADER]: SECRET }));
    expect(res).toBeNull();
  });

  it("returns 401 when no secret header is present", async () => {
    const res = authorizeRequest(makeReq());
    expect(res).not.toBeNull();
    expect(res!.status).toBe(401);
    const body = await res!.json();
    expect(body.error).toBe("unauthorized");
  });

  it("returns 401 when the secret header is wrong", async () => {
    const res = authorizeRequest(makeReq({ [HEADER]: "wrong" }));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(401);
  });

  it("returns 401 when the secret is correct but length differs (timing-safe)", () => {
    const res = authorizeRequest(makeReq({ [HEADER]: SECRET + "x" }));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(401);
  });

  it("returns 503 when no secret is configured at all", async () => {
    delete process.env.CHECK_MISSED_ALARMS_SECRET;
    const res = authorizeRequest(makeReq({ [HEADER]: "anything" }));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(503);
    const body = await res!.json();
    expect(body.error).toMatch(/CHECK_MISSED_ALARMS_SECRET/i);
  });

  it("is case-insensitive in header lookup (the Request API normalizes)", () => {
    // Native Request normalizes header names to lowercase, so callers
    // using "X-Vigora-Cron-Secret" with different casings still work.
    const res = authorizeRequest(
      new Request("http://localhost/", {
        headers: { "X-Vigora-Cron-Secret": SECRET },
      })
    );
    expect(res).toBeNull();
  });
});

describe("timingSafeEqual", () => {
  const eq = __testing.timingSafeEqual;

  it("returns true for identical strings", () => {
    expect(eq("hello", "hello")).toBe(true);
  });

  it("returns false for different strings of the same length", () => {
    expect(eq("hello", "world")).toBe(false);
  });

  it("returns false for strings of different lengths (without timing leak)", () => {
    expect(eq("hello", "helloo")).toBe(false);
    expect(eq("", "x")).toBe(false);
  });

  it("works on empty strings", () => {
    expect(eq("", "")).toBe(true);
  });
});
