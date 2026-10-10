/**
 * account-deletion-managed.test.ts
 *
 * Exclusão de conta (LGPD Art. 18, VI) com as tabelas da Fase 4. Roda
 * deleteAccountData contra uma transação falsa e confere QUAIS tabelas são
 * apagadas e com que filtro:
 *  - o acordo (alarm_management) sai da conta como idoso E como cuidador;
 *  - a lista gerenciada sai com o idoso;
 *  - se quem apaga a conta é a CUIDADORA de um acordo ativo, a lista gerenciada do
 *    idoso também sai (senão fica órfã e o servidor segue cobrando os alarmes);
 *  - a linha de `users` continua sendo a ÚLTIMA (derruba as sessões).
 */
import { getTableName } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const dialect = new MySqlDialect();
let activeManaged: Array<{ monitoredOpenId: string }> = [];
const deletes: Array<{ table: string; sql: string; params: unknown[] }> = [];
let lockModes: unknown[] = [];

const tx = {
  select: () => {
    const chain: any = {
      from: () => chain,
      where: () => ({
        for: (mode: unknown) => {
          lockModes.push(mode);
          return Promise.resolve(activeManaged);
        },
        // leitura sem trava: o teste de "for update" abaixo falha se voltar a ser assim
        then: (res: (v: unknown) => unknown) => Promise.resolve(activeManaged).then(res),
      }),
    };
    return chain;
  },
  delete: (table: any) => ({
    where: (condition: any) => {
      const query = dialect.sqlToQuery(condition);
      deletes.push({ table: getTableName(table), sql: query.sql, params: query.params });
      return Promise.resolve();
    },
  }),
};

vi.mock("../server/db", () => ({
  getDb: vi.fn(async () => ({ transaction: async (fn: (t: typeof tx) => Promise<void>) => fn(tx) })),
  getUserByOpenId: vi.fn(async () => undefined),
}));

import { deleteAccountData } from "../server/db-account";

const deleteOf = (table: string) => deletes.find((d) => d.table === table);

beforeEach(() => {
  activeManaged = [];
  deletes.length = 0;
  lockModes = [];
});

describe("deleteAccountData — acordo e lista gerenciada", () => {
  it("apaga o acordo da conta como idoso E como cuidador", async () => {
    await deleteAccountData("maria");

    const acordo = deleteOf("alarm_management");
    expect(acordo).toBeDefined();
    expect(acordo!.sql).toContain("monitoredOpenId");
    expect(acordo!.sql).toContain("caregiverOpenId");
    expect(acordo!.params).toEqual(["maria", "maria"]);
  });

  it("apaga a lista gerenciada da própria conta", async () => {
    await deleteAccountData("maria");

    const lista = deleteOf("managed_alarm_lists");
    expect(lista).toBeDefined();
    expect(lista!.sql).toContain("monitoredOpenId");
    expect(lista!.params).toEqual(["maria"]);
  });

  it("cuidadora com acordo ativo: a lista do idoso que ela gerenciava sai junto", async () => {
    activeManaged = [{ monitoredOpenId: "maria" }];

    await deleteAccountData("ana");

    expect(deleteOf("managed_alarm_lists")!.params).toEqual(["ana", "maria"]);
    expect(deleteOf("alarm_management")!.params).toEqual(["ana", "ana"]);
  });

  it("a consulta do acordo ativo é uma leitura travada (FOR UPDATE), para esperar uma ativação em curso", async () => {
    await deleteAccountData("ana");

    expect(lockModes).toEqual(["update"]);
  });

  it("a lista é apagada ANTES do acordo (a consulta do acordo ativo precisa ainda existir)", async () => {
    await deleteAccountData("ana");

    const order = deletes.map((d) => d.table);
    expect(order.indexOf("managed_alarm_lists")).toBeLessThan(order.indexOf("alarm_management"));
  });

  it("a linha de users continua sendo a última", async () => {
    await deleteAccountData("maria");

    expect(deletes[deletes.length - 1].table).toBe("users");
    expect(deletes.map((d) => d.table)).toEqual(
      expect.arrayContaining([
        "account_liveness",
        "alarm_events",
        "alarm_changes",
        "warning_log",
        "alarm_management",
        "managed_alarm_lists",
        "user_data",
        "push_tokens",
        "caregiver_links",
      ]),
    );
  });
});
