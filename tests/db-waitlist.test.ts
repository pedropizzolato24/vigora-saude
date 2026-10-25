import { beforeEach, describe, expect, it, vi } from "vitest";

const getDb = vi.fn();
vi.mock("../server/db", () => ({ getDb: () => getDb() }));

import { addToWaitlist, removeFromWaitlist } from "../server/db-waitlist";

// Dublê mínimo do builder do Drizzle: insert(t).ignore().values(v) e delete(t).where(c).
function fakeDb(affectedRows: number) {
  const inserted: Array<Record<string, unknown>> = [];
  const db = {
    insert: vi.fn(() => ({
      ignore: () => ({
        values: async (v: Record<string, unknown>) => {
          inserted.push(v);
          return [{ affectedRows }];
        },
      }),
    })),
    delete: vi.fn(() => ({ where: async () => [{ affectedRows }] })),
  };
  return { db, inserted };
}

const input = { email: "ana@exemplo.com", reasons: ["queda" as const], policyVersion: "2026-10-20" };

describe("waitlist db", () => {
  beforeEach(() => getDb.mockReset());

  it("gera token novo e devolve created:true quando insere", async () => {
    const { db, inserted } = fakeDb(1);
    getDb.mockResolvedValue(db);
    const r = await addToWaitlist(input);
    expect(r).toEqual({ created: true, unsubscribeToken: expect.stringMatching(/^[A-Za-z0-9_-]{32}$/) });
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ email: input.email, reasons: ["queda"], policyVersion: "2026-10-20" });
    expect(inserted[0].consentAt).toBeInstanceOf(Date);
    expect(inserted[0].unsubscribeToken).toBe((r as { unsubscribeToken: string }).unsubscribeToken);
  });

  it("devolve created:false quando o e-mail já existe (affectedRows 0)", async () => {
    getDb.mockResolvedValue(fakeDb(0).db);
    expect(await addToWaitlist(input)).toEqual({ created: false });
  });

  it("removeFromWaitlist devolve false para token inexistente e true quando apaga", async () => {
    getDb.mockResolvedValue(fakeDb(0).db);
    expect(await removeFromWaitlist("nao-existe")).toBe(false);
    getDb.mockResolvedValue(fakeDb(1).db);
    expect(await removeFromWaitlist("existe")).toBe(true);
  });

  it("lança quando não há banco", async () => {
    getDb.mockResolvedValue(null);
    await expect(addToWaitlist(input)).rejects.toThrow();
    await expect(removeFromWaitlist("x")).rejects.toThrow();
  });
});
