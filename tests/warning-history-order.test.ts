/**
 * warning-history-order.test.ts
 *
 * Regressão do feedback 27/07: o cuidador recebia "sem atividade no app" a
 * cada 5 minutos (a cadência do monitoring-job).
 *
 * Causa: getWarningHistory ordenava ASC. O Passo 2 pede só 10 linhas para
 * deduplicar por nível; com o log passando de 10 avisos, a janela só continha
 * os MAIS ANTIGOS, a dedup nunca casava e o mesmo aviso era reenviado a cada
 * rodada — e cada reenvio inseria outra linha, afundando ainda mais os
 * recentes. Ordem correta: mais recentes primeiro.
 */
import { describe, expect, it, vi } from "vitest";
import { desc } from "drizzle-orm";
import { warningLog } from "../drizzle/schema";

let capturedOrderBy: unknown = null;
let capturedLimit: number | null = null;

const fakeDb = {
  select: () => {
    const chain: any = {
      from: () => chain,
      where: () => chain,
      orderBy: (arg: unknown) => {
        capturedOrderBy = arg;
        return chain;
      },
      limit: (n: number) => {
        capturedLimit = n;
        return Promise.resolve([]);
      },
    };
    return chain;
  },
};

vi.mock("../server/db", () => ({
  getDb: vi.fn(async () => fakeDb),
}));

import { getWarningHistory } from "../server/db-monitoring";

describe("getWarningHistory", () => {
  it("ordena por sentAt DESC — a janela do limit precisa conter os avisos RECENTES", async () => {
    await getWarningHistory("user-1", 10);

    expect(capturedLimit).toBe(10);
    // Comparado contra o mesmo desc() que o código deveria usar: se alguém
    // voltar para ASC (ou trocar a coluna), isto quebra.
    expect(capturedOrderBy).toEqual(desc(warningLog.sentAt));
  });

  it("NÃO usa ordem ascendente (a que causava o reenvio a cada 5 min)", async () => {
    await getWarningHistory("user-1", 10);

    expect(capturedOrderBy).not.toEqual(warningLog.sentAt);
  });
});
