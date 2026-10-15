/**
 * db-user-data-timezone.test.ts
 *
 * upsertUserData grava o fuso da conta (user_data.timezone) quando o cliente
 * manda. Cliente antigo (sem fuso) NÃO apaga o fuso já guardado; null apaga.
 * Usa o db.ts de verdade com o drizzle trocado por um dublê.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

interface Chamada {
  values: Record<string, unknown>;
  set: Record<string, unknown>;
}
const chamadas: Chamada[] = [];

const fakeDb = {
  insert: () => ({
    values: (values: Record<string, unknown>) => ({
      onDuplicateKeyUpdate: ({ set }: { set: Record<string, unknown> }) => {
        chamadas.push({ values, set });
        return Promise.resolve();
      },
    }),
  }),
};

vi.mock("mysql2", () => ({ default: { createPool: vi.fn(() => ({})) } }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: vi.fn(() => fakeDb) }));
vi.mock("drizzle-orm/mysql2/migrator", () => ({ migrate: vi.fn() }));

import { upsertUserData } from "../server/db";

const base = { openId: "maria-1", dataUpdatedAt: 10 };

beforeEach(() => {
  chamadas.length = 0;
  process.env.DATABASE_URL = "mysql://u:p@localhost:3306/x";
});

describe("upsertUserData — fuso da conta", () => {
  it("fuso informado entra no insert e no update", async () => {
    await upsertUserData({ ...base, timezone: "America/Manaus" });

    expect(chamadas[0].values.timezone).toBe("America/Manaus");
    expect(chamadas[0].set.timezone).toBe("America/Manaus");
  });

  it("fuso null apaga o fuso guardado", async () => {
    await upsertUserData({ ...base, timezone: null });

    expect(chamadas[0].set).toHaveProperty("timezone", null);
  });

  it("fuso ausente (cliente antigo) preserva o guardado: a coluna nem entra no update", async () => {
    await upsertUserData(base);

    expect(chamadas[0].set).not.toHaveProperty("timezone");
    expect(chamadas[0].values).not.toHaveProperty("timezone");
  });

  it("o resto do backup continua sendo gravado como antes", async () => {
    await upsertUserData({ ...base, alarms: [{ id: "a1" }], timezone: "America/Sao_Paulo" });

    expect(chamadas[0].set).toMatchObject({ alarms: [{ id: "a1" }], dataUpdatedAt: 10 });
  });
});
