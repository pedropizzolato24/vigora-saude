/**
 * account-switch.test.ts
 *
 * Regressão da corrida que apagava os alarmes da conta que ENTRA.
 *
 * O cancelamento dos alarmes da conta que sai era disparado sem `await`, e o
 * carregamento do estado da conta nova começava em seguida. Como o cancelamento
 * é lento (AlarmManager nativo + cancelAllScheduledNotificationsAsync) e o
 * carregamento é rápido (um AsyncStorage.getItem), o cancelamento resolvia
 * DEPOIS do reagendamento e apagava os alarmes recém-agendados. A UI seguia
 * mostrando o alarme como ativo, mas não existia agendamento no sistema
 * operacional — alarme que não toca, num app de dead man's switch.
 */
import { describe, expect, it, vi } from "vitest";
import { switchAccount } from "../lib/_core/account-switch";

/** Promise controlável, para forçar a ordem real de resolução no teste. */
function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("switchAccount", () => {
  it("só carrega o estado da conta nova DEPOIS do cancelamento terminar", async () => {
    const order: string[] = [];
    const cancel = deferred();

    const running = switchAccount({
      resetState: () => order.push("reset"),
      cancelAlarms: async () => {
        order.push("cancel:start");
        await cancel.promise;
        order.push("cancel:end");
      },
      loadState: async () => {
        order.push("load");
      },
      isStillCurrent: () => true,
    });

    // Deixa o microtask queue girar: sem o await correto, "load" entraria aqui,
    // antes de o cancelamento resolver.
    await Promise.resolve();
    await Promise.resolve();
    expect(order).not.toContain("load");

    cancel.resolve();
    await running;

    expect(order).toEqual(["reset", "cancel:start", "cancel:end", "load"]);
  });

  it("carrega o estado mesmo se o cancelamento falhar", async () => {
    const loadState = vi.fn(async () => {});

    await switchAccount({
      resetState: () => {},
      cancelAlarms: async () => {
        throw new Error("AlarmManager indisponível");
      },
      loadState,
      isStillCurrent: () => true,
    });

    // Falhar em cancelar não pode deixar a conta que entra sem alarmes.
    expect(loadState).toHaveBeenCalledTimes(1);
  });

  it("aborta o carregamento se a conta mudou de novo durante o cancelamento", async () => {
    const loadState = vi.fn(async () => {});

    await switchAccount({
      resetState: () => {},
      cancelAlarms: async () => {},
      loadState,
      isStillCurrent: () => false,
    });

    expect(loadState).not.toHaveBeenCalled();
  });

  it("limpa a UI antes de começar o cancelamento", async () => {
    const order: string[] = [];

    await switchAccount({
      resetState: () => {
        order.push("reset");
      },
      cancelAlarms: async () => {
        order.push("cancel");
      },
      loadState: async () => {
        order.push("load");
      },
      isStillCurrent: () => true,
    });

    expect(order[0]).toBe("reset");
  });
});
