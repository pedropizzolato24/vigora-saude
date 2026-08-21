/**
 * pending-alarm-confirmations.test.ts
 *
 * O idoso aperta "Desligar", a confirmação não chega ao servidor, e a família
 * recebe WhatsApp de alarme perdido. É o pior falso alarme do produto e hoje
 * ele acontece em silêncio:
 *
 *  - `trpcMutation` NUNCA lança. Devolve `null` em toda falha — sem sessão,
 *    4xx, 5xx depois dos retries, timeout de 15s, rede caída.
 *  - Os call sites fazem `confirmAlarmResponded(...).catch(() => {})`, então o
 *    catch nem dispara: a função "termina bem" sem nada ter chegado ao servidor.
 *  - `alarm-ring` faz `router.replace` logo em seguida; se o app for morto ou
 *    perder rede nesses segundos, a resposta do idoso se perde para sempre.
 *
 * A fila local guarda a confirmação ANTES de tentar a rede e só a remove
 * quando a chamada chegou ao servidor (resposta OK) — o que não é o mesmo que
 * o evento ter casado: `confirmEvent` devolve `{ success: true }` mesmo sem
 * casar com (alarmId, scheduledAt). O que a fila garante é entrega. O que
 * sobrar é reenviado no próximo boot autenticado. Evidência positiva apenas —
 * só entra na fila o que o usuário realmente respondeu, então nada aqui
 * afrouxa o dead man's switch.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = new Map<string, string>();
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (k: string) => storage.get(k) ?? null,
    setItem: async (k: string, v: string) => void storage.set(k, v),
    removeItem: async (k: string) => void storage.delete(k),
  },
}));

vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
  AppState: { addEventListener: () => ({ remove() {} }), currentState: "active" },
}));
vi.mock("expo-alarm-countdown", () => ({
  isIgnoringBatteryOptimizations: async () => true,
}));
vi.mock("../lib/device-id", () => ({ getDeviceId: async () => "dev-1" }));
vi.mock("@/constants/oauth", () => ({ getApiBaseUrl: () => "https://api.test" }));
vi.mock("../lib/alarm-fire-times", () => ({ nextAlarmFireMs: () => null }));

let sessionToken: string | null = "jwt";
vi.mock("../lib/_core/auth", () => ({
  getSessionToken: async () => sessionToken,
  getUserInfo: async () => (sessionToken ? { openId: "u-1" } : null),
  isSessionExpiredStatus: (s: number) => s === 401,
  handleUnauthorized: async () => {},
}));

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const ok = () => ({ ok: true, status: 200, json: async () => ({ result: { data: { json: {} } } }) });
const boom = () => ({ ok: false, status: 400, text: async () => "erro" });

const ALARM = { id: "a1", time: "08:00", description: "Losartana" } as never;
const SCHEDULED = new Date("2026-08-13T11:00:00.000Z");

beforeEach(() => {
  storage.clear();
  fetchMock.mockReset();
  sessionToken = "jwt";
  vi.resetModules();
});

describe("fila de confirmações pendentes", () => {
  it("mantém a confirmação na fila quando o servidor não confirma", async () => {
    fetchMock.mockResolvedValue(boom());
    const svc = await import("../lib/monitoring-service");
    const queue = await import("../lib/pending-confirmations");

    await svc.confirmAlarmResponded(ALARM, SCHEDULED);

    const pending = await queue.listPendingConfirmations();
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      alarmId: "a1",
      status: "responded",
      scheduledAtIso: SCHEDULED.toISOString(),
    });
  });

  it("remove da fila quando o servidor confirma", async () => {
    fetchMock.mockResolvedValue(ok());
    const svc = await import("../lib/monitoring-service");
    const queue = await import("../lib/pending-confirmations");

    await svc.confirmAlarmResponded(ALARM, SCHEDULED);

    expect(await queue.listPendingConfirmations()).toHaveLength(0);
  });

  it("enfileira mesmo sem sessão — trpcMutation devolve null sem lançar", async () => {
    sessionToken = null;
    const svc = await import("../lib/monitoring-service");
    const queue = await import("../lib/pending-confirmations");

    await svc.confirmAlarmResponded(ALARM, SCHEDULED);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(await queue.listPendingConfirmations()).toHaveLength(1);
  });

  it("também vale para alarme perdido (confirmAlarmMissed)", async () => {
    fetchMock.mockResolvedValue(boom());
    const svc = await import("../lib/monitoring-service");
    const queue = await import("../lib/pending-confirmations");

    await svc.confirmAlarmMissed(ALARM, SCHEDULED);

    expect((await queue.listPendingConfirmations())[0]?.status).toBe("missed");
  });

  it("não duplica quando o mesmo disparo é confirmado duas vezes", async () => {
    fetchMock.mockResolvedValue(boom());
    const svc = await import("../lib/monitoring-service");
    const queue = await import("../lib/pending-confirmations");

    await svc.confirmAlarmResponded(ALARM, SCHEDULED);
    await svc.confirmAlarmResponded(ALARM, SCHEDULED);

    expect(await queue.listPendingConfirmations()).toHaveLength(1);
  });
});

describe("flush no boot", () => {
  it("reenvia o que ficou pendente e limpa a fila", async () => {
    fetchMock.mockResolvedValue(boom());
    const svc = await import("../lib/monitoring-service");
    const queue = await import("../lib/pending-confirmations");
    await svc.confirmAlarmResponded(ALARM, SCHEDULED);
    expect(await queue.listPendingConfirmations()).toHaveLength(1);

    fetchMock.mockResolvedValue(ok());
    await svc.flushPendingConfirmations();

    expect(await queue.listPendingConfirmations()).toHaveLength(0);
  });

  it("mantém na fila se o reenvio também falhar", async () => {
    fetchMock.mockResolvedValue(boom());
    const svc = await import("../lib/monitoring-service");
    const queue = await import("../lib/pending-confirmations");
    await svc.confirmAlarmResponded(ALARM, SCHEDULED);

    await svc.flushPendingConfirmations();

    expect(await queue.listPendingConfirmations()).toHaveLength(1);
  });

  it("dois flushes ao mesmo tempo não viram duas rodadas de reenvio", async () => {
    // O boot por dismiss dispara um flush e o MonitoringInitializer dispara
    // outro. A fila é read-modify-write sem trava: intercalados, um
    // enqueueConfirmation no meio some — e o que some é uma resposta que o
    // idoso deu de verdade.
    fetchMock.mockResolvedValue(boom());
    const svc = await import("../lib/monitoring-service");
    const queue = await import("../lib/pending-confirmations");
    await svc.confirmAlarmResponded(ALARM, SCHEDULED);

    fetchMock.mockClear();
    fetchMock.mockResolvedValue(ok());
    await Promise.all([
      svc.flushPendingConfirmations(),
      svc.flushPendingConfirmations(),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await queue.listPendingConfirmations()).toHaveLength(0);
  });

  it("descarta confirmação velha demais para importar (>24h)", async () => {
    const queue = await import("../lib/pending-confirmations");
    await queue.enqueueConfirmation({
      alarmId: "a1",
      scheduledAtIso: SCHEDULED.toISOString(),
      status: "responded",
    });
    // Envelhece a entrada além do TTL.
    const raw = JSON.parse(storage.get("vigora_pending_alarm_confirmations")!);
    raw[0].queuedAt = Date.now() - 25 * 60 * 60 * 1000;
    storage.set("vigora_pending_alarm_confirmations", JSON.stringify(raw));

    expect(await queue.listPendingConfirmations()).toHaveLength(0);
  });
});

/**
 * A guarda do `flushEmAndamento` fecha a corrida entre DOIS FLUSHES — não a da
 * fila. Toda operação daqui é read-modify-write sobre a mesma chave, e o
 * AlarmKit criou justamente o cenário de sobreposição: no boot por dismiss a
 * confirmação é enfileirada enquanto o MonitoringInitializer já pode estar
 * drenando. Intercaladas, uma gravação sobrescreve a outra — e o que some é um
 * "respondeu" real do idoso, que vira WhatsApp de alarme perdido para a
 * família.
 */
describe("operações concorrentes na fila", () => {
  const OUTRO = new Date("2026-08-13T22:00:00.000Z");

  it("dois enfileiramentos ao mesmo tempo não perdem nenhum dos dois", async () => {
    const queue = await import("../lib/pending-confirmations");

    await Promise.all([
      queue.enqueueConfirmation({
        alarmId: "a1",
        scheduledAtIso: SCHEDULED.toISOString(),
        status: "responded",
      }),
      queue.enqueueConfirmation({
        alarmId: "a2",
        scheduledAtIso: OUTRO.toISOString(),
        status: "responded",
      }),
    ]);

    const pendentes = await queue.listPendingConfirmations();
    expect(pendentes.map((p) => p.alarmId).sort()).toEqual(["a1", "a2"]);
  });

  it("enfileirar durante o dreno não ressuscita o que saiu nem some com o novo", async () => {
    const queue = await import("../lib/pending-confirmations");
    await queue.enqueueConfirmation({
      alarmId: "a1",
      scheduledAtIso: SCHEDULED.toISOString(),
      status: "responded",
    });

    await Promise.all([
      queue.dequeueConfirmation("a1", SCHEDULED.toISOString()),
      queue.enqueueConfirmation({
        alarmId: "a2",
        scheduledAtIso: OUTRO.toISOString(),
        status: "responded",
      }),
    ]);

    const pendentes = await queue.listPendingConfirmations();
    expect(pendentes.map((p) => p.alarmId)).toEqual(["a2"]);
  });

  it("a limpeza de expirados não apaga uma confirmação enfileirada em paralelo", async () => {
    // listPendingConfirmations também grava (descarta os expirados): é o
    // terceiro read-modify-write sobre a mesma chave.
    const queue = await import("../lib/pending-confirmations");
    await queue.enqueueConfirmation({
      alarmId: "velha",
      scheduledAtIso: SCHEDULED.toISOString(),
      status: "responded",
    });
    const raw = JSON.parse(storage.get("vigora_pending_alarm_confirmations")!);
    raw[0].queuedAt = Date.now() - 25 * 60 * 60 * 1000;
    storage.set("vigora_pending_alarm_confirmations", JSON.stringify(raw));

    await Promise.all([
      queue.listPendingConfirmations(),
      queue.enqueueConfirmation({
        alarmId: "a2",
        scheduledAtIso: OUTRO.toISOString(),
        status: "responded",
      }),
    ]);

    expect((await queue.listPendingConfirmations()).map((p) => p.alarmId)).toEqual([
      "a2",
    ]);
  });
});
