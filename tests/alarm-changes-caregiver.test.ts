/**
 * alarm-changes-caregiver.test.ts
 *
 * recordCaregiverAlarmChanges: o cuidador do acordo mudou a lista do idoso.
 * Grava com o cuidador como autor e avisa SÓ os outros cuidadores vinculados
 * (o autor sabe o que fez). Best-effort: nunca derruba a gravação da lista.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../server/db-alarm-changes", () => ({
  insertAlarmChanges: vi.fn(async () => undefined),
  getRecentAlarmChanges: vi.fn(async () => []),
}));
vi.mock("../server/db-links", () => ({
  getActiveCaregiversForMonitored: vi.fn(async () => []),
}));
vi.mock("../server/db-push", () => ({
  getPushTokensForOpenIds: vi.fn(async () => []),
}));
vi.mock("../server/push", () => ({
  sendExpoPush: vi.fn(async () => 1),
}));

import { recordCaregiverAlarmChanges } from "../server/alarm-changes";
import * as dbChanges from "../server/db-alarm-changes";
import * as dbLinks from "../server/db-links";
import * as dbPush from "../server/db-push";
import * as push from "../server/push";
import type { AlarmChange } from "../server/_core/alarm-diff";

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

const created: AlarmChange = {
  alarmId: "a1",
  alarmDescription: "Losartana",
  changeType: "created",
  oldTime: null,
  newTime: "08:00",
};

function args(over: Partial<Parameters<typeof recordCaregiverAlarmChanges>[0]> = {}) {
  return {
    monitoredOpenId: "maria-1",
    authorOpenId: "ana",
    authorName: "Ana",
    personName: "Maria",
    changes: [created],
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(dbLinks.getActiveCaregiversForMonitored).mockResolvedValue([
    { caregiverOpenId: "ana" },
    { caregiverOpenId: "bia" },
  ] as never);
  vi.mocked(dbPush.getPushTokensForOpenIds).mockResolvedValue([{ token: "ExpoTok[bia]" }] as never);
});

describe("recordCaregiverAlarmChanges", () => {
  it("grava a mudança com o cuidador como autor", async () => {
    await recordCaregiverAlarmChanges(args());

    expect(dbChanges.insertAlarmChanges).toHaveBeenCalledWith([
      expect.objectContaining({
        openId: "maria-1",
        alarmId: "a1",
        alarmDescription: "Losartana",
        changeType: "created",
        newTime: "08:00",
        changedByOpenId: "ana",
      }),
    ]);
  });

  it("avisa só os OUTROS cuidadores, com o nome do autor no texto", async () => {
    await recordCaregiverAlarmChanges(args());
    await flush();

    expect(dbPush.getPushTokensForOpenIds).toHaveBeenCalledWith(["bia"]);
    expect(push.sendExpoPush).toHaveBeenCalledTimes(1);
    const [tokens, message] = vi.mocked(push.sendExpoPush).mock.calls[0];
    expect(tokens).toEqual(["ExpoTok[bia]"]);
    expect(message.body).toBe('Ana criou o lembrete "Losartana" (08:00) para Maria.');
    expect(message.data).toMatchObject({ type: "alarm_changed", url: "/(caregiver-tabs)/alerts" });
  });

  it("se o autor é o único cuidador vinculado, grava mas não manda push", async () => {
    vi.mocked(dbLinks.getActiveCaregiversForMonitored).mockResolvedValue([
      { caregiverOpenId: "ana" },
    ] as never);

    await recordCaregiverAlarmChanges(args({ monitoredOpenId: "maria-2" }));
    await flush();

    expect(dbChanges.insertAlarmChanges).toHaveBeenCalledTimes(1);
    expect(push.sendExpoPush).not.toHaveBeenCalled();
  });

  it("sem mudanças não grava nem avisa", async () => {
    await recordCaregiverAlarmChanges(args({ changes: [] }));
    await flush();

    expect(dbChanges.insertAlarmChanges).not.toHaveBeenCalled();
    expect(push.sendExpoPush).not.toHaveBeenCalled();
  });

  it("falha ao gravar não lança e o aviso ainda sai", async () => {
    vi.mocked(dbChanges.insertAlarmChanges).mockRejectedValueOnce(new Error("DB fora do ar"));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(recordCaregiverAlarmChanges(args({ monitoredOpenId: "maria-3" }))).resolves.toBeUndefined();
    await flush();

    expect(push.sendExpoPush).toHaveBeenCalledTimes(1);
  });

  it("falha no push não lança", async () => {
    vi.mocked(push.sendExpoPush).mockRejectedValueOnce(new Error("rede"));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(recordCaregiverAlarmChanges(args({ monitoredOpenId: "maria-4" }))).resolves.toBeUndefined();
    await flush();
  });

  it("limita o push a 5 por minuto por idoso, mas grava todas as mudanças", async () => {
    for (let i = 0; i < 6; i++) {
      await recordCaregiverAlarmChanges(args({ monitoredOpenId: "maria-5" }));
      await flush();
    }
    expect(dbChanges.insertAlarmChanges).toHaveBeenCalledTimes(6);
    expect(push.sendExpoPush).toHaveBeenCalledTimes(5);
  });
});
