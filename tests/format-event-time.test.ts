// tests/format-event-time.test.ts
//
// O horário que vai na mensagem ao cuidador/família tem que ser o que o IDOSO
// viu na tela — não o do servidor (Railway roda em UTC) nem o de Brasília
// quando ele mora no Acre. Simula o ambiente do Railway.
process.env.TZ = "UTC";

import { describe, it, expect } from "vitest";
import { formatEventTime } from "../server/_core/format-event-time";

describe("formatEventTime", () => {
  it("usa o fuso do evento: 21:00 no Acre não vira 23:00", () => {
    // 21:00 em America/Rio_Branco (UTC-5) = 02:00Z do dia seguinte.
    const scheduledAt = new Date("2026-08-11T02:00:00Z");
    expect(formatEventTime(scheduledAt, "America/Rio_Branco")).toBe("21:00");
  });

  it("fuso null (linha antiga, pré-migração) cai em Brasília", () => {
    // 21:00 em America/Sao_Paulo (UTC-3) = 00:00Z do dia seguinte.
    const scheduledAt = new Date("2026-08-11T00:00:00Z");
    expect(formatEventTime(scheduledAt, null)).toBe("21:00");
  });

  it("fuso inválido vindo do cliente não derruba a escalação", () => {
    // Entrada não confiável: o Zod garante string, não que seja IANA válido.
    // toLocaleTimeString lança RangeError num fuso inexistente — se vazar,
    // mata o job de monitoramento e o cuidador nunca é avisado.
    const scheduledAt = new Date("2026-08-11T00:00:00Z");
    expect(formatEventTime(scheduledAt, "Mars/Olympus_Mons")).toBe("21:00");
  });
});
