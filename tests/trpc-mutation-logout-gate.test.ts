/**
 * trpcMutation durante o logout.
 *
 * O logout pausa o dead man's switch no servidor (deviceSignedOut). Qualquer
 * chamada que conta como sinal de vida do aparelho e chegue DEPOIS retoma a
 * pausa — inclusive um retry que já estava em curso. Enquanto o backup está
 * travado (isCloudPushBlocked), essas chamadas não saem, em nenhuma tentativa.
 * O que o próprio logout precisa (push.unregister, deviceSignedOut) segue livre.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
}));
vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
  AppState: { addEventListener: () => ({ remove() {} }), currentState: "active" },
}));
vi.mock("expo-alarm-countdown", () => ({ isIgnoringBatteryOptimizations: async () => true }));
vi.mock("../lib/device-id", () => ({ getDeviceId: async () => "dev-1" }));
vi.mock("@/constants/oauth", () => ({ getApiBaseUrl: () => "https://api.test" }));
vi.mock("../lib/alarm-fire-times", () => ({ nextAlarmFireMs: () => null }));
vi.mock("../lib/_core/auth", () => ({
  getSessionToken: async () => "jwt",
  getUserInfo: async () => ({ openId: "u-1", userType: "monitored" }),
  isSessionExpiredStatus: (s: number) => s === 401,
  handleUnauthorized: async () => {},
}));

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const ok = () => ({ ok: true, status: 200, json: async () => ({ result: { data: { json: { success: true } } } }) });

const SIGNALS = [
  "monitoring.heartbeat",
  "monitoring.createEvent",
  "monitoring.confirmEvent",
  "managedAlarms.ack",
  "userData.put",
  "push.register",
];

async function load() {
  const service = await import("../lib/monitoring-service");
  const cloud = await import("../lib/cloud-sync");
  return { trpcMutation: service.trpcMutation, setCloudPushBlocked: cloud.setCloudPushBlocked };
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(ok());
  vi.resetModules();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("trpcMutation com o logout em andamento", () => {
  it.each(SIGNALS)("%s não sai e devolve null", async (procedure) => {
    const { trpcMutation, setCloudPushBlocked } = await load();
    setCloudPushBlocked(true);

    await expect(trpcMutation(procedure, {})).resolves.toBeNull();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["push.unregister", "monitoring.deviceSignedOut"])("%s (o próprio logout) continua saindo", async (procedure) => {
    const { trpcMutation, setCloudPushBlocked } = await load();
    setCloudPushBlocked(true);

    await expect(trpcMutation(procedure, {})).resolves.toEqual({ success: true });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retry de um sinal que começou ANTES do logout não é reenviado depois da trava", async () => {
    vi.useFakeTimers();
    const { trpcMutation, setCloudPushBlocked } = await load();
    fetchMock.mockImplementationOnce(async () => {
      setCloudPushBlocked(true); // o logout começa enquanto a 1ª tentativa falha
      return { ok: false, status: 503, text: async () => "indisponível" };
    });

    const result = trpcMutation("monitoring.heartbeat", {});
    await vi.advanceTimersByTimeAsync(10_000);

    await expect(result).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sem logout, os sinais saem normalmente", async () => {
    const { trpcMutation } = await load();

    await expect(trpcMutation("monitoring.heartbeat", {})).resolves.toEqual({ success: true });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
