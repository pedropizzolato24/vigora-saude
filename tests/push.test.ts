/**
 * push.test.ts
 *
 * Unit tests for the Expo push sender: ticket counting, dead-token pruning,
 * batching, and the no-op fast path. The DB layer (deletePushToken) is mocked
 * so these run without a database.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the DB module BEFORE importing push.ts so the module graph picks it up
// (and so we never touch drizzle/mysql in unit tests).
const deletePushToken = vi.fn(async (_token: string) => {});
vi.mock("../server/db-push", () => ({
  deletePushToken: (token: string) => deletePushToken(token),
}));

import { sendExpoPush } from "../server/push";

function mockFetchOnce(tickets: Array<{ status: string; message?: string; details?: { error?: string } }>) {
  return vi.spyOn(global, "fetch").mockResolvedValue({
    ok: true,
    json: async () => ({ data: tickets }),
  } as unknown as Response);
}

describe("sendExpoPush", () => {
  beforeEach(() => {
    deletePushToken.mockClear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("skips the request and returns 0 when there are no tokens", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    const sent = await sendExpoPush([], { title: "t", body: "b" });
    expect(sent).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("counts accepted tickets", async () => {
    mockFetchOnce([{ status: "ok" }, { status: "ok" }]);
    const sent = await sendExpoPush(["ExponentPushToken[a]", "ExponentPushToken[b]"], {
      title: "t",
      body: "b",
    });
    expect(sent).toBe(2);
  });

  it("prunes tokens Expo reports as DeviceNotRegistered", async () => {
    mockFetchOnce([
      { status: "ok" },
      { status: "error", message: "x", details: { error: "DeviceNotRegistered" } },
    ]);
    const sent = await sendExpoPush(["good", "bad"], { title: "t", body: "b" });
    expect(sent).toBe(1);
    expect(deletePushToken).toHaveBeenCalledTimes(1);
    expect(deletePushToken).toHaveBeenCalledWith("bad");
  });

  it("does not prune on non-DeviceNotRegistered errors", async () => {
    mockFetchOnce([{ status: "error", message: "MessageTooBig" }]);
    const sent = await sendExpoPush(["x"], { title: "t", body: "b" });
    expect(sent).toBe(0);
    expect(deletePushToken).not.toHaveBeenCalled();
  });

  it("batches into requests of at most 100 messages", async () => {
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockImplementation(async (_url, opts) => {
        const msgs = JSON.parse((opts as RequestInit).body as string) as unknown[];
        return {
          ok: true,
          json: async () => ({ data: msgs.map(() => ({ status: "ok" })) }),
        } as unknown as Response;
      });
    const tokens = Array.from({ length: 250 }, (_, i) => `t${i}`);
    const sent = await sendExpoPush(tokens, { title: "t", body: "b" });
    expect(sent).toBe(250);
    expect(fetchSpy).toHaveBeenCalledTimes(3); // 100 + 100 + 50
  });

  it("filters out falsy tokens before sending", async () => {
    const fetchSpy = mockFetchOnce([{ status: "ok" }]);
    const sent = await sendExpoPush(["", "good"], { title: "t", body: "b" });
    expect(sent).toBe(1);
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toHaveLength(1);
  });

  it("returns 0 when Expo responds with a non-ok HTTP status", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({ ok: false, status: 500 } as unknown as Response);
    const sent = await sendExpoPush(["x"], { title: "t", body: "b" });
    expect(sent).toBe(0);
  });
});
