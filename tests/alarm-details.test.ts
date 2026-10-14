/**
 * Textos das listas só leitura (spec 6.2): o aviso no topo e os detalhes de um
 * alarme quando outra pessoa cuida dos alarmes.
 */
import { describe, expect, it } from "vitest";
import {
  alarmDetailsCopy,
  READ_ONLY_EMPTY_TEXT,
  readOnlyBannerText,
  repeatSummary,
} from "../lib/alarm-details";
import type { Alarm } from "../lib/app-context";

const alarm = (over: Partial<Alarm> = {}): Alarm => ({
  id: "a1",
  time: "08:00",
  description: "Losartana",
  enabled: true,
  repeat: "daily",
  sound: true,
  vibration: true,
  ...over,
});

describe("aviso no topo", () => {
  it("usa o texto da spec com o nome de quem cuida", () => {
    expect(readOnlyBannerText("Ana")).toBe("Quem cuida dos seus alarmes é Ana");
  });

  it("sem nome, diz 'seu cuidador' (nunca 'Seu cuidador' no meio da frase)", () => {
    expect(readOnlyBannerText("")).toBe("Quem cuida dos seus alarmes é seu cuidador");
    expect(readOnlyBannerText(null)).toBe("Quem cuida dos seus alarmes é seu cuidador");
    expect(readOnlyBannerText(undefined)).toBe("Quem cuida dos seus alarmes é seu cuidador");
  });

  it("a lista vazia não manda o idoso adicionar", () => {
    expect(READ_ONLY_EMPTY_TEXT).not.toMatch(/Adicione|Toque no botão/);
    expect(READ_ONLY_EMPTY_TEXT).toContain("Quem cuida dos seus alarmes pode adicionar");
  });
});

describe("repeatSummary", () => {
  it("repetições fixas usam os rótulos do formulário", () => {
    expect(repeatSummary(alarm({ repeat: "daily" }))).toBe("Diário");
    expect(repeatSummary(alarm({ repeat: "weekdays" }))).toBe("Dias úteis");
    expect(repeatSummary(alarm({ repeat: "weekends" }))).toBe("Fins de semana");
  });

  it("personalizado lista os dias em ordem (0 = domingo)", () => {
    expect(repeatSummary(alarm({ repeat: "custom", customDays: [3, 1, 0] }))).toBe("Dom, Seg, Qua");
  });

  it("personalizado com todos os dias, nenhum dia ou dia inválido", () => {
    expect(repeatSummary(alarm({ repeat: "custom", customDays: [0, 1, 2, 3, 4, 5, 6] }))).toBe("Todos os dias");
    expect(repeatSummary(alarm({ repeat: "custom", customDays: [] }))).toBe("Personalizado");
    expect(repeatSummary(alarm({ repeat: "custom" }))).toBe("Personalizado");
    expect(repeatSummary(alarm({ repeat: "custom", customDays: [9, 2, 2] }))).toBe("Ter");
  });
});

describe("alarmDetailsCopy", () => {
  it("remédio: horário no título; nome, repetição e situação na mensagem", () => {
    const d = alarmDetailsCopy(alarm({ repeat: "weekdays" }));
    expect(d.title).toBe("08:00");
    expect(d.message).toBe("Nome: Losartana\nRepetição: Dias úteis\nSituação: Ligado");
    expect(d.closeLabel).toBe("Fechar");
  });

  it("remédio desligado e sem nome", () => {
    const d = alarmDetailsCopy(alarm({ enabled: false, description: "   " }));
    expect(d.message).toContain("Nome: Sem descrição");
    expect(d.message).toContain("Situação: Desligado");
  });

  it("check-in: nome fixo e aviso em N minutos", () => {
    const d = alarmDetailsCopy(
      alarm({ kind: "checkin", description: "Check-in", time: "09:00", escalateAfterMinutes: 15 })
    );
    expect(d.title).toBe("09:00");
    expect(d.message).toContain("Nome: Check-in");
    expect(d.message).toContain("Avisa seus contatos após 15 min sem resposta");
  });

  it("check-in sem o atraso gravado usa o padrão", () => {
    const d = alarmDetailsCopy(alarm({ kind: "checkin" }));
    expect(d.message).toContain("Avisa seus contatos após 5 min sem resposta");
  });
});
