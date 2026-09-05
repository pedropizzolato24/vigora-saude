/**
 * heartbeat-location-sanitize.test.ts
 *
 * Auditoria set/2026, V-02: `monitoring.heartbeat` aceitava `lastLocation` como
 * string livre. O valor era gravado em account_liveness e depois interpolado
 * numa URL de mapa DENTRO do corpo da mensagem de WhatsApp que o dead man's
 * switch envia aos contatos de emergência, sob o remetente confiável do Vigora
 * e com preview de link ligado — ou seja, injeção de link arbitrário numa
 * mensagem que a família recebe em pânico.
 *
 * O caminho gêmeo (whatsapp.sendEmergencyAlert) já se defendia com `.url()`.
 *
 * Decisão de projeto testada aqui: coordenada inválida é DESCARTADA, não
 * rejeitada. O heartbeat é o sinal de vida da pessoa; derrubá-lo por causa de
 * telemetria opcional seria trocar uma injeção por um switch desarmado.
 */
import { describe, expect, it } from "vitest";
import { parseLatLng } from "../server/_core/parse-lat-lng";

describe("parseLatLng", () => {
  it.each([
    ["-23.5505,-46.6333", "-23.5505,-46.6333"],
    ["0,0", "0,0"],
    ["-90,180", "-90,180"],
    ["90,-180", "90,-180"],
    [" -23.5505 , -46.6333 ", "-23.5505,-46.6333"],
  ])("aceita a coordenada %s", (entrada, esperado) => {
    expect(parseLatLng(entrada)).toBe(esperado);
  });

  it.each([
    // O vetor do achado: texto com vírgula virava link arbitrário na mensagem.
    "-23.5,https://evil.example/phishing",
    "clique aqui, https://evil.example",
    "-23.5505,-46.6333 https://evil.example",
    "javascript:alert(1),0",
    "0,0\nhttps://evil.example",
    // Fora de faixa.
    "91,0",
    "0,181",
    "-90.1,0",
    // Malformados.
    "",
    "-23.5505",
    "-23.5505,-46.6333,10",
    "a,b",
    "1e-7,0",
  ])("rejeita %j", (entrada) => {
    expect(parseLatLng(entrada)).toBeNull();
  });

  it("rejeita null e undefined", () => {
    expect(parseLatLng(null)).toBeNull();
    expect(parseLatLng(undefined)).toBeNull();
  });

  it("a URL de mapa construída a partir do resultado não carrega texto injetado", () => {
    // Espelha monitoring-job.ts: só monta a URL quando parseLatLng aprova.
    const construir = (bruto: string) => {
      const coords = parseLatLng(bruto);
      return coords
        ? `https://maps.google.com/?q=${encodeURIComponent(coords)}`
        : undefined;
    };

    expect(construir("-23.5,https://evil.example")).toBeUndefined();
    expect(construir("-23.5505,-46.6333")).toBe(
      "https://maps.google.com/?q=-23.5505%2C-46.6333"
    );
  });
});
