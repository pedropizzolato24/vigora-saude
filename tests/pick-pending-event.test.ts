// tests/pick-pending-event.test.ts
import { describe, it, expect } from "vitest";
import { pickPendingEvent } from "../server/_core/pick-pending-event";

type Ev = { id: number; scheduledAt: Date };

describe("pickPendingEvent", () => {
  it("retorna null para lista vazia", () => {
    expect(pickPendingEvent([], new Date())).toBeNull();
  });

  it("retorna o único evento quando há só um", () => {
    const ev: Ev = { id: 1, scheduledAt: new Date("2026-06-04T09:30:00") };
    expect(pickPendingEvent([ev], new Date("2026-06-04T09:35:00"))).toBe(ev);
  });

  it("check-in: resolve o evento de HOJE, não o de amanhã (resposta após o prazo)", () => {
    const hoje: Ev = { id: 1, scheduledAt: new Date("2026-06-04T09:30:00") };
    const amanha: Ev = { id: 2, scheduledAt: new Date("2026-06-05T09:30:00") };
    // Usuário responde às 09:35, depois do prazo de hoje (09:30).
    const now = new Date("2026-06-04T09:35:00");
    expect(pickPendingEvent([amanha, hoje], now)?.id).toBe(1);
  });

  it("check-in: resolve hoje mesmo quando a resposta é ANTES do prazo", () => {
    const hoje: Ev = { id: 1, scheduledAt: new Date("2026-06-04T09:30:00") };
    const amanha: Ev = { id: 2, scheduledAt: new Date("2026-06-05T09:30:00") };
    // Responde às 09:05; o prazo de hoje ainda está no futuro, mas é o mais perto.
    const now = new Date("2026-06-04T09:05:00");
    expect(pickPendingEvent([amanha, hoje], now)?.id).toBe(1);
  });

  it("alarme comum: resolve o disparo mais recente, não um antigo perdido pendente", () => {
    const antigo: Ev = { id: 1, scheduledAt: new Date("2026-06-01T08:00:00") };
    const agora: Ev = { id: 2, scheduledAt: new Date("2026-06-04T08:00:00") };
    const now = new Date("2026-06-04T08:00:30");
    expect(pickPendingEvent([antigo, agora], now)?.id).toBe(2);
  });

  it("empate: mantém o primeiro encontrado", () => {
    const a: Ev = { id: 1, scheduledAt: new Date("2026-06-04T09:00:00") };
    const b: Ev = { id: 2, scheduledAt: new Date("2026-06-04T09:00:00") };
    const now = new Date("2026-06-04T10:00:00");
    expect(pickPendingEvent([a, b], now)?.id).toBe(1);
  });
});
