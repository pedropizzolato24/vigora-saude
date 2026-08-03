/**
 * alarm-sync-auth-gate.test.ts
 *
 * Defesa em profundidade: agendar alarme exige conta.
 *
 * O agendador não verificava autenticação — reagendava sempre que houvesse
 * alarme habilitado no estado. Combinado com o blob legado global (corrigido
 * em app-state-storage), isso fazia um aparelho DESLOGADO tocar o alarme da
 * última conta que usou o aparelho.
 *
 * A causa primária foi corrigida na origem (deslogado não carrega estado), mas
 * a guarda fica aqui também: agendar alarme é o caminho mais crítico do app e
 * não deve depender de nenhuma outra camada ter feito a coisa certa.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

let currentUser: { openId: string } | null = null;

vi.mock("@/lib/_core/auth", () => ({
  getUserInfo: vi.fn(async () => currentUser),
}));

vi.mock("expo-notifications", () => ({
  getAllScheduledNotificationsAsync: vi.fn(async () => []),
  cancelAllScheduledNotificationsAsync: vi.fn(async () => {}),
}));

vi.mock("react-native", () => ({
  Platform: { OS: "android" },
}));

const scheduleNativeAlarm = vi.fn(async () => ["uid-1"]);
vi.mock("../lib/native-alarm-manager", () => ({
  scheduleNativeAlarm: (...args: unknown[]) => scheduleNativeAlarm(...(args as [])),
  cancelNativeAlarm: vi.fn(async () => {}),
  cancelAllNativeAlarms: vi.fn(async () => {}),
  isNativeAlarmAvailable: true,
}));

const scheduleAlarmNotification = vi.fn(async () => "notif-1");
vi.mock("../lib/notifications-utils", () => ({
  scheduleAlarmNotification: (...args: unknown[]) =>
    scheduleAlarmNotification(...(args as [])),
  cancelAlarmNotification: vi.fn(async () => {}),
}));

import { syncAlarmsOnStartup } from "../lib/alarm-sync";

const ENABLED_ALARM = {
  id: "a1",
  time: "08:00",
  description: "Losartana",
  enabled: true,
  repeat: "daily",
  customDays: [],
} as never;

beforeEach(() => {
  scheduleNativeAlarm.mockClear();
  scheduleAlarmNotification.mockClear();
});

describe("syncAlarmsOnStartup — gate de conta", () => {
  it("não agenda nada quando não há conta logada", async () => {
    currentUser = null;

    await syncAlarmsOnStartup([ENABLED_ALARM]);

    expect(scheduleNativeAlarm).not.toHaveBeenCalled();
    expect(scheduleAlarmNotification).not.toHaveBeenCalled();
  });

  it("agenda normalmente quando há conta logada", async () => {
    currentUser = { openId: "abc123" };

    await syncAlarmsOnStartup([ENABLED_ALARM]);

    expect(scheduleNativeAlarm).toHaveBeenCalled();
  });
});
