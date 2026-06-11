/**
 * monitoring-health.test.ts
 *
 * Pure-function tests for the dead man's switch robustness fixes:
 *   - shouldRetryWarning: a warning that reached NOBODY must release its dedup
 *     claim so the next run retries (instead of going silent for 2h).
 *   - computeMonitoringHealth: the job's self-health verdict consumed by
 *     /api/health, so an external monitor catches a failing/stale scheduler.
 */
import { describe, it, expect } from "vitest";
import {
  shouldRetryWarning,
  computeMonitoringHealth,
} from "../server/monitoring-job";

describe("shouldRetryWarning", () => {
  it("retry quando NINGUÉM foi alcançado (0 WhatsApp, 0 push)", () => {
    expect(shouldRetryWarning(0, 0)).toBe(true);
  });

  it("não retry quando ao menos 1 contato recebeu WhatsApp", () => {
    expect(shouldRetryWarning(1, 0)).toBe(false);
  });

  it("não retry quando ao menos 1 cuidador recebeu push", () => {
    expect(shouldRetryWarning(0, 1)).toBe(false);
  });

  it("não retry quando ambos os canais entregaram", () => {
    expect(shouldRetryWarning(3, 2)).toBe(false);
  });
});

describe("computeMonitoringHealth", () => {
  const NOW = 1_000_000_000;

  it("saudável antes da primeira execução (não trava boot/healthcheck)", () => {
    const h = computeMonitoringHealth(
      { lastRunAt: 0, lastSuccessAt: 0, consecutiveFailures: 0, lastError: null },
      NOW
    );
    expect(h.healthy).toBe(true);
    expect(h.stale).toBe(false);
  });

  it("saudável após execução recente bem-sucedida", () => {
    const h = computeMonitoringHealth(
      { lastRunAt: NOW, lastSuccessAt: NOW, consecutiveFailures: 0, lastError: null },
      NOW
    );
    expect(h.healthy).toBe(true);
  });

  it("tolera até 2 falhas consecutivas", () => {
    const h = computeMonitoringHealth(
      { lastRunAt: NOW, lastSuccessAt: NOW - 1, consecutiveFailures: 2, lastError: "x" },
      NOW
    );
    expect(h.healthy).toBe(true);
  });

  it("fica unhealthy na 3ª falha consecutiva", () => {
    const h = computeMonitoringHealth(
      { lastRunAt: NOW, lastSuccessAt: NOW - 1, consecutiveFailures: 3, lastError: "boom" },
      NOW
    );
    expect(h.healthy).toBe(false);
  });

  it("fica unhealthy quando o job está stale (>15min sem rodar)", () => {
    const h = computeMonitoringHealth(
      {
        lastRunAt: NOW - 16 * 60 * 1000,
        lastSuccessAt: NOW - 16 * 60 * 1000,
        consecutiveFailures: 0,
        lastError: null,
      },
      NOW
    );
    expect(h.stale).toBe(true);
    expect(h.healthy).toBe(false);
  });

  it("não é stale com execução há 10min", () => {
    const h = computeMonitoringHealth(
      {
        lastRunAt: NOW - 10 * 60 * 1000,
        lastSuccessAt: NOW - 10 * 60 * 1000,
        consecutiveFailures: 0,
        lastError: null,
      },
      NOW
    );
    expect(h.stale).toBe(false);
    expect(h.healthy).toBe(true);
  });
});
