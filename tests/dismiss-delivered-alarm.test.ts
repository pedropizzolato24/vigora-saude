/**
 * dismiss-delivered-alarm.test.ts
 *
 * No iOS a notificação do alarme ficava na Central DEPOIS de o idoso desligar
 * o alarme pela tela cheia — e tocar nela reabria a alarm-ring de um disparo
 * já respondido, que monta no estado escalado ("Mensagem de emergência enviada
 * para seus contatos"). É falso, e é dito pro idoso.
 *
 * O Android nunca teve o problema porque quem apaga a notificação lá é o
 * serviço nativo, dentro de stopNativeAlarm — que é no-op no iOS.
 *
 * Filtramos por `data.alarmId` em vez de usar `alarm.notificationId` porque
 * repeat weekdays/weekends/custom agenda 5/2/N requests e só o primeiro id é
 * persistido: por id, os outros dias continuariam pendurados.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const presented: { request: { identifier: string; content: { data: unknown } } }[] = [];
const dismissNotificationAsync = vi.fn(async (_id: string) => {});

vi.mock("expo-notifications", () => ({
  setNotificationHandler: vi.fn(),
  getPresentedNotificationsAsync: vi.fn(async () => presented),
  dismissNotificationAsync: (...args: unknown[]) =>
    dismissNotificationAsync(...(args as [string])),
  AndroidImportance: { MAX: 5, HIGH: 4 },
  AndroidNotificationVisibility: { PUBLIC: 1 },
  AndroidNotificationPriority: { MAX: "max" },
  SchedulableTriggerInputTypes: { DAILY: "daily", WEEKLY: "weekly", DATE: "date" },
}));

vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
}));

import { dismissDeliveredAlarmNotification } from "../lib/notifications-utils";

const notif = (identifier: string, data: unknown) => ({
  request: { identifier, content: { data } },
});

beforeEach(() => {
  presented.length = 0;
  dismissNotificationAsync.mockClear();
});

describe("dismissDeliveredAlarmNotification", () => {
  it("remove a notificação entregue do alarme respondido", async () => {
    presented.push(notif("n1", { alarmId: "a1" }));

    await dismissDeliveredAlarmNotification("a1");

    expect(dismissNotificationAsync).toHaveBeenCalledWith("n1");
  });

  it("não mexe em notificação de outro alarme nem em notificação sem alarmId", async () => {
    presented.push(
      notif("n1", { alarmId: "a1" }),
      notif("n2", { alarmId: "a2" }),
      notif("n3", { type: "caregiver_alert" }),
    );

    await dismissDeliveredAlarmNotification("a1");

    expect(dismissNotificationAsync).toHaveBeenCalledTimes(1);
    expect(dismissNotificationAsync).toHaveBeenCalledWith("n1");
  });

  it("remove TODAS as entregues do mesmo alarme (weekdays agenda uma por dia)", async () => {
    presented.push(notif("n1", { alarmId: "a1" }), notif("n2", { alarmId: "a1" }));

    await dismissDeliveredAlarmNotification("a1");

    expect(dismissNotificationAsync).toHaveBeenCalledTimes(2);
  });

  it("engole erro do sistema sem derrubar o fluxo do dismiss", async () => {
    presented.push(notif("n1", { alarmId: "a1" }));
    dismissNotificationAsync.mockRejectedValueOnce(new Error("boom"));

    await expect(dismissDeliveredAlarmNotification("a1")).resolves.toBeUndefined();
  });
});

describe("alarm-ring chama a limpeza ao responder", () => {
  const alarmRing = readFileSync(
    join(__dirname, "..", "app", "alarm-ring.tsx"),
    "utf8",
  );

  it("importa dismissDeliveredAlarmNotification", () => {
    expect(alarmRing).toMatch(/dismissDeliveredAlarmNotification/);
  });

  it("chama no dismiss E na soneca — os dois encerram o disparo atual", () => {
    const calls = alarmRing.match(/dismissDeliveredAlarmNotification\(alarmId\)/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(2);
  });
});
