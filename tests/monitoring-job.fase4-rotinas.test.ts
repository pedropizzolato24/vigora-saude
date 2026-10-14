/**
 * monitoring-job.fase4-rotinas.test.ts
 *
 * As três rotinas da Fase 4 (pré-registro, pausas, manutenção do acordo) rodam
 * antes do Passo 1. Cada uma é isolada: a falha de uma não pode impedir as
 * outras nem os Passos 1 a 4, e o ciclo continua reprovando /api/health. É a
 * mesma lição de 24/07/2026 (um try único derrubou o job e o switch ficou 27 h
 * desarmado), agora para as rotinas novas.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../server/db-monitoring", () => ({
  getExpiredPendingEvents: vi.fn(async () => []),
  getAccountsWithUnconfirmedEvents: vi.fn(async () => []),
  getAccountLiveness: vi.fn(async () => null),
  getWarningHistory: vi.fn(async () => []),
  claimWarning: vi.fn(async () => 1),
  updateWarningResult: vi.fn(async () => undefined),
  releaseWarning: vi.fn(async () => undefined),
  getMissedCheckinEvents: vi.fn(async () => []),
  getMissedMedicationEvents: vi.fn(async () => []),
  markEventWarningSent: vi.fn(async () => undefined),
  updateAlarmEventStatus: vi.fn(async () => undefined),
  deleteAlarmEvent: vi.fn(async () => undefined),
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

vi.mock("../server/db-managed-alarm-list", () => ({
  getManagedList: vi.fn(async () => null),
}));
vi.mock("../server/dms-preregister", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../server/dms-preregister")>()),
  runPreRegistration: vi.fn(async () => ({ registered: 0 })),
}));
vi.mock("../server/dms-pauses", () => ({
  runDmsPauses: vi.fn(async () => ({ paused: 0, noticesSent: 0, pinged: 0 })),
}));
vi.mock("../server/managed-alarms-housekeeping", () => ({
  runManagementHousekeeping: vi.fn(async () => ({ expired: 0, visibleNotices: 0 })),
}));

import { getMonitoringHealth, runMonitoringJob } from "../server/monitoring-job";
import * as db from "../server/db-monitoring";
import * as preRegister from "../server/dms-preregister";
import * as pauses from "../server/dms-pauses";
import * as housekeeping from "../server/managed-alarms-housekeeping";

const rotinas = [
  ["Pré-registro de disparos", () => vi.mocked(preRegister.runPreRegistration)],
  ["Pausas do dead man's switch", () => vi.mocked(pauses.runDmsPauses)],
  ["Manutenção do acordo de alarmes", () => vi.mocked(housekeeping.runManagementHousekeeping)],
] as const;

/** Primeiras funções que cada Passo 1 a 4 chama. */
const passos = () => [
  db.getExpiredPendingEvents, // Passo 1
  db.getAccountsWithUnconfirmedEvents, // Passo 2
  db.getMissedCheckinEvents, // Passo 3
  db.getMissedMedicationEvents, // Passo 4
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(preRegister.runPreRegistration).mockResolvedValue({ registered: 0 });
  vi.mocked(pauses.runDmsPauses).mockResolvedValue({ paused: 0, noticesSent: 0, pinged: 0 });
  vi.mocked(housekeeping.runManagementHousekeeping).mockResolvedValue({ expired: 0, visibleNotices: 0 });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("monitoring-job: rotinas da Fase 4", () => {
  it("as três rodam ANTES do Passo 1, com o mesmo `now` do ciclo", async () => {
    await runMonitoringJob();

    const passo1 = vi.mocked(db.getExpiredPendingEvents).mock.invocationCallOrder[0];
    for (const [, rotina] of rotinas) {
      expect(rotina()).toHaveBeenCalledTimes(1);
      expect(rotina().mock.invocationCallOrder[0]).toBeLessThan(passo1);
    }
    const now = vi.mocked(preRegister.runPreRegistration).mock.calls[0][0];
    expect(now).toBeInstanceOf(Date);
    expect(vi.mocked(pauses.runDmsPauses).mock.calls[0][0]).toBe(now);
    expect(vi.mocked(housekeeping.runManagementHousekeeping).mock.calls[0][0]).toBe(now);
  });

  it.each(rotinas)("falha em '%s' não impede as outras rotinas nem os Passos 1 a 4", async (nome, rotina) => {
    rotina().mockRejectedValue(new Error("falha de teste"));

    const antes = getMonitoringHealth().consecutiveFailures;
    await runMonitoringJob();
    const depois = getMonitoringHealth();

    for (const [, outra] of rotinas) expect(outra()).toHaveBeenCalledTimes(1);
    for (const passo of passos()) expect(passo).toHaveBeenCalled();
    // O ciclo ainda é contado como FALHA: /api/health não pode ficar verde.
    expect(depois.consecutiveFailures).toBe(antes + 1);
    expect(depois.lastError).toContain(nome);
  });

  it("as três falharem juntas ainda deixa os Passos 1 a 4 rodarem e lista as três falhas", async () => {
    for (const [, rotina] of rotinas) rotina().mockRejectedValue(new Error("falha de teste"));

    await runMonitoringJob();
    const health = getMonitoringHealth();

    for (const passo of passos()) expect(passo).toHaveBeenCalled();
    for (const [nome] of rotinas) expect(health.lastError).toContain(nome);
  });

  it("um Passo quebrado continua não impedindo as rotinas novas (já rodaram antes)", async () => {
    vi.mocked(db.getExpiredPendingEvents).mockRejectedValueOnce(new Error("DATABASE_UNAVAILABLE"));

    await runMonitoringJob();

    for (const [, rotina] of rotinas) expect(rotina()).toHaveBeenCalledTimes(1);
    expect(db.getAccountsWithUnconfirmedEvents).toHaveBeenCalled();
  });

  it("ciclo sem falha nenhuma volta a reportar saudável", async () => {
    await runMonitoringJob();
    const health = getMonitoringHealth();

    expect(health.consecutiveFailures).toBe(0);
    expect(health.lastError).toBeNull();
    expect(health.healthy).toBe(true);
  });
});
