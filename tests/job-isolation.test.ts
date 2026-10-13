/**
 * job-isolation.test.ts
 *
 * As rotinas da Fase 4 percorrem várias contas. Uma conta com dado ruim não
 * pode travar as outras, e o log nunca leva a mensagem do erro: a do drizzle
 * traz os parâmetros da query (nome do lembrete, openId) e o `lastError` do job
 * aparece em /api/health.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { describeError, runEach, runSteps } from "../server/_core/job-isolation";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("describeError", () => {
  it("devolve só nome e código, nunca a mensagem", () => {
    const err = Object.assign(new Error("Failed query: insert into alarm_events params: Losartana"), {
      name: "DrizzleQueryError",
      cause: { code: "ER_LOCK_DEADLOCK" },
    });
    expect(describeError(err)).toBe("DrizzleQueryError ER_LOCK_DEADLOCK");
    expect(describeError(err)).not.toContain("Losartana");
  });

  it("aceita valor que não é erro", () => {
    expect(describeError("boom")).toBe("Error");
    expect(describeError(null)).toBe("Error");
  });
});

describe("runEach", () => {
  it("processa todos os itens e devolve quantos falharam", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const visited: number[] = [];

    const failed = await runEach([1, 2, 3], "Teste", async (n) => {
      visited.push(n);
      if (n === 2) throw new Error("linha ruim com Losartana");
    });

    expect(visited).toEqual([1, 2, 3]);
    expect(failed).toBe(1);
  });

  it("não loga a mensagem do erro", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await runEach(["a"], "Teste", async () => {
      throw new Error("params: Losartana 08:00");
    });

    const logged = JSON.stringify(spy.mock.calls);
    expect(logged).toContain("Teste falhou");
    expect(logged).not.toContain("Losartana");
  });

  it("lista vazia devolve 0", async () => {
    await expect(runEach([], "Teste", async () => undefined)).resolves.toBe(0);
  });
});

describe("runSteps", () => {
  it("um passo que falha não impede os seguintes; rejeita no fim só com os nomes dos passos", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const ran: string[] = [];

    const result = runSteps("Rotina", [
      ["um", async () => void ran.push("um")],
      [
        "dois",
        async () => {
          ran.push("dois");
          throw new Error("params: Losartana");
        },
      ],
      ["tres", async () => void ran.push("tres")],
    ]);

    await expect(result).rejects.toThrow("Rotina: falhou em dois");
    expect(ran).toEqual(["um", "dois", "tres"]);
    expect(JSON.stringify(spy.mock.calls)).not.toContain("Losartana");
  });

  it("todos os passos ok: resolve", async () => {
    await expect(runSteps("Rotina", [["um", async () => undefined]])).resolves.toBeUndefined();
  });
});
