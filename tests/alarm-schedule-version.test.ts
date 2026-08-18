/**
 * alarm-schedule-version.test.ts
 *
 * Corrigir o agendador não conserta o que já está agendado. No iOS o startup só
 * reagenda quando NÃO existe notificação para o alarme — uma notificação errada
 * conta como presente, então o bug da convenção de dias (domingo tocando na
 * segunda) sobreviveria à atualização até o usuário editar e salvar o alarme na
 * mão. Público de 60+ com alarme de remédio não pode depender disso.
 *
 * Daí a versão de agendamento: quando a versão gravada não bate com a atual, o
 * startup reagenda tudo UMA vez e grava a nova. Boots seguintes voltam ao
 * caminho normal (só o que está faltando).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

let currentUser: { openId: string } | null = { openId: "u1" };
const store = new Map<string, string>();

vi.mock("@/lib/_core/auth", () => ({
  getUserInfo: vi.fn(async () => currentUser),
}));

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async (k: string) => store.get(k) ?? null),
    setItem: vi.fn(async (k: string, v: string) => {
      store.set(k, v);
    }),
  },
}));

// Alarme 'a1' JÁ tem notificação agendada — o caminho que não reagendava.
vi.mock("expo-notifications", () => ({
  getAllScheduledNotificationsAsync: vi.fn(async () => [
    { identifier: "n1", content: { data: { alarmId: "a1" } } },
  ]),
  cancelAllScheduledNotificationsAsync: vi.fn(async () => {}),
}));

vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));

vi.mock("../lib/native-alarm-manager", () => ({
  scheduleNativeAlarm: vi.fn(async () => ["uid-1"]),
  cancelNativeAlarm: vi.fn(async () => {}),
  cancelAllNativeAlarms: vi.fn(async () => {}),
  isNativeAlarmAvailable: false,
}));

const scheduleAlarmNotification = vi.fn(async () => "notif-1");
const cancelScheduledAlarmNotifications = vi.fn(async () => 1);
vi.mock("../lib/notifications-utils", () => ({
  scheduleAlarmNotification: (...a: unknown[]) =>
    scheduleAlarmNotification(...(a as [])),
  cancelScheduledAlarmNotifications: (...a: unknown[]) =>
    cancelScheduledAlarmNotifications(...(a as [])),
  cancelAlarmNotification: vi.fn(async () => {}),
}));

import { syncAlarmsOnStartup } from "../lib/alarm-sync";

const ALARME = {
  id: "a1",
  time: "08:00",
  description: "Losartana",
  enabled: true,
  repeat: "custom",
  customDays: [0],
} as never;

beforeEach(() => {
  store.clear();
  currentUser = { openId: "u1" };
  scheduleAlarmNotification.mockClear();
  cancelScheduledAlarmNotifications.mockClear();
});

describe("reagendamento único por versão de agendamento", () => {
  it("versão ausente (app recém-atualizado): reagenda mesmo já tendo notificação", async () => {
    await syncAlarmsOnStartup([ALARME]);

    expect(scheduleAlarmNotification).toHaveBeenCalledTimes(1);
    // Sai antes de reagendar — reagendar por cima é como o acúmulo começou.
    expect(cancelScheduledAlarmNotifications).toHaveBeenCalledWith("a1");
  });

  it("segundo boot: versão já gravada, não reagenda de novo", async () => {
    await syncAlarmsOnStartup([ALARME]);
    scheduleAlarmNotification.mockClear();

    await syncAlarmsOnStartup([ALARME]);

    expect(scheduleAlarmNotification).not.toHaveBeenCalled();
  });

  it("sem conta logada não grava versão — o reagendamento ainda deve acontecer depois", async () => {
    currentUser = null;
    await syncAlarmsOnStartup([ALARME]);

    currentUser = { openId: "u1" };
    await syncAlarmsOnStartup([ALARME]);

    expect(scheduleAlarmNotification).toHaveBeenCalledTimes(1);
  });
});
