// tests/alarm-sync-alarmkit-startup.test.ts
/**
 * syncAlarmsOnStartup decide "este alarme está faltando?" contando
 * notificações por alarmId. Um alarme agendado pelo AlarmKit nunca aparece
 * nessa contagem — perguntar lá faria TODO alarme parecer faltando em toda
 * abertura do app no iOS 26+, a mesma classe de bug que gerou ~15-20
 * notificações simultâneas no iPhone, agora do lado do AlarmKit.
 *
 * Por isso, quando o AlarmKit está ativo, a pergunta tem que ir a ele
 * (listAlarmKitAlarmIds), não às notificações.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();

vi.mock("@/lib/_core/auth", () => ({
  getUserInfo: vi.fn(async () => ({ openId: "u1" })),
}));

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async (k: string) => store.get(k) ?? null),
    setItem: vi.fn(async (k: string, v: string) => {
      store.set(k, v);
    }),
  },
}));

// Nenhuma notificação agendada — o alarme, se existir, está só no AlarmKit.
vi.mock("expo-notifications", () => ({
  getAllScheduledNotificationsAsync: vi.fn(async () => []),
  cancelAllScheduledNotificationsAsync: vi.fn(async () => {}),
}));

vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));

vi.mock("../lib/native-alarm-manager", () => ({
  scheduleNativeAlarm: vi.fn(async () => []),
  cancelNativeAlarm: vi.fn(async () => {}),
  cancelAllNativeAlarms: vi.fn(async () => {}),
  isNativeAlarmAvailable: false,
}));

const cancelScheduledAlarmNotifications = vi.fn(async () => 0);
vi.mock("../lib/notifications-utils", () => ({
  scheduleAlarmNotification: vi.fn(async () => "notif-1"),
  cancelScheduledAlarmNotifications: (...a: unknown[]) =>
    cancelScheduledAlarmNotifications(...(a as [])),
}));

let listaAlarmKit: string[] = [];
const agendarAlarmKit = vi.fn(async () => {});
vi.mock("../lib/ios-alarm-kit", () => ({
  isAlarmKitAvailable: () => true,
  scheduleAlarmKitAlarm: (...a: unknown[]) => agendarAlarmKit(...(a as [])),
  cancelAlarmKitAlarm: vi.fn(async () => {}),
  listAlarmKitAlarmIds: () => listaAlarmKit,
}));

import { syncAlarmsOnStartup } from "../lib/alarm-sync";

const ALARME = {
  id: "a1",
  time: "08:00",
  description: "Losartana",
  enabled: true,
  repeat: "daily",
} as never;

beforeEach(() => {
  store.clear();
  // Versão já gravada: forcarReagendamento fica false, então só o teste do
  // AlarmKit decide se reagenda ou não.
  store.set("vigora:alarm-schedule-version", "2");
  listaAlarmKit = [];
  vi.clearAllMocks();
});

describe("syncAlarmsOnStartup com AlarmKit ativo", () => {
  it("alarme já presente na lista do AlarmKit não é reagendado", async () => {
    listaAlarmKit = ["a1"];
    await syncAlarmsOnStartup([ALARME]);
    expect(agendarAlarmKit).not.toHaveBeenCalled();
  });

  it("alarme ausente da lista do AlarmKit é reagendado", async () => {
    listaAlarmKit = [];
    await syncAlarmsOnStartup([ALARME]);
    expect(agendarAlarmKit).toHaveBeenCalled();
  });

  it("versão de agendamento nova força reagendamento mesmo já presente", async () => {
    store.delete("vigora:alarm-schedule-version");
    listaAlarmKit = ["a1"];
    await syncAlarmsOnStartup([ALARME]);
    expect(agendarAlarmKit).toHaveBeenCalled();
  });
});
