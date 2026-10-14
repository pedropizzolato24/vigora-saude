/**
 * notifyDeviceSignedOut: o logout pausa os avisos da conta na hora. Não pode
 * travar o logout (prazo curto, sem nova tentativa) nem lançar.
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

let sessionToken: string | null = "jwt";
let userType: "monitored" | "caregiver" | null = "monitored";
vi.mock("../lib/_core/auth", () => ({
  getSessionToken: async () => sessionToken,
  getUserInfo: async () => (sessionToken ? { openId: "u-1", userType } : null),
  isSessionExpiredStatus: (s: number) => s === 401,
  handleUnauthorized: vi.fn(async () => {}),
}));

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

beforeEach(() => {
  fetchMock.mockReset();
  sessionToken = "jwt";
  userType = "monitored";
  vi.resetModules();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("notifyDeviceSignedOut", () => {
  it("avisa o servidor com a sessão ainda válida", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
    const svc = await import("../lib/monitoring-service");

    await svc.notifyDeviceSignedOut();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://api.test/api/trpc/monitoring.deviceSignedOut");
    expect((init as { method: string }).method).toBe("POST");
    expect((init as { headers: Record<string, string> }).headers.Authorization).toBe("Bearer jwt");
  });

  it("conta de cuidador não chama (a rota é do idoso)", async () => {
    userType = "caregiver";
    const svc = await import("../lib/monitoring-service");
    await svc.notifyDeviceSignedOut();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sem sessão não chama", async () => {
    sessionToken = null;
    const svc = await import("../lib/monitoring-service");
    await svc.notifyDeviceSignedOut();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rede caída: não lança, loga só o nome do erro e faz UMA tentativa", async () => {
    fetchMock.mockRejectedValue(new Error("senha=123 vazou na mensagem"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const svc = await import("../lib/monitoring-service");

    await expect(svc.notifyDeviceSignedOut()).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(warn.mock.calls)).not.toContain("senha");
  });

  it("401 não dispara o fluxo de sessão expirada (o usuário já está saindo)", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401 });
    const Auth = await import("../lib/_core/auth");
    const svc = await import("../lib/monitoring-service");

    await svc.notifyDeviceSignedOut();

    expect(Auth.handleUnauthorized).not.toHaveBeenCalled();
  });

  it("servidor que não responde: desiste em 4 s em vez de travar o logout", async () => {
    const svc = await import("../lib/monitoring-service"); // antes dos timers falsos
    vi.useFakeTimers();
    let abortado = false;
    fetchMock.mockImplementation(
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener("abort", () => {
            abortado = true;
            reject(Object.assign(new Error("abortado"), { name: "AbortError" }));
          });
        })
    );

    const fim = svc.notifyDeviceSignedOut();
    await vi.advanceTimersByTimeAsync(4100);
    await fim;

    expect(abortado).toBe(true);
  });

  it("para o heartbeat antes de avisar: nenhum heartbeat sai depois do deviceSignedOut", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ result: { data: { json: {} } } }) });
    const svc = await import("../lib/monitoring-service");

    svc.startHeartbeat();
    await vi.advanceTimersByTimeAsync(0);
    await svc.notifyDeviceSignedOut();
    const urls = () => fetchMock.mock.calls.map((c) => String(c[0]));
    const avisoEm = urls().findIndex((u) => u.endsWith("/monitoring.deviceSignedOut"));
    expect(avisoEm).toBeGreaterThanOrEqual(0);

    await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 1000);

    const depois = urls().slice(avisoEm + 1);
    expect(depois.some((u) => u.includes("/monitoring.heartbeat"))).toBe(false);
  });
});
