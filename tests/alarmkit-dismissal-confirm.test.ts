// tests/alarmkit-dismissal-confirm.test.ts
/**
 * O "Desligar" do AlarmKit É a confirmação. Se ela não chegar ao servidor, o
 * monitoring-job escala um alarme que o idoso ATENDEU e a família recebe
 * mensagem à toa.
 *
 * Princípio inegociável: nunca sintetizar um "responded" que não foi
 * observado. Num dead man's switch o falso "respondeu" esconde remédio
 * realmente perdido — é pior que incomodar a família.
 *
 * O horário mandado importa tanto quanto o status: o servidor casa o evento
 * por (alarmId, scheduledAt). Mandar "agora" em vez do horário do disparo pode
 * não casar com o evento pendente — a confirmação se perde e a família é
 * avisada mesmo assim. Por isso o disparo é derivado de lastAlarmFireMs sobre
 * o alarme lido do estado PERSISTIDO: no boot por dismiss o app acabou de
 * subir e o contexto em memória ainda não hidratou.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

let payload: { alarmId: string; payload: string | null } | null = null;
const enfileirar = vi.fn(async () => {});

type Ouvinte = (estado: string) => void;
const ouvintes: Ouvinte[] = [];

vi.mock("react-native", () => ({
  AppState: {
    addEventListener: (_evento: string, cb: Ouvinte) => {
      ouvintes.push(cb);
      return {
        remove: () => {
          const i = ouvintes.indexOf(cb);
          if (i >= 0) ouvintes.splice(i, 1);
        },
      };
    },
  },
}));

vi.mock("../lib/_core/ios-alarm-kit-bridge", () => ({
  get alarmKit() {
    return {
      getLaunchPayload: () => payload,
      configure: () => true,
      requestAuthorization: async () => "authorized",
      scheduleRepeatingAlarm: async () => true,
      cancelAlarm: async () => true,
      getAllAlarms: () => [],
    };
  },
}));

vi.mock("../lib/pending-confirmations", () => ({
  enqueueConfirmation: (...a: unknown[]) => enfileirar(...(a as [])),
}));

import {
  confirmAlarmKitDismissal,
  watchAlarmKitDismissals,
} from "../lib/ios-alarm-kit";

/** 20/08/2026 (quinta), 09:00 no fuso do aparelho. */
const agora = new Date(2026, 7, 20, 9, 0, 0, 0);
/** O alarme das 08:30 já disparou hoje — é ESTE horário que o servidor espera. */
const disparoDeHoje = new Date(2026, 7, 20, 8, 30, 0, 0).toISOString();

/** O caso real: o dismiss chega segundos depois do disparo das 08:30. */
const segundosDepois = new Date(2026, 7, 20, 8, 30, 7, 234);
const minutoCheio = new Date(2026, 7, 20, 8, 30, 0, 0).toISOString();

const estadoCom = (alarmes: unknown[]) => async () =>
  JSON.stringify({ alarms: alarmes });

const alarme = {
  id: "a1",
  time: "08:30",
  description: "Remédio da pressão",
  repeat: "daily",
  enabled: true,
  sound: true,
  vibration: true,
};

/** Deixa a cadeia async do ouvinte terminar antes de asserir. */
const tick = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  payload = null;
  ouvintes.length = 0;
  vi.clearAllMocks();
});

describe("confirmação pelo dismiss", () => {
  it("enfileira 'responded' quando o app abriu por um dismiss", async () => {
    payload = { alarmId: "a1", payload: "a1" };

    const id = await confirmAlarmKitDismissal(estadoCom([alarme]), agora);

    expect(id).toBe("a1");
    expect(enfileirar).toHaveBeenCalledWith(
      expect.objectContaining({ alarmId: "a1", status: "responded" })
    );
  });

  it("usa o horário do disparo, não a hora em que o app abriu", async () => {
    payload = { alarmId: "a1", payload: "a1" };

    await confirmAlarmKitDismissal(estadoCom([alarme]), agora);

    expect(enfileirar).toHaveBeenCalledWith(
      expect.objectContaining({ scheduledAtIso: disparoDeHoje })
    );
  });

  it("alarme apagado do estado: confirma no minuto cheio, nunca com os segundos", async () => {
    // `now` cru é confirmação PERDIDA, não aproximada: confirmEvent casa por
    // (alarmId, scheduledAt) EXATO e não cria evento, então 08:30:07.234 nunca
    // casa com o pendente das 08:30:00.000 — a confirmação sai da fila local e
    // a família é avisada assim mesmo. O minuto cheio casa no caso comum,
    // porque o alarme dispara em HH:MM:00 e o dismiss chega em segundos.
    payload = { alarmId: "a1", payload: "a1" };

    const id = await confirmAlarmKitDismissal(estadoCom([]), segundosDepois);

    expect(id).toBe("a1");
    expect(enfileirar).toHaveBeenCalledWith(
      expect.objectContaining({
        alarmId: "a1",
        status: "responded",
        scheduledAtIso: minutoCheio,
      })
    );
  });

  it("estado ilegível não engole a confirmação, e também arredonda", async () => {
    payload = { alarmId: "a1", payload: "a1" };
    const quebrado = async () => {
      throw new Error("storage indisponível");
    };

    expect(await confirmAlarmKitDismissal(quebrado, segundosDepois)).toBe("a1");
    expect(enfileirar).toHaveBeenCalledWith(
      expect.objectContaining({ scheduledAtIso: minutoCheio })
    );
  });

  it("o disparo calculado continua tendo prioridade sobre o arredondamento", async () => {
    // Com o alarme no estado, a fonte é lastAlarmFireMs — o arredondamento é só
    // o melhor esforço de quem não tem alarme para resolver.
    payload = { alarmId: "a1", payload: "a1" };

    await confirmAlarmKitDismissal(estadoCom([alarme]), agora);

    expect(enfileirar).toHaveBeenCalledWith(
      expect.objectContaining({ scheduledAtIso: disparoDeHoje })
    );
  });

  it("sem dismiss não inventa confirmação nenhuma", async () => {
    payload = null;

    const id = await confirmAlarmKitDismissal(estadoCom([alarme]), agora);

    expect(id).toBeNull();
    expect(enfileirar).not.toHaveBeenCalled();
  });

  it("payload sem alarmId não vira confirmação", async () => {
    payload = { alarmId: "", payload: null };

    expect(await confirmAlarmKitDismissal(estadoCom([alarme]), agora)).toBeNull();
    expect(enfileirar).not.toHaveBeenCalled();
  });
});

describe("dismiss com o app apenas suspenso", () => {
  /**
   * O intent roda no processo do app e grava o payload num static. Se o app
   * estava suspenso em memória (o idoso mexeu nele à noite e o alarme toca às
   * 22h), ele volta ao primeiro plano sem montar de novo: o efeito de boot não
   * roda outra vez e o payload ficaria lá parado para sempre — a família
   * receberia alerta de um alarme atendido. É a explicação mais provável do
   * "1 em 9" que falhou na medição em aparelho.
   */
  it("drena quando o app volta a ficar ativo", async () => {
    const confirmados: string[] = [];
    const parar = watchAlarmKitDismissals(estadoCom([alarme]), (id) =>
      confirmados.push(id),
    );
    payload = { alarmId: "a1", payload: "a1" };

    ouvintes.forEach((cb) => cb("active"));
    await tick();

    expect(confirmados).toEqual(["a1"]);
    expect(enfileirar).toHaveBeenCalledWith(
      expect.objectContaining({ alarmId: "a1", status: "responded" }),
    );
    parar();
  });

  it("voltar ao primeiro plano sem dismiss não enfileira nada", async () => {
    const confirmados: string[] = [];
    const parar = watchAlarmKitDismissals(estadoCom([alarme]), (id) =>
      confirmados.push(id),
    );
    payload = null;

    ouvintes.forEach((cb) => cb("active"));
    await tick();

    expect(confirmados).toEqual([]);
    expect(enfileirar).not.toHaveBeenCalled();
    parar();
  });

  it("ir para segundo plano não drena", async () => {
    const parar = watchAlarmKitDismissals(estadoCom([alarme]), () => {});
    payload = { alarmId: "a1", payload: "a1" };

    ouvintes.forEach((cb) => cb("background"));
    await tick();

    expect(enfileirar).not.toHaveBeenCalled();
    parar();
  });

  it("cancelar tira o ouvinte", () => {
    const parar = watchAlarmKitDismissals(estadoCom([alarme]), () => {});
    expect(ouvintes).toHaveLength(1);

    parar();

    expect(ouvintes).toHaveLength(0);
  });
});

describe("costura no boot do app", () => {
  const layout = readFileSync(join(__dirname, "..", "app/_layout.tsx"), "utf8");

  it("drena o dismiss na inicialização", () => {
    // Ninguém mais chama confirmAlarmKitDismissal: se esta linha sumir num
    // refactor, a confirmação simplesmente deixa de acontecer e o único sinal
    // é a família recebendo alerta de um alarme atendido.
    expect(layout).toMatch(/confirmAlarmKitDismissal\(loadCurrentAppStateRaw\)/);
  });

  it("continua drenando depois do boot, quando o app volta ao primeiro plano", () => {
    // O efeito de mount roda uma vez só; sem este ouvinte, o dismiss que chega
    // com o app suspenso nunca é lido.
    expect(layout).toMatch(/watchAlarmKitDismissals\(/);
  });

  it("configura o App Group antes de tocar em qualquer outra coisa do AlarmKit", () => {
    // O App Group é o suitName do UserDefaults compartilhado: sem ele
    // setAlarm/getAllAlarms não gravam nem leem nada, ou seja, agendar e
    // listar (listAlarmKitAlarmIds) dependem do configure. O payload do
    // dismiss NÃO depende — o intent grava um static no processo do app.
    const configure = layout.indexOf("configure(APP_GROUP)");
    const confirma = layout.indexOf("confirmAlarmKitDismissal(");
    const autoriza = layout.indexOf("requestAlarmKitAuthorization(");
    expect(configure).toBeGreaterThan(-1);
    expect(confirma).toBeGreaterThan(configure);
    expect(autoriza).toBeGreaterThan(configure);
  });

  it("verifica o retorno de configure() em vez de descartá-lo", () => {
    // A Fase 0 mediu: sem o App Group, configure() devolve false. Descartar o
    // retorno faz getAllAlarms() devolver [] em todo boot, todo alarme parecer
    // faltando e ser reagendado a cada abertura do app — e nada disso aparece
    // em lugar nenhum. Engolir falha de capacidade em silêncio é proibido pelo
    // CLAUDE.md.
    const chamada = layout.match(/const (\w+) = alarmKit\?\.configure\(APP_GROUP\);/);
    expect(chamada, "o retorno de configure() está sendo descartado").not.toBeNull();

    const [linha, nome] = chamada!;
    const depois = layout.slice(layout.indexOf(linha) + linha.length, layout.indexOf(linha) + 700);
    expect(depois, "o retorno precisa ser checado").toMatch(new RegExp(`if \\(!${nome}\\)`));
    expect(depois, "e o motivo real precisa ir para o log").toMatch(/console\.error\(/);
  });
});
