/**
 * alarm-notification-orphans.test.ts
 *
 * No iPhone chegaram ~15-20 notificações de uma vez, num horário sem relação
 * com o alarme configurado, de um alarme que nem existia mais (17/08/2026).
 *
 * Duas fontes de acúmulo, as duas por tratar como UMA o que são N:
 *
 * 1. `weekdays`/`weekends`/`custom` agendam 5/2/N requests, mas só o PRIMEIRO
 *    id é guardado em alarm.notificationId. cancelFullAlarm cancelava esse um
 *    e deixava os outros agendados para sempre — cada edição/exclusão vazava
 *    N-1.
 *
 * 2. Pior: syncAlarmsOnStartup DESCARTAVA o retorno de scheduleFullAlarm, e
 *    decidia "está faltando?" pelo notificationId guardado, que continuava
 *    apontando para o agendamento antigo. A cada abertura do app o alarme
 *    parecia faltando e era reagendado — mais N notificações, sem limite.
 *
 * A correção troca "o id que eu guardei" por "tudo que tem este alarmId", que
 * é a única pergunta que corresponde à realidade. Isso também LIMPA o que já
 * ficou órfão nos aparelhos, sem precisar reinstalar.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Agendada = {
  identifier: string;
  content: { data?: { alarmId?: string } };
};

let agendadas: Agendada[] = [];
const canceladas: string[] = [];

vi.mock("expo-notifications", () => ({
  setNotificationHandler: vi.fn(),
  getAllScheduledNotificationsAsync: vi.fn(async () => agendadas),
  cancelScheduledNotificationAsync: vi.fn(async (id: string) => {
    canceladas.push(id);
    agendadas = agendadas.filter((n) => n.identifier !== id);
  }),
  setNotificationChannelAsync: vi.fn(async () => {}),
  deleteNotificationChannelAsync: vi.fn(async () => {}),
  scheduleNotificationAsync: vi.fn(async () => "novo-id"),
  AndroidImportance: { MAX: 5, HIGH: 4, DEFAULT: 3 },
  AndroidNotificationVisibility: { PUBLIC: 1 },
  AndroidNotificationPriority: { MAX: "max" },
  SchedulableTriggerInputTypes: { DAILY: "daily", WEEKLY: "weekly", DATE: "date" },
}));

vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));

vi.mock("../lib/alarm-countdown-notifier", () => ({
  setupCountdownChannel: vi.fn(async () => {}),
}));

import { cancelScheduledAlarmNotifications } from "../lib/notifications-utils";

const notif = (identifier: string, alarmId?: string): Agendada => ({
  identifier,
  content: { data: alarmId ? { alarmId } : undefined },
});

beforeEach(() => {
  agendadas = [];
  canceladas.length = 0;
});

describe("cancelar todas as notificações de um alarme", () => {
  it("cancela as 5 de um alarme de dias úteis, não só a primeira", async () => {
    agendadas = [
      notif("n1", "a1"),
      notif("n2", "a1"),
      notif("n3", "a1"),
      notif("n4", "a1"),
      notif("n5", "a1"),
    ];

    const n = await cancelScheduledAlarmNotifications("a1");

    expect(n).toBe(5);
    expect(canceladas.sort()).toEqual(["n1", "n2", "n3", "n4", "n5"]);
  });

  it("não encosta nas notificações de outro alarme", async () => {
    agendadas = [notif("n1", "a1"), notif("n2", "outro"), notif("n3", "a1")];

    await cancelScheduledAlarmNotifications("a1");

    expect(canceladas.sort()).toEqual(["n1", "n3"]);
    expect(agendadas.map((n) => n.identifier)).toEqual(["n2"]);
  });

  it("ignora notificação sem alarmId (não é nossa para cancelar)", async () => {
    agendadas = [notif("n1"), notif("n2", "a1")];

    await cancelScheduledAlarmNotifications("a1");

    expect(canceladas).toEqual(["n2"]);
  });

  it("alarme sem nada agendado: não cancela nada e não quebra", async () => {
    expect(await cancelScheduledAlarmNotifications("a1")).toBe(0);
    expect(canceladas).toEqual([]);
  });
});

describe("o contrato que impedia a limpeza", () => {
  it("toda notificação de alarme carrega data.alarmId", () => {
    // É a chave que torna a limpeza possível. Sem ela só restaria o id único
    // guardado, que é justamente o que deixou os órfãos para trás.
    const fonte = require("node:fs").readFileSync(
      require("node:path").join(__dirname, "..", "lib/notifications-utils.ts"),
      "utf8"
    );
    expect(fonte).toMatch(/alarmId:\s*alarm\.id/);
  });
});
