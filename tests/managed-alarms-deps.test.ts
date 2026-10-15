/**
 * createManagedAlarmsDeps: a ponte entre o aplicador puro e o servidor.
 * trpcQuery/trpcMutation devolvem null em TODA falha e nunca lançam; o ack
 * precisa traduzir esse null em exceção, senão o aplicador marcaria como
 * confirmada uma versão que o servidor nunca recebeu.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

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

const ok = (json: unknown) => ({ ok: true, status: 200, json: async () => ({ result: { data: { json } } }) });
const recusa = () => ({ ok: false, status: 400, text: async () => "erro" });

const base = { getLocal: () => [], getManagement: () => null, dispatch: () => {} };

beforeEach(() => {
  fetchMock.mockReset();
  vi.resetModules();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("createManagedAlarmsDeps", () => {
  it("fetchMine devolve a resposta de managedAlarms.mine", async () => {
    const mine = { pendingRequest: null, management: null, list: null };
    fetchMock.mockResolvedValue(ok(mine));
    const { createManagedAlarmsDeps } = await import("../lib/managed-alarms-sync");

    expect(await createManagedAlarmsDeps(base).fetchMine()).toEqual(mine);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/api/trpc/managedAlarms.mine");
  });

  it("fetchMine devolve null quando o servidor recusa ou a forma não é a esperada", async () => {
    const { createManagedAlarmsDeps } = await import("../lib/managed-alarms-sync");
    fetchMock.mockResolvedValueOnce(recusa());
    expect(await createManagedAlarmsDeps(base).fetchMine()).toBeNull();

    fetchMock.mockResolvedValueOnce(ok({ qualquer: "coisa" }));
    expect(await createManagedAlarmsDeps(base).fetchMine()).toBeNull();
  });

  it("ack envia a versão e os ids que falharam", async () => {
    fetchMock.mockResolvedValue(ok({ success: true }));
    const { createManagedAlarmsDeps } = await import("../lib/managed-alarms-sync");

    await createManagedAlarmsDeps(base).ack(3, ["b"]);

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/api/trpc/managedAlarms.ack");
    expect(JSON.parse((init as { body: string }).body)).toEqual({ json: { version: 3, failedAlarmIds: ["b"] } });
  });

  it("ack LANÇA quando a confirmação não chega ao servidor", async () => {
    fetchMock.mockResolvedValue(recusa());
    const { createManagedAlarmsDeps } = await import("../lib/managed-alarms-sync");

    await expect(createManagedAlarmsDeps(base).ack(3, [])).rejects.toThrow();
  });
});
