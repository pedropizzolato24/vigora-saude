/**
 * android-alarm-channel-silent.test.ts
 *
 * Desmarcar "Som"/"Vibração" no formulário não tinha efeito no Android: o
 * alarme tocava 1-2s até o TTS pegar o foco de áudio (medido no aparelho em
 * 14/08/2026, num APK que JÁ tinha o fix do serviço nativo — prova de que a
 * fonte do som era outra).
 *
 * Causa: no Android 8+ som e vibração são propriedades do CANAL, não da
 * notificação. `content.sound`/`content.vibrate` são ignorados pelo sistema, e
 * todos os 5 pontos de agendamento mandavam para o mesmo canal `vigora-alarms`,
 * criado com `sound: 'alarm_notification.wav'` e `vibrationPattern`.
 *
 * O som do canal também é imutável depois de criado, então não dá para ter um
 * canal só: são 4 combinações (som × vibração).
 *
 * O teste afirma o INVARIANTE (o canal que o alarme usa não pode ter som),
 * não que a flag foi repassada — foi exatamente essa distinção que deixou o
 * bug passar por 7 testes verdes antes.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type ChannelDef = {
  sound?: string | null;
  vibrationPattern?: number[] | null;
  enableVibrate?: boolean;
  importance?: number;
  bypassDnd?: boolean;
};

const channels = new Map<string, ChannelDef>();
const scheduled: { channelId: string }[] = [];

vi.mock("expo-notifications", () => ({
  setNotificationHandler: vi.fn(),
  deleteNotificationChannelAsync: vi.fn(async (id: string) => {
    channels.delete(id);
  }),
  setNotificationChannelAsync: vi.fn(async (id: string, def: ChannelDef) => {
    channels.set(id, def);
  }),
  scheduleNotificationAsync: vi.fn(
    async ({ trigger }: { trigger: { channelId: string } }) => {
      scheduled.push({ channelId: trigger.channelId });
      return `notif-${scheduled.length}`;
    }
  ),
  AndroidImportance: { MAX: 5, HIGH: 4, DEFAULT: 3 },
  AndroidNotificationVisibility: { PUBLIC: 1 },
  AndroidNotificationPriority: { MAX: "max" },
  SchedulableTriggerInputTypes: {
    DAILY: "daily",
    WEEKLY: "weekly",
    DATE: "date",
  },
}));

vi.mock("react-native", () => ({
  Platform: { OS: "android" },
}));

vi.mock("../lib/alarm-countdown-notifier", () => ({
  setupCountdownChannel: vi.fn(async () => {}),
}));

import {
  setupNotificationChannels,
  scheduleAlarmNotification,
} from "../lib/notifications-utils";
import type { Alarm } from "../lib/app-context";

const makeAlarm = (over: Partial<Alarm>): Alarm =>
  ({
    id: "a1",
    time: "08:00",
    description: "Remédio",
    repeat: undefined,
    enabled: true,
    sound: true,
    vibration: true,
    ...over,
  }) as Alarm;

/** Agenda e devolve a definição do canal que o sistema de fato usaria. */
async function channelUsedBy(alarm: Alarm): Promise<ChannelDef> {
  scheduled.length = 0;
  await scheduleAlarmNotification(alarm);
  expect(scheduled.length).toBeGreaterThan(0);
  const def = channels.get(scheduled[0].channelId);
  expect(
    def,
    `canal "${scheduled[0].channelId}" foi usado no agendamento mas nunca foi criado por setupNotificationChannels`
  ).toBeDefined();
  return def!;
}

const hasSound = (c: ChannelDef) => !!c.sound;
const hasVibration = (c: ChannelDef) =>
  c.enableVibrate === true || (c.vibrationPattern?.length ?? 0) > 0;

beforeEach(async () => {
  channels.clear();
  scheduled.length = 0;
  await setupNotificationChannels();
});

describe("canal do alarme — som", () => {
  it("alarme SEM som usa um canal sem som", async () => {
    const c = await channelUsedBy(makeAlarm({ sound: false }));
    expect(hasSound(c)).toBe(false);
  });

  it("alarme COM som usa um canal com som", async () => {
    const c = await channelUsedBy(makeAlarm({ sound: true }));
    expect(hasSound(c)).toBe(true);
  });
});

describe("canal do alarme — vibração", () => {
  it("alarme SEM vibração usa um canal que não vibra", async () => {
    const c = await channelUsedBy(makeAlarm({ vibration: false }));
    expect(hasVibration(c)).toBe(false);
  });

  it("alarme COM vibração usa um canal que vibra", async () => {
    const c = await channelUsedBy(makeAlarm({ vibration: true }));
    expect(hasVibration(c)).toBe(true);
  });
});

describe("canal do alarme — combinações independentes", () => {
  it("sem som mas com vibração: cala o som e mantém a vibração", async () => {
    const c = await channelUsedBy(makeAlarm({ sound: false, vibration: true }));
    expect(hasSound(c)).toBe(false);
    expect(hasVibration(c)).toBe(true);
  });

  it("com som mas sem vibração: mantém o som e cala a vibração", async () => {
    const c = await channelUsedBy(makeAlarm({ sound: true, vibration: false }));
    expect(hasSound(c)).toBe(true);
    expect(hasVibration(c)).toBe(false);
  });

  it("silencioso total não vira o mesmo canal do alarme sonoro", async () => {
    scheduled.length = 0;
    await scheduleAlarmNotification(
      makeAlarm({ sound: false, vibration: false })
    );
    const mudo = scheduled[0].channelId;
    scheduled.length = 0;
    await scheduleAlarmNotification(makeAlarm({ sound: true, vibration: true }));
    expect(mudo).not.toBe(scheduled[0].channelId);
  });
});

describe("canal do alarme — o silêncio não pode custar a entrega", () => {
  it("todo canal de alarme mantém MAX e bypassDnd", async () => {
    for (const [sound, vibration] of [
      [true, true],
      [true, false],
      [false, true],
      [false, false],
    ] as const) {
      const c = await channelUsedBy(makeAlarm({ sound, vibration }));
      expect(c.importance, `som=${sound} vib=${vibration}`).toBe(5);
      expect(c.bypassDnd, `som=${sound} vib=${vibration}`).toBe(true);
    }
  });
});

describe("canal do alarme — todos os tipos de repetição", () => {
  // São 5 pontos de agendamento distintos, cada um com o channelId escrito à
  // mão. Cobrir só 'daily' deixaria 4 deles livres para regredir.
  const casos = [
    { nome: "daily", repeat: "daily" as const, esperado: 1 },
    { nome: "weekdays", repeat: "weekdays" as const, esperado: 5 },
    { nome: "weekends", repeat: "weekends" as const, esperado: 2 },
    { nome: "custom", repeat: "custom" as const, customDays: [0, 2], esperado: 2 },
    // Alarme único é o `else` do agendamento: `repeat` ausente.
    { nome: "uma vez só", repeat: undefined, esperado: 1 },
  ];

  for (const caso of casos) {
    it(`${caso.nome}: nenhum disparo cai em canal com som`, async () => {
      scheduled.length = 0;
      await scheduleAlarmNotification(
        makeAlarm({
          repeat: caso.repeat,
          customDays: caso.customDays,
          sound: false,
        })
      );
      expect(scheduled.length).toBe(caso.esperado);
      for (const s of scheduled) {
        const def = channels.get(s.channelId);
        expect(def, `canal "${s.channelId}" nunca foi criado`).toBeDefined();
        expect(hasSound(def!), `canal "${s.channelId}" toca som`).toBe(false);
      }
    });
  }
});
