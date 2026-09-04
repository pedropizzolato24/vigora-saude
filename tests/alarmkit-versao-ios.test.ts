/**
 * alarmkit-versao-ios.test.ts
 *
 * Até o build do portão, a disponibilidade do AlarmKit era decidida por
 * "o módulo nativo carregou?" — e isso funcionava por acidente: a classe
 * Swift era `@available(iOS 26.0, *)`, então abaixo de 26 ela não registrava.
 *
 * Esse mesmo `@available` na classe é o que QUEBRAVA a compilação: o
 * ExpoModulesProvider gerado pelo autolinking referencia a classe sem guarda,
 * e o app tem alvo 15.1. Ao tirar o `@available` da classe (guardando só os
 * corpos que tocam AlarmKit), o módulo passa a registrar em TODO iPhone —
 * inclusive num iOS 15, onde o AlarmKit não existe.
 *
 * Ou seja: consertar o build apaga a premissa em que a checagem se apoiava.
 * A versão do sistema precisa entrar na conta explicitamente, senão todo
 * iPhone antigo tenta agendar pelo AlarmKit e cai no caminho de erro — no
 * aparelho de quem mais depende do alarme funcionar.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const ponte = {
  configure: vi.fn(() => true),
  requestAuthorization: vi.fn(async () => "authorized" as const),
  scheduleRepeatingAlarm: vi.fn(async () => true),
  cancelAlarm: vi.fn(async () => true),
  getAllAlarms: vi.fn(() => [] as string[]),
  getLaunchPayload: vi.fn(() => null),
};

let pontePresente = true;
const plataforma = { OS: "ios" as string, Version: "26.0" as string | number };

vi.mock("../lib/_core/ios-alarm-kit-bridge", () => ({
  get alarmKit() {
    return pontePresente ? ponte : null;
  },
}));

vi.mock("react-native", () => ({
  Platform: {
    get OS() {
      return plataforma.OS;
    },
    get Version() {
      return plataforma.Version;
    },
  },
  AppState: { addEventListener: vi.fn(() => ({ remove: vi.fn() })) },
}));

import { isAlarmKitAvailable } from "../lib/ios-alarm-kit";

describe("AlarmKit — disponibilidade leva a versão do iOS em conta", () => {
  beforeEach(() => {
    pontePresente = true;
    plataforma.OS = "ios";
    plataforma.Version = "26.0";
  });

  it("disponível no iOS 26.0", () => {
    expect(isAlarmKitAvailable()).toBe(true);
  });

  it("disponível acima do 26", () => {
    plataforma.Version = "27.1";
    expect(isAlarmKitAvailable()).toBe(true);
  });

  it("INDISPONÍVEL no iOS 15, mesmo com o módulo registrado", () => {
    // O caso que o conserto do build cria: a classe passa a registrar em
    // qualquer versão, então só a presença do módulo deixa de provar nada.
    plataforma.Version = "15.1";
    expect(isAlarmKitAvailable()).toBe(false);
  });

  it("INDISPONÍVEL no iOS 25.9 — a fronteira é 26, não 'moderno'", () => {
    plataforma.Version = "25.9";
    expect(isAlarmKitAvailable()).toBe(false);
  });

  it("aceita Version numérico, não só string", () => {
    plataforma.Version = 26;
    expect(isAlarmKitAvailable()).toBe(true);
  });

  it("indisponível quando o módulo não registrou, mesmo no 26", () => {
    pontePresente = false;
    expect(isAlarmKitAvailable()).toBe(false);
  });

  it("indisponível fora do iOS", () => {
    plataforma.OS = "android";
    expect(isAlarmKitAvailable()).toBe(false);
  });
});
