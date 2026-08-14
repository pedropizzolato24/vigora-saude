/**
 * alarm-sound-off.test.ts
 *
 * Desmarcar "Som" no formulário do alarme fazia o alarme sumir no iPhone —
 * nenhuma notificação, como se o alarme não existisse. Num app de lembrete de
 * medicação para idoso, alarme que não aparece é falha de segurança, não de
 * conforto.
 *
 * Causa: `interruptionLevel: 'critical'` era setado SEMPRE, enquanto o som
 * virava undefined. Um alerta crítico sem som é contraditório — `critical`
 * existe para furar a chavinha do silencioso TOCANDO som (a própria API da
 * Apple é toda em torno disso: defaultCriticalSound, criticalSoundNamed). Com
 * som e sem som, essa é a única variável que muda no conteúdo agendado.
 *
 * Regra: quem desliga o som quer silêncio, não quer perder o alarme. Sem som,
 * o alarme continua sendo agendado e sobe para 'timeSensitive', que ainda fura
 * Foco/Não Perturbe sem depender de tocar nada.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type ScheduleArg = { content: Record<string, unknown> };
const scheduleNotificationAsync = vi.fn(async (_arg: ScheduleArg) => "notif-1");

vi.mock("expo-notifications", () => ({
  setNotificationHandler: vi.fn(),
  scheduleNotificationAsync: (...a: unknown[]) =>
    scheduleNotificationAsync(...(a as [ScheduleArg])),
  cancelScheduledNotificationAsync: vi.fn(async () => {}),
  cancelAllScheduledNotificationsAsync: vi.fn(async () => {}),
  setNotificationChannelAsync: vi.fn(async () => {}),
  deleteNotificationChannelAsync: vi.fn(async () => {}),
  getPermissionsAsync: vi.fn(async () => ({ status: "granted" })),
  requestPermissionsAsync: vi.fn(async () => ({ status: "granted" })),
  AndroidImportance: { MAX: 5, HIGH: 4 },
  AndroidNotificationVisibility: { PUBLIC: 1 },
  AndroidNotificationPriority: { MAX: "max" },
  SchedulableTriggerInputTypes: { DAILY: "daily", WEEKLY: "weekly", DATE: "date" },
}));

vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
vi.mock("../lib/alarm-countdown-notifier", () => ({
  setupCountdownChannel: vi.fn(async () => {}),
}));

const baseAlarm = {
  id: "a1",
  time: "08:00",
  description: "Losartana",
  enabled: true,
  repeat: "daily",
  customDays: [],
  vibration: true,
};

async function scheduleWith(sound: boolean) {
  scheduleNotificationAsync.mockClear();
  const { scheduleAlarmNotification } = await import("../lib/notifications-utils");
  await scheduleAlarmNotification({ ...baseAlarm, sound } as never);
  return scheduleNotificationAsync.mock.calls[0]?.[0]?.content ?? {};
}

beforeEach(() => {
  vi.resetModules();
});

describe("alarme com Som desmarcado (iOS)", () => {
  it("continua sendo agendado", async () => {
    const content = await scheduleWith(false);
    expect(scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    expect(content).toBeTruthy();
  });

  it("não pede alerta crítico sem ter som para tocar", async () => {
    const content = await scheduleWith(false);
    expect(content.sound).toBeUndefined();
    expect(content.interruptionLevel).not.toBe("critical");
  });

  it("ainda fura Foco/Não Perturbe via timeSensitive", async () => {
    const content = await scheduleWith(false);
    expect(content.interruptionLevel).toBe("timeSensitive");
  });

  it("com Som marcado segue crítico com som crítico (não regride)", async () => {
    const content = await scheduleWith(true);
    expect(content.sound).toBe("defaultCritical");
    expect(content.interruptionLevel).toBe("critical");
  });
});
