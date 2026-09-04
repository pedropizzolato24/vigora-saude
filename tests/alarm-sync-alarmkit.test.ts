// tests/alarm-sync-alarmkit.test.ts
/**
 * Os dois caminhos do iOS nunca podem coexistir para o mesmo alarme: seriam
 * dois disparos para o mesmo remédio. A migração é feita no agendamento —
 * quem entra cancela o outro.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

let alarmKitDisponivel = true;
let idsNoAlarmKit: string[] = [];
const agendarAlarmKit = vi.fn(async () => {});
const cancelarAlarmKit = vi.fn(async (_id?: string) => {});
const agendarNotificacao = vi.fn(async () => "notif-1" as string | null);
const cancelarNotificacoes = vi.fn(async () => 0);
const cancelarTodasNotificacoes = vi.fn(async () => {});

vi.mock("../lib/ios-alarm-kit", () => ({
  isAlarmKitAvailable: () => alarmKitDisponivel,
  scheduleAlarmKitAlarm: (...a: unknown[]) => agendarAlarmKit(...(a as [])),
  cancelAlarmKitAlarm: (...a: unknown[]) => cancelarAlarmKit(...(a as [])),
  listAlarmKitAlarmIds: () => idsNoAlarmKit,
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
  cancelAllScheduledNotificationsAsync: () => cancelarTodasNotificacoes(),
}));

vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));

vi.mock("@/lib/_core/auth", () => ({
  getUserInfo: vi.fn(async () => ({ openId: "u1" })),
  getSessionToken: vi.fn(async () => "t"),
}));

import { scheduleFullAlarm, cancelFullAlarm, cancelAllAlarms } from "../lib/alarm-sync";
import type { Alarm } from "../lib/app-context";

const ID = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";

const alarme = (): Alarm =>
  ({
    id: ID,
    time: "08:00",
    description: "Remédio",
    repeat: "daily",
    enabled: true,
    sound: true,
    vibration: true,
  }) as Alarm;

beforeEach(() => {
  alarmKitDisponivel = true;
  idsNoAlarmKit = [];
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

describe("AlarmKit disponível mas o agendamento não vinga", () => {
  /**
   * `isAlarmKitAvailable()` só responde "o módulo JS carregou". Autorização
   * negada, `configure()` sem App Group e recusa do nativo aparecem SÓ no
   * agendamento. Sem fallback o idoso fica sem alarme de remédio nenhum e só
   * descobre quando não toma o remédio — a spec exige que 26.x com AlarmKit
   * indisponível POR QUALQUER MOTIVO caia no fallback.
   */
  const recusa = () => new Error("AlarmKit: autorização negada");

  it("cai para a notificação em vez de deixar o alarme sem existir", async () => {
    agendarAlarmKit.mockRejectedValueOnce(recusa());

    const r = await scheduleFullAlarm(alarme());

    expect(agendarNotificacao).toHaveBeenCalled();
    expect(r.notificationId).toBe("notif-1");
  });

  it("não deixa o alarme meio-agendado nos dois caminhos", async () => {
    // O nativo pode ter aceitado parte do agendamento antes de recusar; sem
    // cancelar, o remédio tocaria duas vezes.
    agendarAlarmKit.mockRejectedValueOnce(recusa());

    await scheduleFullAlarm(alarme());

    expect(cancelarAlarmKit).toHaveBeenCalledWith(ID);
  });

  it("logue o motivo real — falha de capacidade não pode ser silenciosa", async () => {
    const erro = recusa();
    agendarAlarmKit.mockRejectedValueOnce(erro);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    await scheduleFullAlarm(alarme());

    expect(log).toHaveBeenCalledWith(expect.stringContaining(ID), erro);
    log.mockRestore();
  });

  it("se a notificação TAMBÉM falhar, aí sim lança — a UI mostra o erro", async () => {
    agendarAlarmKit.mockRejectedValueOnce(recusa());
    agendarNotificacao.mockResolvedValueOnce(null);

    await expect(scheduleFullAlarm(alarme())).rejects.toThrow(/notificação/);
  });
});

describe("cancelamento", () => {
  it("derruba os dois caminhos, não importa qual estava ativo", async () => {
    await cancelFullAlarm(alarme());
    expect(cancelarAlarmKit).toHaveBeenCalled();
    expect(cancelarNotificacoes).toHaveBeenCalled();
  });
});

describe("cancelAllAlarms (logout e troca de conta)", () => {
  /**
   * O alarme do AlarmKit é do SISTEMA: sobrevive ao logout e toma a tela do
   * iPhone em loop, todo dia, no horário do remédio de uma conta que não está
   * mais no aparelho. E não há recuperação — syncAlarmsOnStartup só itera os
   * alarmes da conta atual, então o id órfão nunca mais aparece.
   */
  it("cancela TODOS os alarmes do AlarmKit, não só os da conta carregada", async () => {
    idsNoAlarmKit = ["id-a", "id-b"];

    await cancelAllAlarms();

    expect(cancelarAlarmKit.mock.calls.map((c) => c[0]).sort()).toEqual([
      "id-a",
      "id-b",
    ]);
  });

  it("um cancelamento que falha não impede os outros nem as notificações", async () => {
    idsNoAlarmKit = ["id-a", "id-b"];
    cancelarAlarmKit.mockRejectedValueOnce(new Error("nativo recusou"));

    await cancelAllAlarms();

    expect(cancelarAlarmKit).toHaveBeenCalledTimes(2);
    expect(cancelarTodasNotificacoes).toHaveBeenCalled();
  });

  it("sem AlarmKit (Android, iOS <26) não tenta cancelar nada dele", async () => {
    alarmKitDisponivel = false;
    idsNoAlarmKit = ["id-a"];

    await cancelAllAlarms();

    expect(cancelarAlarmKit).not.toHaveBeenCalled();
    expect(cancelarTodasNotificacoes).toHaveBeenCalled();
  });
});
