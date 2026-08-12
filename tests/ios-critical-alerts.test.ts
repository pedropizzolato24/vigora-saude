import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Critical Alerts é o que faz o alarme de medicação tocar com a chavinha
 * lateral no silencioso e com Foco/Não Perturbe ligado — o modo em que muitos
 * idosos deixam o aparelho. A Apple aprovou o entitlement em 12/08/2026
 * (docs/ios-critical-alerts-request.md).
 *
 * As três peças só funcionam JUNTAS, e nenhuma falha de forma visível:
 * sem o entitlement o iOS ignora tudo em silêncio; com interruptionLevel
 * 'critical' mas som normal, o alerta aparece e não toca. Um teste de runtime
 * não pegaria isso (é comportamento do sistema no aparelho), então travamos o
 * contrato na fonte.
 */
const root = join(__dirname, "..");
const appConfig = readFileSync(join(root, "app.config.ts"), "utf8");
const notifications = readFileSync(join(root, "lib", "notifications-utils.ts"), "utf8");

describe("alarme iOS — Critical Alerts", () => {
  it("declara o entitlement no app.config (sem ele o build de prod nem assina)", () => {
    expect(appConfig).toMatch(
      /["']com\.apple\.developer\.usernotifications\.critical-alerts["']:\s*true/
    );
  });

  it("pede a permissão de alertas críticos ao usuário", () => {
    expect(notifications).toMatch(/allowCriticalAlerts:\s*true/);
  });

  it("agenda o alarme com interruptionLevel 'critical'", () => {
    expect(notifications).toMatch(/interruptionLevel:\s*['"]critical['"]/);
    // 'timeSensitive' fura Foco mas NÃO a chavinha de silencioso — era o
    // estado anterior, e voltar a ele reintroduz o bug sem nenhum sinal.
    expect(notifications).not.toMatch(/interruptionLevel:\s*['"]timeSensitive['"]/);
  });

  it("usa um som CRÍTICO no iOS — som normal não toca no silencioso", () => {
    // O expo-notifications só mapeia 'defaultCritical' para
    // UNNotificationSound.defaultCritical; qualquer outro nome vira
    // UNNotificationSound(named:), que o silencioso cala.
    expect(notifications).toMatch(/['"]defaultCritical['"]/);
  });
});
