/**
 * O AlarmKit exige iOS 26, mas o APP não pode exigir. O podspec da lib pina
 * 26.1 e o CocoaPods propaga isso para o alvo do app: com esse alvo, quem tem
 * iPhone abaixo de 26 simplesmente para de receber atualização, sem erro
 * nenhum. Foi assim que a Fase 0 rodou, de propósito e marcada como
 * descartável.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const raiz = join(__dirname, "..");
const appConfig = readFileSync(join(raiz, "app.config.ts"), "utf8");
const patch = readFileSync(join(raiz, "patches/expo-alarm-kit.patch"), "utf8");

describe("configuração de build do AlarmKit", () => {
  it("o app NÃO declara deploymentTarget iOS", () => {
    const bloco = appConfig.match(/ios:\s*\{[^}]*deploymentTarget/s);
    expect(bloco, "deploymentTarget iOS voltou ao app.config").toBeNull();
  });

  it("o patch baixa o platform do podspec para 15.1", () => {
    const adicionadas = patch
      .split("\n")
      .filter((l) => l.startsWith("+") && !l.startsWith("+++"))
      .join("\n");
    expect(adicionadas).toMatch(/:ios\s*=>\s*'15\.1'/);
  });

  it("tira o @available da classe do módulo — foi o que quebrou o portão", () => {
    // O ExpoModulesProvider gerado pelo autolinking referencia
    // `ExpoAlarmKitModule.self` SEM guarda de versão, e o app tem alvo 15.1.
    // Com `@available(iOS 26.0, *)` na classe o build morre com
    // "'ExpoAlarmKitModule' is only available in iOS 26.0 or newer".
    const removidas = patch
      .split("\n")
      .filter((l) => l.startsWith("-") && !l.startsWith("---"))
      .join("\n");
    expect(removidas).toMatch(/@available\(iOS 26\.0, \*\)/);

    const adicionadas = patch
      .split("\n")
      .filter((l) => l.startsWith("+") && !l.startsWith("+++"))
      .join("\n");
    // A declaração da classe é linha de CONTEXTO no diff (só a anotação acima
    // saiu), então o invariante é: nenhuma linha `@available` sobrevive
    // imediatamente antes dela no arquivo final.
    expect(patch).not.toMatch(
      /^\+@available\(iOS 26\.0, \*\)\s*\n[ +]public class ExpoAlarmKitModule/m
    );
    expect(patch).toMatch(
      /^-@available\(iOS 26\.0, \*\)[\s\S]{0,600}?^[ ]public class ExpoAlarmKitModule/m
    );
    // ...e cada corpo que toca AlarmKit se guarda sozinho.
    const guardas = adicionadas.match(/guard #available\(iOS 26\.0, \*\)/g) ?? [];
    expect(guardas.length).toBeGreaterThanOrEqual(5);
  });

  it("declara o App Group — sem ele o intent de dismiss não registra nada", () => {
    expect(appConfig).toMatch(
      /com\.apple\.security\.application-groups/
    );
    expect(appConfig).toMatch(/group\.com\.vigora\.saude\.alarms/);
  });

  it("empacota alarm.mp3 — sem extensão o som falhou na medição", () => {
    expect(appConfig).toMatch(/alarm\.mp3/);
  });
});
