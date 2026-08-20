// tests/ios-alarm-kit.test.ts
/**
 * A lib só é carregável no iOS 26+, então o require fica isolado na ponte e o
 * teste mocka a PONTE — mesmo motivo documentado em native-alarm-bridge.ts.
 *
 * Dois pontos que o Swift falha em SILÊNCIO e que por isso viram exceção aqui:
 * id que não é UUID (guard let uuid = UUID(uuidString:) → return false) e
 * agendamento recusado (Promise<boolean> false).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const ponte = {
  configure: vi.fn(() => true),
  requestAuthorization: vi.fn(async () => "authorized" as const),
  scheduleRepeatingAlarm: vi.fn(async (_o: {
    hour: number;
    minute: number;
    weekdays: number[];
    launchAppOnDismiss?: boolean;
    doSnoozeIntent?: boolean;
    launchAppOnSnooze?: boolean;
    snoozeButtonLabel?: string;
    soundName?: string;
  }) => true),
  cancelAlarm: vi.fn(async () => true),
  getAllAlarms: vi.fn(() => [] as string[]),
  getLaunchPayload: vi.fn(() => null as { alarmId: string; payload: string | null } | null),
};
let pontePresente = true;

vi.mock("../lib/_core/ios-alarm-kit-bridge", () => ({
  get alarmKit() {
    return pontePresente ? ponte : null;
  },
}));

vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));

import {
  isAlarmKitAvailable,
  alarmKitWeekdays,
  scheduleAlarmKitAlarm,
  cancelAlarmKitAlarm,
  listAlarmKitAlarmIds,
} from "../lib/ios-alarm-kit";
import type { Alarm } from "../lib/app-context";

const alarme = (over: Partial<Alarm> = {}): Alarm =>
  ({
    id: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
    time: "08:30",
    description: "Remédio da pressão",
    repeat: "daily",
    enabled: true,
    sound: true,
    vibration: true,
    ...over,
  }) as Alarm;

beforeEach(() => {
  pontePresente = true;
  vi.clearAllMocks();
  ponte.scheduleRepeatingAlarm.mockResolvedValue(true);
});

describe("disponibilidade", () => {
  it("disponível quando a ponte carregou", () => {
    expect(isAlarmKitAvailable()).toBe(true);
  });

  it("indisponível quando a ponte é null — cai no fallback, não fica sem alarme", () => {
    pontePresente = false;
    expect(isAlarmKitAvailable()).toBe(false);
  });
});

describe("dias da semana — 1=Dom..7=Sáb", () => {
  it("diário vira os 7 dias", () => {
    expect(alarmKitWeekdays(alarme({ repeat: "daily" }))).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("dias úteis: seg-sex (JS 1..5) vira 2..6", () => {
    expect(alarmKitWeekdays(alarme({ repeat: "weekdays" }))).toEqual([2, 3, 4, 5, 6]);
  });

  it("fim de semana: dom+sáb (JS 0,6) vira 1 e 7", () => {
    expect(alarmKitWeekdays(alarme({ repeat: "weekends" }))).toEqual([1, 7]);
  });

  it("personalizado respeita a convenção 0=Dom da UI", () => {
    expect(
      alarmKitWeekdays(alarme({ repeat: "custom", customDays: [0, 3] }))
    ).toEqual([1, 4]);
  });
});

describe("agendamento", () => {
  it("manda hora, minuto e dias, com launchAppOnDismiss", async () => {
    await scheduleAlarmKitAlarm(alarme({ time: "08:30" }));
    const o = ponte.scheduleRepeatingAlarm.mock.calls[0][0];
    expect(o.hour).toBe(8);
    expect(o.minute).toBe(30);
    expect(o.weekdays).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(o.launchAppOnDismiss).toBe(true);
  });

  it("NUNCA liga soneca nativa — ela reagenda sem o JS saber", async () => {
    await scheduleAlarmKitAlarm(alarme());
    const o = ponte.scheduleRepeatingAlarm.mock.calls[0][0];
    expect(o.doSnoozeIntent).toBeFalsy();
    expect(o.launchAppOnSnooze).toBeFalsy();
    expect(o.snoozeButtonLabel).toBeUndefined();
  });

  it("som do alarme vai COM extensão", async () => {
    await scheduleAlarmKitAlarm(alarme({ sound: true }));
    expect(ponte.scheduleRepeatingAlarm.mock.calls[0][0].soundName).toBe("alarm.mp3");
  });

  it("sem som não manda soundName", async () => {
    await scheduleAlarmKitAlarm(alarme({ sound: false }));
    expect(ponte.scheduleRepeatingAlarm.mock.calls[0][0].soundName).toBeUndefined();
  });

  it("id que não é UUID lança — o Swift recusaria em silêncio", async () => {
    await expect(scheduleAlarmKitAlarm(alarme({ id: "abc123" }))).rejects.toThrow(/UUID/);
  });

  it("recusa do nativo (false) vira exceção", async () => {
    ponte.scheduleRepeatingAlarm.mockResolvedValue(false);
    await expect(scheduleAlarmKitAlarm(alarme())).rejects.toThrow();
  });

  it("cancelar repassa o id", async () => {
    await cancelAlarmKitAlarm("3f2504e0-4f89-11d3-9a0c-0305e82c3301");
    expect(ponte.cancelAlarm).toHaveBeenCalledWith("3f2504e0-4f89-11d3-9a0c-0305e82c3301");
  });
});

describe("listAlarmKitAlarmIds", () => {
  it("repassa os ids que a ponte devolve", () => {
    ponte.getAllAlarms.mockReturnValue(["a1", "a2"]);
    expect(listAlarmKitAlarmIds()).toEqual(["a1", "a2"]);
  });

  it("sem ponte, devolve lista vazia em vez de lançar", () => {
    pontePresente = false;
    expect(listAlarmKitAlarmIds()).toEqual([]);
  });
});
