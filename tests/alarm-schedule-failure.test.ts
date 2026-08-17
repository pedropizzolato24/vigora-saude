/**
 * alarm-schedule-failure.test.ts
 *
 * O app dizia "Alarme criado" mesmo quando nada tinha sido agendado. Foi o que
 * escondeu o bug do iOS por três rodadas de teste: scheduleAlarmNotification
 * lançava, o catch dela devolvia null, scheduleFullAlarm ignorava o null e o
 * toast de sucesso aparecia igual. Num app de remédio, afirmar que existe um
 * alarme que não existe é o pior modo possível de falhar — o idoso confia, e
 * o dead man's switch nem chega a ser armado.
 *
 * São três mentiras da mesma família:
 *   1. criar: toast de sucesso sem agendamento nenhum;
 *   2. editar: cancelFullAlarm já derrubou o alarme ANTIGO antes de tentar
 *      reagendar — falhou, e a lista segue mostrando um alarme que morreu;
 *   3. ligar pela chavinha: só console.error, a chave volta sozinha e o
 *      usuário não faz ideia do porquê.
 *
 * A regra: se o sistema não aceitou o agendamento, isso PRECISA chegar em
 * quem está olhando para a tela.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

let nativoDisponivel = false;
let uidsNativos: string[] = [];
let idNotificacao: string | null = "notif-1";

vi.mock("../lib/native-alarm-manager", () => ({
  get isNativeAlarmAvailable() {
    return nativoDisponivel;
  },
  scheduleNativeAlarm: vi.fn(async () => uidsNativos),
  cancelNativeAlarm: vi.fn(async () => {}),
  cancelAllNativeAlarms: vi.fn(async () => {}),
}));

vi.mock("../lib/notifications-utils", () => ({
  scheduleAlarmNotification: vi.fn(async () => idNotificacao),
  cancelAlarmNotification: vi.fn(async () => {}),
}));

vi.mock("expo-notifications", () => ({
  cancelAllScheduledNotificationsAsync: vi.fn(async () => {}),
}));

vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));

vi.mock("@/lib/_core/auth", () => ({
  getSessionToken: vi.fn(async () => "t"),
  getUserInfo: vi.fn(async () => ({ openId: "u1" })),
}));

import { scheduleFullAlarm } from "../lib/alarm-sync";
import type { Alarm } from "../lib/app-context";

const alarme = (): Alarm =>
  ({
    id: "a1",
    time: "08:00",
    description: "Remédio",
    repeat: "daily",
    enabled: true,
    sound: true,
    vibration: true,
  }) as Alarm;

beforeEach(() => {
  nativoDisponivel = false;
  uidsNativos = ["uid-1"];
  idNotificacao = "notif-1";
});

describe("scheduleFullAlarm — falha não pode passar por sucesso", () => {
  it("iOS: notificação recusada (null) lança em vez de devolver o alarme", async () => {
    idNotificacao = null;
    await expect(scheduleFullAlarm(alarme())).rejects.toThrow();
  });

  it("Android: nenhum uid agendado lança", async () => {
    nativoDisponivel = true;
    uidsNativos = [];
    await expect(scheduleFullAlarm(alarme())).rejects.toThrow();
  });

  it("iOS: sucesso devolve o alarme com o id da notificação", async () => {
    const r = await scheduleFullAlarm(alarme());
    expect(r.notificationId).toBe("notif-1");
  });

  it("Android: sucesso devolve o alarme com os uids nativos", async () => {
    nativoDisponivel = true;
    const r = await scheduleFullAlarm(alarme());
    expect(r.nativeAlarmUids).toEqual(["uid-1"]);
  });

  it("a mensagem do erro diz qual alarme falhou", async () => {
    idNotificacao = null;
    await expect(scheduleFullAlarm(alarme())).rejects.toThrow(/a1/);
  });
});

describe("a tela avisa o usuário — não só o console", () => {
  const tela = readFileSync(
    join(__dirname, "..", "app/(tabs)/alarms.tsx"),
    "utf8"
  );

  /** Corpo do catch de uma função nomeada em alarms.tsx. */
  function corpoDoCatch(nomeFn: string): string {
    const fn = tela.match(
      new RegExp(`const ${nomeFn} = async \\([^)]*\\) => \\{([\\s\\S]*?)\\n  \\};`)
    );
    expect(fn, `não achei ${nomeFn}`).not.toBeNull();
    const c = fn![1].match(/catch \([\s\S]*?\) \{([\s\S]*)$/);
    expect(c, `${nomeFn} não tem catch`).not.toBeNull();
    return c![1];
  }

  it("handleSave avisa em diálogo quando o agendamento falha", () => {
    expect(corpoDoCatch("handleSave")).toMatch(/showDialog\(/);
  });

  it("handleToggle avisa em diálogo — antes só logava no console", () => {
    expect(corpoDoCatch("handleToggle")).toMatch(/showDialog\(/);
  });

  it("handleSave desliga o alarme na edição que falhou", () => {
    // cancelFullAlarm já rodou: manter enabled seria mostrar um alarme morto.
    const c = corpoDoCatch("handleSave");
    expect(c).toMatch(/editingAlarm/);
    expect(c).toMatch(/enabled:\s*false/);
  });

  it("nenhum catch de agendamento fica só no console.error", () => {
    for (const fn of ["handleSave", "handleToggle"]) {
      const c = corpoDoCatch(fn);
      const soConsole =
        /console\.(error|warn)/.test(c) && !/showDialog|showToast/.test(c);
      expect(soConsole, `${fn} engole a falha no console`).toBe(false);
    }
  });
});
