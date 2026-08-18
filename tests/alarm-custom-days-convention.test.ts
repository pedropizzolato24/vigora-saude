/**
 * alarm-custom-days-convention.test.ts
 *
 * Relatado por usuária de teste (17/08/2026): alarme marcado para repetir todo
 * DOMINGO tocava na SEGUNDA, no horário certo.
 *
 * `customDays` é gravado pela UI como 0=Domingo — a mesma convenção do
 * `getDay()` do JS. Confirmam isso o seletor (`WEEKDAYS` em app/(tabs)/alarms.tsx),
 * o rótulo do card (`DAY_ABBR` em components/alarm-card.tsx) e o
 * `alarm-fire-times.ts`, que pré-registra o disparo no servidor.
 *
 * Os DOIS agendadores, porém, liam o mesmo array como 0=Segunda, então todo dia
 * escolhido disparava exatamente um dia depois — domingo→segunda, segunda→terça.
 * Não tem nada a ver com fuso: acontece igual no Brasil.
 *
 * Este teste trava a convenção nos dois caminhos de agendamento de uma vez.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Trigger = Record<string, unknown>;
const triggers: Trigger[] = [];

vi.mock("expo-notifications", () => ({
  setNotificationHandler: vi.fn(),
  scheduleNotificationAsync: vi.fn(async ({ trigger }: { trigger: Trigger }) => {
    triggers.push(trigger);
    return `notif-${triggers.length}`;
  }),
  setNotificationChannelAsync: vi.fn(async () => {}),
  deleteNotificationChannelAsync: vi.fn(async () => {}),
  AndroidImportance: { MAX: 5, HIGH: 4, DEFAULT: 3 },
  AndroidNotificationVisibility: { PUBLIC: 1 },
  AndroidNotificationPriority: { MAX: "max" },
  SchedulableTriggerInputTypes: { DAILY: "daily", WEEKLY: "weekly", DATE: "date" },
}));

vi.mock("react-native", () => ({
  Platform: { OS: "android" },
  NativeModules: { ExpoAlarmModule: {} },
}));

type AlarmeNativo = { uid: string; day: Date };
const agendados: AlarmeNativo[] = [];

// Mockar o bridge (e não `expo-alarm-module`) é o que torna este teste possível:
// vi.mock não intercepta require, e no Node a lib real resolve para um build
// commonjs que nem parseia.
vi.mock("../lib/_core/native-alarm-bridge", () => ({
  scheduleAlarmNative: async (a: AlarmeNativo) => {
    agendados.push(a);
  },
  removeAlarmNative: async () => {},
  removeAllAlarmsNative: async () => {},
  stopAlarmNative: async () => {},
  alarmNativeModule: null,
}));

vi.mock("../lib/alarm-countdown-notifier", () => ({
  setupCountdownChannel: vi.fn(async () => {}),
}));

import { scheduleAlarmNotification } from "../lib/notifications-utils";
import { scheduleNativeAlarm } from "../lib/native-alarm-manager";
import type { Alarm } from "../lib/app-context";

const alarme = (customDays: number[]): Alarm =>
  ({
    id: "a1",
    time: "08:00",
    description: "Remédio",
    repeat: "custom",
    customDays,
    enabled: true,
    sound: true,
    vibration: true,
  }) as Alarm;

// customDays (0=Dom) -> weekday do expo (1=Dom..7=Sáb)
const NOMES = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

beforeEach(() => {
  triggers.length = 0;
  agendados.length = 0;
});

describe("customDays usa 0=Domingo nos dois agendadores", () => {
  for (let dia = 0; dia < 7; dia++) {
    it(`notificação: ${NOMES[dia]} (customDays=[${dia}]) agenda no próprio ${NOMES[dia]}`, async () => {
      await scheduleAlarmNotification(alarme([dia]));

      expect(triggers.length, "não agendou nada").toBe(1);
      // expo: 1=Domingo..7=Sábado, então o esperado é o índice JS + 1.
      expect(triggers[0].weekday).toBe(dia + 1);
    });
  }

  for (let dia = 0; dia < 7; dia++) {
    it(`alarme nativo: ${NOMES[dia]} (customDays=[${dia}]) cai num ${NOMES[dia]}`, async () => {
      await scheduleNativeAlarm(alarme([dia]));

      expect(agendados.length, "não agendou nada").toBe(1);
      expect(agendados[0].day.getDay()).toBe(dia);
    });
  }
});

/**
 * weekdays/weekends não leem customDays — trazem a lista de dias no próprio
 * agendador. Eram exatamente os call sites que a correção da convenção mexeu e
 * que nenhum teste cobria.
 */
describe("weekdays e weekends caem nos dias certos", () => {
  const repetindo = (repeat: Alarm["repeat"]): Alarm =>
    ({ ...alarme([]), repeat }) as Alarm;

  it("notificação: weekdays = segunda a sexta", async () => {
    await scheduleAlarmNotification(repetindo("weekdays"));
    // expo: 1=Dom, então segunda a sexta é 2..6.
    expect(triggers.map((t) => t.weekday).sort()).toEqual([2, 3, 4, 5, 6]);
  });

  it("notificação: weekends = sábado e domingo", async () => {
    await scheduleAlarmNotification(repetindo("weekends"));
    expect(triggers.map((t) => t.weekday).sort()).toEqual([1, 7]);
  });

  it("alarme nativo: weekdays = segunda a sexta", async () => {
    await scheduleNativeAlarm(repetindo("weekdays"));
    expect(agendados.map((a: AlarmeNativo) => a.day.getDay()).sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it("alarme nativo: weekends = sábado e domingo", async () => {
    await scheduleNativeAlarm(repetindo("weekends"));
    expect(agendados.map((a: AlarmeNativo) => a.day.getDay()).sort()).toEqual([0, 6]);
  });
});
