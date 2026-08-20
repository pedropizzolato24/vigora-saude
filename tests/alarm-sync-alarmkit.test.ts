// tests/alarm-sync-alarmkit.test.ts
/**
 * Os dois caminhos do iOS nunca podem coexistir para o mesmo alarme: seriam
 * dois disparos para o mesmo remédio. A migração é feita no agendamento —
 * quem entra cancela o outro.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

let alarmKitDisponivel = true;
const agendarAlarmKit = vi.fn(async () => {});
const cancelarAlarmKit = vi.fn(async () => {});
const agendarNotificacao = vi.fn(async () => "notif-1" as string | null);
const cancelarNotificacoes = vi.fn(async () => 0);

vi.mock("../lib/ios-alarm-kit", () => ({
  isAlarmKitAvailable: () => alarmKitDisponivel,
  scheduleAlarmKitAlarm: (...a: unknown[]) => agendarAlarmKit(...(a as [])),
  cancelAlarmKitAlarm: (...a: unknown[]) => cancelarAlarmKit(...(a as [])),
}));

vi.mock("../lib/notifications-utils", () => ({
  scheduleAlarmNotification: (...a: unknown[]) => agendarNotificacao(...(a as [])),
  cancelScheduledAlarmNotifications: (...a: unknown[]) => cancelarNotificacoes(...(a as [])),
}));

vi.mock("../lib/native-alarm-manager", () => ({
  isNativeAlarmAvailable: false,
  scheduleNativeAlarm: vi.fn(async () => []),
  cancelNativeAlarm: vi.fn(async () => {}),
  cancelAllNativeAlarms: vi.fn(async () => {}),
}));

vi.mock("expo-notifications", () => ({
  getAllScheduledNotificationsAsync: vi.fn(async () => []),
  cancelAllScheduledNotificationsAsync: vi.fn(async () => {}),
}));

vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));

vi.mock("@/lib/_core/auth", () => ({
  getUserInfo: vi.fn(async () => ({ openId: "u1" })),
  getSessionToken: vi.fn(async () => "t"),
}));

import { scheduleFullAlarm, cancelFullAlarm } from "../lib/alarm-sync";
import type { Alarm } from "../lib/app-context";

const alarme = (): Alarm =>
  ({
    id: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
    time: "08:00",
    description: "Remédio",
    repeat: "daily",
    enabled: true,
    sound: true,
    vibration: true,
  }) as Alarm;

beforeEach(() => {
  alarmKitDisponivel = true;
  vi.clearAllMocks();
  agendarNotificacao.mockResolvedValue("notif-1");
});

describe("iOS com AlarmKit disponível", () => {
  it("agenda pelo AlarmKit e não pela notificação", async () => {
    await scheduleFullAlarm(alarme());
    expect(agendarAlarmKit).toHaveBeenCalled();
    expect(agendarNotificacao).not.toHaveBeenCalled();
  });

  it("cancela as notificações do alarme — senão ele toca duas vezes", async () => {
    await scheduleFullAlarm(alarme());
    expect(cancelarNotificacoes).toHaveBeenCalledWith(
      "3f2504e0-4f89-11d3-9a0c-0305e82c3301"
    );
  });
});

describe("iOS sem AlarmKit (abaixo de 26, ou indisponível)", () => {
  it("usa a notificação, como hoje", async () => {
    alarmKitDisponivel = false;
    const r = await scheduleFullAlarm(alarme());
    expect(agendarNotificacao).toHaveBeenCalled();
    expect(agendarAlarmKit).not.toHaveBeenCalled();
    expect(r.notificationId).toBe("notif-1");
  });

  it("cancela um alarme do AlarmKit que tenha sobrado", async () => {
    alarmKitDisponivel = false;
    await scheduleFullAlarm(alarme());
    expect(cancelarAlarmKit).toHaveBeenCalledWith(
      "3f2504e0-4f89-11d3-9a0c-0305e82c3301"
    );
  });
});

describe("cancelamento", () => {
  it("derruba os dois caminhos, não importa qual estava ativo", async () => {
    await cancelFullAlarm(alarme());
    expect(cancelarAlarmKit).toHaveBeenCalled();
    expect(cancelarNotificacoes).toHaveBeenCalled();
  });
});
