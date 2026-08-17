/**
 * notification-content-no-undefined.test.ts
 *
 * No iPhone, alarme com "Som" desmarcado não aparecia: nenhuma notificação.
 * Medido na tela do spike em 17/08/2026 —
 * `scheduleAlarmNotification(sound=false) -> NULL`: a função LANÇAVA, e o
 * próprio try/catch dela engolia a exceção. Nunca houve notificação para o
 * iOS entregar; o bug não era de entrega, era de agendamento.
 *
 * Causa: `sound: undefined` mantém a CHAVE presente no objeto JS
 * (`Object.keys({sound: undefined})` devolve `['sound']` — diferente de
 * JSON.stringify, que a descarta). Do outro lado da ponte o campo é
 * `Either<Bool, String>?` (Records.swift), e converter `undefined` para
 * Either falha. Chave AUSENTE vira nil e funciona.
 *
 * A mesma sonda provou que o interruptionLevel era inocente: 4 notificações
 * cruas sem som, uma por nível, todas entregues — nelas a chave `sound` não
 * era passada.
 *
 * Invariante: nenhuma chave pode chegar à ponte valendo `undefined`. Vale
 * para `vibrate` também, que tem exatamente o mesmo formato de bug esperando
 * alguém desmarcar "Vibração" no iPhone.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Conteudo = Record<string, unknown>;
const agendados: Conteudo[] = [];

vi.mock("expo-notifications", () => ({
  setNotificationHandler: vi.fn(),
  scheduleNotificationAsync: vi.fn(async ({ content }: { content: Conteudo }) => {
    agendados.push(content);
    return `notif-${agendados.length}`;
  }),
  setNotificationChannelAsync: vi.fn(async () => {}),
  deleteNotificationChannelAsync: vi.fn(async () => {}),
  AndroidImportance: { MAX: 5, HIGH: 4, DEFAULT: 3 },
  AndroidNotificationVisibility: { PUBLIC: 1 },
  AndroidNotificationPriority: { MAX: "max" },
  SchedulableTriggerInputTypes: {
    DAILY: "daily",
    WEEKLY: "weekly",
    DATE: "date",
  },
}));

vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));

vi.mock("../lib/alarm-countdown-notifier", () => ({
  setupCountdownChannel: vi.fn(async () => {}),
}));

import { scheduleAlarmNotification } from "../lib/notifications-utils";
import type { Alarm } from "../lib/app-context";

const alarme = (over: Partial<Alarm>): Alarm =>
  ({
    id: "a1",
    time: "08:00",
    description: "Remédio",
    repeat: "daily",
    enabled: true,
    sound: true,
    vibration: true,
    ...over,
  }) as Alarm;

/** Chaves presentes no objeto cujo valor é undefined — as que quebram a ponte. */
const chavesUndefined = (o: Conteudo): string[] =>
  Object.keys(o).filter((k) => o[k] === undefined);

beforeEach(() => {
  agendados.length = 0;
});

describe("conteúdo da notificação — nenhuma chave undefined", () => {
  const casos: [string, Partial<Alarm>][] = [
    ["som e vibração ligados", { sound: true, vibration: true }],
    ["sem som", { sound: false, vibration: true }],
    ["sem vibração", { sound: true, vibration: false }],
    ["sem som e sem vibração", { sound: false, vibration: false }],
    ["campos ausentes (alarme antigo)", { sound: undefined, vibration: undefined }],
  ];

  for (const [nome, over] of casos) {
    it(`${nome}: não manda chave valendo undefined`, async () => {
      await scheduleAlarmNotification(alarme(over));

      expect(agendados.length, "não agendou nada").toBeGreaterThan(0);
      for (const conteudo of agendados) {
        expect(
          chavesUndefined(conteudo),
          `estas chaves vão para a ponte valendo undefined e o iOS recusa o ` +
            `agendamento inteiro: ${chavesUndefined(conteudo).join(", ")}`
        ).toEqual([]);
      }
    });
  }
});

describe("conteúdo da notificação — a chave some, não vira undefined", () => {
  it("sem som: a chave 'sound' não existe no objeto", async () => {
    await scheduleAlarmNotification(alarme({ sound: false }));
    expect(Object.prototype.hasOwnProperty.call(agendados[0], "sound")).toBe(
      false
    );
  });

  it("com som: a chave 'sound' existe e tem valor", async () => {
    await scheduleAlarmNotification(alarme({ sound: true }));
    expect(agendados[0].sound).toBe("defaultCritical");
  });

  it("sem vibração: a chave 'vibrate' não existe no objeto", async () => {
    await scheduleAlarmNotification(alarme({ vibration: false }));
    expect(Object.prototype.hasOwnProperty.call(agendados[0], "vibrate")).toBe(
      false
    );
  });
});

describe("interruptionLevel — contrato dos Critical Alerts", () => {
  // Estava em ios-critical-alerts.test.ts como regex na fonte, que só
  // conseguia ver o literal `interruptionLevel: 'critical'`. Aqui é por
  // execução: vale para qualquer forma que o código tome, e ainda pega a
  // regressão que aquele teste existia para pegar (o caso COM som voltar a
  // 'timeSensitive', que fura Foco mas NÃO a chavinha de silencioso).
  it("com som: 'critical' — é o que fura o silencioso", async () => {
    await scheduleAlarmNotification(alarme({ sound: true }));
    expect(agendados[0].interruptionLevel).toBe("critical");
  });

  it("sem som: 'timeSensitive' — pedir crítico sem som derrubava o agendamento", async () => {
    await scheduleAlarmNotification(alarme({ sound: false }));
    expect(agendados[0].interruptionLevel).toBe("timeSensitive");
  });

  it("alarme antigo (chave ausente) é tratado como COM som", async () => {
    await scheduleAlarmNotification(alarme({ sound: undefined }));
    expect(agendados[0].interruptionLevel).toBe("critical");
    expect(agendados[0].sound).toBe("defaultCritical");
  });
});

describe("o alarme silencioso continua sendo um alarme", () => {
  it("sem som ainda agenda — não pode sumir do aparelho", async () => {
    const id = await scheduleAlarmNotification(alarme({ sound: false }));
    expect(id, "devolveu null: a função lançou e o catch engoliu").not.toBeNull();
  });

  it("todas as repetições agendam sem som", async () => {
    for (const [repeat, esperado] of [
      ["daily", 1],
      ["weekdays", 5],
      ["weekends", 2],
    ] as const) {
      agendados.length = 0;
      const id = await scheduleAlarmNotification(
        alarme({ repeat, sound: false })
      );
      expect(id, `${repeat} devolveu null`).not.toBeNull();
      expect(agendados.length, `${repeat} agendou errado`).toBe(esperado);
    }
  });
});
