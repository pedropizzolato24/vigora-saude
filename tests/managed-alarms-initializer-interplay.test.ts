/**
 * REPLACE_ALARMS muda a lista de alarmes e, com ela, a assinatura do
 * AlarmSyncInitializer, que então roda syncAlarmsOnStartup(state.alarms). Este
 * teste trava o que isso faz sobre alarmes que o aplicador JÁ agendou: nada de
 * agendamento em dobro. Ver "Regras de desenho", item 5, da Tarefa 12.
 */
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

let alarmKitDisponivel = false;
let nativoDisponivel = false;
let idsNoAlarmKit: string[] = [];
let notificacoesAgendadas: { content: { data: { alarmId: string } } }[] = [];
const armazenamento = new Map<string, string>();
const agendarAlarmKit = vi.fn(async (_a?: unknown) => {});
const cancelarAlarmKit = vi.fn(async (_id?: string) => {});
const agendarNotificacao = vi.fn(async (_a?: unknown) => "notif-x" as string | null);
const cancelarNotificacoes = vi.fn(async (_id?: string) => 0);
const agendarNativo = vi.fn(async (a: { id: string }) => [`vigora_${a.id}`]);

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (k: string) => armazenamento.get(k) ?? null,
    setItem: async (k: string, v: string) => void armazenamento.set(k, v),
  },
}));
vi.mock("../lib/ios-alarm-kit", () => ({
  isAlarmKitAvailable: () => alarmKitDisponivel,
  scheduleAlarmKitAlarm: (a: unknown) => agendarAlarmKit(a),
  cancelAlarmKitAlarm: (id: string) => cancelarAlarmKit(id),
  listAlarmKitAlarmIds: () => idsNoAlarmKit,
}));
vi.mock("../lib/notifications-utils", () => ({
  scheduleAlarmNotification: (a: unknown) => agendarNotificacao(a),
  cancelScheduledAlarmNotifications: (id: string) => cancelarNotificacoes(id),
}));
vi.mock("../lib/native-alarm-manager", () => ({
  get isNativeAlarmAvailable() {
    return nativoDisponivel;
  },
  scheduleNativeAlarm: (a: { id: string }) => agendarNativo(a),
  cancelNativeAlarm: vi.fn(async () => {}),
  cancelAllNativeAlarms: vi.fn(async () => {}),
}));
vi.mock("expo-notifications", () => ({
  getAllScheduledNotificationsAsync: async () => notificacoesAgendadas,
  cancelAllScheduledNotificationsAsync: async () => {},
}));
vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
vi.mock("@/lib/_core/auth", () => ({
  getUserInfo: async () => ({ openId: "u1" }),
  getSessionToken: async () => "t",
}));

import { syncAlarmsOnStartup } from "../lib/alarm-sync";
import type { Alarm } from "../lib/app-context";

const A = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
const B = "9b2c4d6e-1a2b-4c3d-8e9f-0a1b2c3d4e5f";

const alarme = (id: string): Alarm => ({
  id,
  time: "08:00",
  description: "Remédio",
  repeat: "daily",
  enabled: true,
  sound: true,
  vibration: true,
});

let logSpy: MockInstance;

afterEach(() => {
  logSpy.mockRestore();
});

beforeEach(async () => {
  // O alarm-sync loga cada passo; o teste mede só as chamadas de agendamento.
  logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  alarmKitDisponivel = false;
  nativoDisponivel = false;
  idsNoAlarmKit = [];
  notificacoesAgendadas = [];
  // A primeira rodada de syncAlarmsOnStartup grava a versão do agendamento e
  // reagenda tudo uma vez. Rodar com lista vazia consome essa migração, e o
  // teste mede só o comportamento normal.
  armazenamento.clear();
  await syncAlarmsOnStartup([]);
  vi.clearAllMocks();
});

describe("syncAlarmsOnStartup depois de o aplicador já ter agendado", () => {
  it("iOS 26+: o alarme já está no AlarmKit, então não agenda de novo", async () => {
    alarmKitDisponivel = true;
    idsNoAlarmKit = [A, B];

    await syncAlarmsOnStartup([alarme(A), alarme(B)]);

    expect(agendarAlarmKit).not.toHaveBeenCalled();
    expect(agendarNotificacao).not.toHaveBeenCalled();
    expect(cancelarAlarmKit).not.toHaveBeenCalled();
  });

  it("iOS abaixo de 26: já há notificação por alarmId, então não agenda de novo", async () => {
    notificacoesAgendadas = [{ content: { data: { alarmId: A } } }, { content: { data: { alarmId: B } } }];

    await syncAlarmsOnStartup([alarme(A), alarme(B)]);

    expect(agendarNotificacao).not.toHaveBeenCalled();
  });

  it("Android: uma chamada por alarme, com uid determinístico (substitui, não duplica)", async () => {
    nativoDisponivel = true;

    await syncAlarmsOnStartup([alarme(A), alarme(B)]);

    expect(agendarNativo).toHaveBeenCalledTimes(2);
    expect(agendarNativo.mock.calls.map((c) => c[0].id).sort()).toEqual([A, B].sort());
  });

  it("a varredura de órfãos só cancela o que NÃO está na lista", async () => {
    alarmKitDisponivel = true;
    idsNoAlarmKit = [A, "removido-pelo-cuidador"];

    await syncAlarmsOnStartup([alarme(A)]);

    expect(cancelarAlarmKit).toHaveBeenCalledTimes(1);
    expect(cancelarAlarmKit).toHaveBeenCalledWith("removido-pelo-cuidador");
  });
});
