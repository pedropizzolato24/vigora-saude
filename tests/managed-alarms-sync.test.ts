/**
 * syncManagedAlarms: a ordem é a regra. O ack só sai depois de TODO o
 * agendamento terminar; falha de um alarme não derruba os outros; a versão só
 * conta como aplicada depois do ack chegar ao servidor.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  onManagedSyncRequested,
  requestManagedSync,
  syncManagedAlarms,
  type ManagedSyncAction,
  type ManagedSyncDeps,
  type MineResponse,
} from "../lib/managed-alarms-sync";
import type { Alarm, ManagementInfo } from "../lib/app-context";
import type { ManagedAlarm } from "../shared/managed-alarm";

const med = (id: string, time: string, over: Partial<ManagedAlarm> = {}): ManagedAlarm => ({
  id,
  time,
  description: `Remédio ${id}`,
  enabled: true,
  repeat: "daily",
  sound: true,
  vibration: true,
  ...over,
});

const mineWith = (version: number, alarms: ManagedAlarm[], since = 1000): MineResponse => ({
  pendingRequest: null,
  management: { id: 1, caregiverOpenId: "cg-1", caregiverName: "Ana", since },
  list: { version, alarms },
});

let localAlarms: Alarm[];
let management: ManagementInfo | null;
let mine: MineResponse | null;
let calls: string[];
let dispatched: ManagedSyncAction[];

function makeDeps(over: Partial<ManagedSyncDeps> = {}): ManagedSyncDeps {
  return {
    getLocal: () => localAlarms,
    getManagement: () => management,
    dispatch: (a) => {
      calls.push(`dispatch:${a.type}`);
      dispatched.push(a);
      if (a.type === "REPLACE_ALARMS") localAlarms = a.payload;
      if (a.type === "SET_MANAGEMENT") management = a.payload;
    },
    schedule: async (a) => {
      calls.push(`schedule:${a.id}`);
      return { ...a, nativeAlarmUids: [`vigora_${a.id}`] };
    },
    cancel: async (a) => {
      calls.push(`cancel:${a.id}`);
    },
    fetchMine: async () => mine,
    ack: async (version, failed) => {
      calls.push(`ack:${version}:${failed.join(",")}`);
    },
    ...over,
  };
}

beforeEach(() => {
  localAlarms = [];
  management = null;
  mine = null;
  calls = [];
  dispatched = [];
  vi.restoreAllMocks();
});

describe("syncManagedAlarms: ordem e confirmação", () => {
  it("cancela, agenda, troca a lista, confirma e só então marca a versão aplicada", async () => {
    localAlarms = [
      { ...med("velho", "07:00"), nativeAlarmUids: ["vigora_velho"] },
      { ...med("muda", "08:00"), nativeAlarmUids: ["vigora_muda"] },
    ];
    mine = mineWith(4, [med("muda", "09:00"), med("novo", "10:00")]);

    const result = await syncManagedAlarms(makeDeps());

    expect(result).toBe("applied");
    expect(calls).toEqual([
      "cancel:velho",
      "cancel:muda",
      "schedule:muda",
      "schedule:novo",
      "dispatch:REPLACE_ALARMS",
      "ack:4:",
      "dispatch:SET_MANAGEMENT",
    ]);
    expect(management).toEqual({ caregiverName: "Ana", since: 1000, appliedVersion: 4 });
  });

  it("não troca a lista nem confirma enquanto o último agendamento não terminou", async () => {
    mine = mineWith(2, [med("a", "08:00")]);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const deps = makeDeps({
      schedule: async (a) => {
        calls.push(`schedule:${a.id}:inicio`);
        await gate;
        calls.push(`schedule:${a.id}:fim`);
        return { ...a, nativeAlarmUids: ["u"] };
      },
    });

    const run = syncManagedAlarms(deps);
    await new Promise((r) => setTimeout(r, 10));
    expect(calls).toEqual(["schedule:a:inicio"]); // nada de REPLACE nem ack ainda

    release();
    await run;
    expect(calls).toEqual([
      "schedule:a:inicio",
      "schedule:a:fim",
      "dispatch:REPLACE_ALARMS",
      "ack:2:",
      "dispatch:SET_MANAGEMENT",
    ]);
  });

  it("a lista despachada leva as cópias com uids devolvidas pelo agendador", async () => {
    mine = mineWith(2, [med("a", "08:00")]);
    await syncManagedAlarms(makeDeps());
    const replace = dispatched.find((d) => d.type === "REPLACE_ALARMS");
    expect(replace?.type === "REPLACE_ALARMS" && replace.payload[0].nativeAlarmUids).toEqual(["vigora_a"]);
  });
});

describe("syncManagedAlarms: falhas", () => {
  it("um alarme que o sistema recusa vai para failedAlarmIds; os outros seguem", async () => {
    mine = mineWith(3, [med("a", "08:00"), med("b", "09:00"), med("c", "10:00")]);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const deps = makeDeps({
      schedule: async (a) => {
        calls.push(`schedule:${a.id}`);
        if (a.id === "b") throw new Error("o sistema recusou");
        return { ...a, nativeAlarmUids: [`u-${a.id}`] };
      },
    });

    expect(await syncManagedAlarms(deps)).toBe("applied");

    expect(calls).toContain("ack:3:b");
    const replace = dispatched.find((d) => d.type === "REPLACE_ALARMS");
    const lista = replace?.type === "REPLACE_ALARMS" ? replace.payload : [];
    expect(lista.map((x) => [x.id, x.enabled, x.nativeAlarmUids])).toEqual([
      ["a", true, ["u-a"]],
      ["b", false, []],
      ["c", true, ["u-c"]],
    ]);
    // o log traz o motivo, mas nunca o nome do remédio
    expect(warn).toHaveBeenCalled();
    expect(JSON.stringify(warn.mock.calls)).not.toContain("Remédio");
  });

  it("falha ao cancelar um alarme removido não impede o resto", async () => {
    localAlarms = [{ ...med("velho", "07:00"), nativeAlarmUids: ["x"] }];
    mine = mineWith(2, [med("novo", "10:00")]);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const deps = makeDeps({
      cancel: async () => {
        throw new Error("nativo recusou");
      },
    });

    expect(await syncManagedAlarms(deps)).toBe("applied");
    expect(calls).toContain("schedule:novo");
    expect(calls).toContain("ack:2:");
  });

  it("ack que não chega: volta offline, a versão NÃO avança e a próxima rodada só reconfirma", async () => {
    mine = mineWith(2, [med("a", "08:00")]);
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const semRede = makeDeps({
      ack: async () => {
        throw new Error("sem rede");
      },
    });
    expect(await syncManagedAlarms(semRede)).toBe("offline");
    expect(management).toBeNull();

    calls = [];
    expect(await syncManagedAlarms(makeDeps())).toBe("applied");
    // nada foi reagendado: a lista local já era a do servidor
    expect(calls).toEqual(["dispatch:REPLACE_ALARMS", "ack:2:", "dispatch:SET_MANAGEMENT"]);
    expect(management?.appliedVersion).toBe(2);
  });

  it("depois de uma falha de agendamento, a próxima aplicação tenta de novo só esse alarme", async () => {
    mine = mineWith(2, [med("a", "08:00"), med("b", "09:00")]);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await syncManagedAlarms(
      makeDeps({
        schedule: async (a) => {
          if (a.id === "b") throw new Error("recusou");
          return { ...a, nativeAlarmUids: [`u-${a.id}`] };
        },
        ack: async () => {
          throw new Error("sem rede"); // versão não avança: a próxima rodada reaplica
        },
      })
    );

    calls = [];
    await syncManagedAlarms(makeDeps());
    expect(calls.filter((c) => c.startsWith("schedule:"))).toEqual(["schedule:b"]);
    expect(calls).toContain("ack:2:");
  });

  it("sem resposta do servidor: offline, nada despachado", async () => {
    mine = null;
    expect(await syncManagedAlarms(makeDeps())).toBe("offline");
    expect(dispatched).toEqual([]);
    expect(calls).toEqual([]);
  });

  it("fetchMine que lança também vira offline", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const deps = makeDeps({
      fetchMine: async () => {
        throw new Error("boom");
      },
    });
    expect(await syncManagedAlarms(deps)).toBe("offline");
  });
});

describe("syncManagedAlarms: sem acordo, versão já aplicada e acordo novo", () => {
  it("sem acordo no servidor: o modo de edição volta ao idoso e os alarmes ficam como estão", async () => {
    localAlarms = [{ ...med("a", "08:00"), nativeAlarmUids: ["u"] }];
    management = { caregiverName: "Ana", since: 1000, appliedVersion: 3 };
    mine = { pendingRequest: null, management: null, list: null };

    expect(await syncManagedAlarms(makeDeps())).toBe("not-managed");

    expect(dispatched).toEqual([{ type: "SET_MANAGEMENT", payload: null }]);
    expect(calls).toEqual(["dispatch:SET_MANAGEMENT"]);
    expect(localAlarms).toHaveLength(1);
  });

  it("sem acordo e sem acordo local: não despacha nada", async () => {
    mine = { pendingRequest: null, management: null, list: null };
    expect(await syncManagedAlarms(makeDeps())).toBe("not-managed");
    expect(dispatched).toEqual([]);
  });

  it("versão que já está aplicada: nada a fazer", async () => {
    management = { caregiverName: "Ana", since: 1000, appliedVersion: 5 };
    mine = mineWith(5, [med("a", "08:00")], 1000);
    expect(await syncManagedAlarms(makeDeps())).toBe("unchanged");
    expect(calls).toEqual([]);
  });

  it("acordo NOVO (outro since) aplica mesmo que a versão seja menor que a do acordo antigo", async () => {
    management = { caregiverName: "Bia", since: 111, appliedVersion: 9 };
    mine = mineWith(1, [med("a", "08:00")], 222);
    expect(await syncManagedAlarms(makeDeps())).toBe("applied");
    expect(management).toEqual({ caregiverName: "Ana", since: 222, appliedVersion: 1 });
  });

  it("acordo ativo sem lista: nada a aplicar", async () => {
    mine = { pendingRequest: null, management: mineWith(1, []).management, list: null };
    expect(await syncManagedAlarms(makeDeps())).toBe("unchanged");
  });

  it("duas chamadas ao mesmo tempo dividem a execução e não agendam duas vezes", async () => {
    mine = mineWith(2, [med("a", "08:00")]);
    const deps = makeDeps();
    await Promise.all([syncManagedAlarms(deps), syncManagedAlarms(deps)]);
    expect(calls.filter((c) => c.startsWith("schedule:"))).toEqual(["schedule:a"]);
  });
});

describe("barramento requestManagedSync", () => {
  it("entrega o pedido aos ouvintes e respeita openRequest", () => {
    const ouvinte = vi.fn();
    const sair = onManagedSyncRequested(ouvinte);

    requestManagedSync();
    requestManagedSync({ openRequest: true });
    expect(ouvinte.mock.calls).toEqual([[{ openRequest: false }], [{ openRequest: true }]]);

    sair();
    requestManagedSync();
    expect(ouvinte).toHaveBeenCalledTimes(2);
  });

  it("um ouvinte que lança não impede os outros", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const bom = vi.fn();
    const sair1 = onManagedSyncRequested(() => {
      throw new Error("ouvinte quebrado");
    });
    const sair2 = onManagedSyncRequested(bom);
    requestManagedSync();
    expect(bom).toHaveBeenCalledTimes(1);
    sair1();
    sair2();
  });
});
