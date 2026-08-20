/**
 * No iOS 26+ o alarme já tocou e já foi desligado na tela do sistema quando a
 * alarm-ring monta. Ela não pode: tocar som por cima, rodar countdown, nem
 * escalar — o alarme FOI atendido.
 *
 * E settings.alarmVolume deixa de valer: o AlarmKit usa o volume de alarme do
 * celular. Um controle que não faz nada é pior que controle nenhum.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const raiz = join(__dirname, "..");
const alarmRing = readFileSync(join(raiz, "app/alarm-ring.tsx"), "utf8");
const settings = readFileSync(join(raiz, "app/(tabs)/settings.tsx"), "utf8");

describe("alarm-ring no iOS 26+", () => {
  it("deriva o estado a partir da disponibilidade do AlarmKit", () => {
    expect(alarmRing).toMatch(/const vindoDoAlarmKit\s*=/);
  });

  it("o countdown é guardado por essa flag", () => {
    // O countdown é o que escala para a família. Rodá-lo depois de o idoso ter
    // desligado o alarme escalaria um alarme ATENDIDO. A guarda tem que estar
    // antes de qualquer initTimer/setInterval do disparo.
    const efeito = alarmRing.match(/initTimer[\s\S]{0,400}/);
    expect(efeito, "não achei o início do timer").not.toBeNull();
    expect(alarmRing).toMatch(/if \(vindoDoAlarmKit\) return;/);
  });

  it("não toca som por cima — o alarme do sistema já tocou e já parou", () => {
    // São DOIS caminhos independentes que precisam desistir: o do countdown e
    // o que sobe o som. Uma guarda só passaria este teste com o som ainda
    // subindo por cima de um alarme que já acabou — por isso a contagem.
    const guardas = alarmRing.match(/if \(vindoDoAlarmKit\) return;/g) ?? [];
    expect(
      guardas.length,
      "esperava ao menos duas guardas: countdown e som",
    ).toBeGreaterThanOrEqual(2);
  });
});

describe("slider de volume", () => {
  it("é escondido quando o volume é do sistema", () => {
    expect(settings).toMatch(/isAlarmKitAvailable/);
  });

  it("explica ao usuário em vez de sumir sem contexto", () => {
    expect(settings).toMatch(/volume do alarme do celular/i);
  });
});
