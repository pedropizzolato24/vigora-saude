/**
 * monitoring-job.resilience.test.ts
 *
 * Em 24/07/2026 o dead man's switch ficou 27h desarmado: a migração 0012
 * (account_liveness.batteryExempt) nunca foi aplicada em produção, a primeira
 * query do Passo 1 lançou, e o try ÚNICO que envolvia os quatro passos derrubou
 * o job inteiro — 104 ciclos seguidos sem nada rodar.
 *
 * Estes testes fixam as duas metades do conserto:
 *  1. um passo quebrado não leva os outros junto (nem um evento ruim leva os
 *     outros eventos);
 *  2. o ciclo ainda é contabilizado como FALHA, para /api/health continuar
 *     ficando unhealthy em vez de trocarmos uma falha barulhenta por uma muda.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../server/db-monitoring", () => ({
  getExpiredPendingEvents: vi.fn(async () => []),
  getInactiveAccounts: vi.fn(async () => []),
  getAccountLiveness: vi.fn(async () => null),
  getWarningHistory: vi.fn(async () => []),
  hasUnconfirmedEvents: vi.fn(async () => false),
  claimWarning: vi.fn(async () => 1),
  updateWarningResult: vi.fn(async () => undefined),
  releaseWarning: vi.fn(async () => undefined),
  getMissedCheckinEvents: vi.fn(async () => []),
  getMissedMedicationEvents: vi.fn(async () => []),
  markEventWarningSent: vi.fn(async () => undefined),
  updateAlarmEventStatus: vi.fn(async () => undefined),
  purgeStaleData: vi.fn(async () => ({ alarmEvents: 0, warningLog: 0, locationsCleared: 0 })),
}));

vi.mock("../server/db", () => ({
  getUserData: vi.fn(async () => undefined),
  getUserByOpenId: vi.fn(async () => undefined),
}));

vi.mock("../server/whatsapp", () => ({
  isWhatsAppApiConfigured: vi.fn(() => true),
  sendWhatsAppMessage: vi.fn(async () => ({ success: true })),
}));

vi.mock("../server/db-links", () => ({
  getActiveCaregiversForMonitored: vi.fn(async () => []),
}));

vi.mock("../server/db-push", () => ({
  getPushTokensForOpenIds: vi.fn(async () => []),
}));

vi.mock("../server/push", () => ({
  sendExpoPush: vi.fn(async () => 0),
}));

import { getMonitoringHealth, runMonitoringJob } from "../server/monitoring-job";
import * as db from "../server/db-monitoring";

/** Evento vencido, como getExpiredPendingEvents o devolve. */
const evento = (id: number) =>
  ({
    id,
    openId: `user-${id}`,
    alarmId: `alarm-${id}`,
    scheduledAt: new Date(Date.now() - 60 * 60 * 1000),
    warningSent: false,
  }) as any;

// A implementação dos mocks sobrevive ao clearAllMocks (que só limpa chamadas),
// então tudo que um teste sobrescreve precisa voltar ao padrão aqui.
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(db.getExpiredPendingEvents).mockResolvedValue([]);
  vi.mocked(db.getInactiveAccounts).mockResolvedValue([]);
  vi.mocked(db.getAccountLiveness).mockResolvedValue(null);
  vi.mocked(db.getMissedCheckinEvents).mockResolvedValue([]);
  vi.mocked(db.getMissedMedicationEvents).mockResolvedValue([]);
  vi.mocked(db.updateAlarmEventStatus).mockResolvedValue(undefined);
});

describe("monitoring-job — isolamento de falha por passo", () => {
  it("um passo quebrado não impede os outros de rodar", async () => {
    vi.mocked(db.getExpiredPendingEvents).mockResolvedValue([evento(1)]);
    vi.mocked(db.getAccountLiveness).mockRejectedValue(
      new Error("Unknown column 'batteryExempt' in 'field list'")
    );

    await runMonitoringJob();

    // Era exatamente isto que não acontecia: o Passo 1 abortava e os Passos
    // 2, 3 e 4 nunca eram alcançados.
    expect(db.getInactiveAccounts).toHaveBeenCalled();
    expect(db.getMissedCheckinEvents).toHaveBeenCalled();
    expect(db.getMissedMedicationEvents).toHaveBeenCalled();
  });

  it("passo quebrado ainda reprova o ciclo (/api/health não fica verde)", async () => {
    vi.mocked(db.getExpiredPendingEvents).mockRejectedValue(new Error("DATABASE_UNAVAILABLE"));

    const antes = getMonitoringHealth().consecutiveFailures;
    await runMonitoringJob();
    const depois = getMonitoringHealth();

    expect(depois.consecutiveFailures).toBe(antes + 1);
    expect(depois.lastError).toContain("DATABASE_UNAVAILABLE");
    expect(depois.lastError).toContain("Passo 1");
  });

  it("um evento ruim não impede a resolução dos demais", async () => {
    vi.mocked(db.getExpiredPendingEvents).mockResolvedValue([evento(1), evento(2)]);
    vi.mocked(db.getAccountLiveness)
      .mockRejectedValueOnce(new Error("linha corrompida"))
      .mockResolvedValue({ lastSeenAt: new Date() } as any);

    await runMonitoringJob();

    expect(db.updateAlarmEventStatus).toHaveBeenCalledTimes(1);
    expect(vi.mocked(db.updateAlarmEventStatus).mock.calls[0][0]).toBe(2);
  });

  it("ciclo sem falha nenhuma volta a reportar saudável", async () => {
    await runMonitoringJob();
    const health = getMonitoringHealth();

    expect(health.consecutiveFailures).toBe(0);
    expect(health.lastError).toBeNull();
    expect(health.healthy).toBe(true);
  });
});
