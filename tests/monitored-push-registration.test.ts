/**
 * Comportamento do registro do token no MonitoredPushInitializer, com
 * expo-notifications simulado do jeito que o nativo se comporta: TODA
 * getDevicePushTokenAsync (inclusive a de dentro de getExpoPushTokenAsync)
 * dispara os listeners de token. Sem de-duplicar, registrar re-registraria
 * para sempre; e o unregister do logout recriaria o token no servidor.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type TokenListener = (t: { type: string; data: string }) => void;

const state = vi.hoisted(() => ({
  listeners: [] as ((t: { type: string; data: string }) => void)[],
  native: "native-1",
  openId: "u-1",
  expoCalls: 0,
  userCalls: 0,
  flipAtCall: -1,
}));

const trpcMutation = vi.hoisted(() => vi.fn());
const removeSpy = vi.hoisted(() => vi.fn());

// Efeitos rodam à mão: o componente não monta no vitest (RN).
const effects = vi.hoisted(() => [] as (() => void | (() => void))[]);
vi.mock("react", () => ({
  useEffect: (fn: () => void | (() => void)) => {
    effects.push(fn);
  },
  useRef: (v: unknown) => ({ current: v }),
}));
vi.mock("react-native", () => ({ Platform: { OS: "android" } }));
vi.mock("expo-notifications", () => ({
  addPushTokenListener: (l: TokenListener) => {
    state.listeners.push(l);
    return { remove: removeSpy };
  },
  addNotificationResponseReceivedListener: () => ({ remove: () => {} }),
  addNotificationReceivedListener: () => ({ remove: () => {} }),
  getLastNotificationResponseAsync: async () => null,
}));
vi.mock("@/lib/_core/auth", () => ({
  getUserInfo: async () => {
    const info = { openId: state.openId, userType: "monitored" };
    // Simula a troca de conta logo depois desta leitura.
    if (++state.userCalls === state.flipAtCall) state.openId = "u-2";
    return info;
  },
}));
vi.mock("@/lib/device-id", () => ({ getDeviceId: async () => "dev-1" }));
vi.mock("@/lib/managed-alarms-sync", () => ({ requestManagedSync: vi.fn() }));
vi.mock("@/lib/monitoring-service", () => ({ trpcMutation }));
vi.mock("@/lib/push-registration", () => ({
  // Igual ao real: pedir o token Expo passa pelo token nativo e o emite.
  getDevicePushToken: async () => {
    state.expoCalls += 1;
    if (state.expoCalls > 20) throw new Error("laço infinito de registro");
    state.listeners.forEach((l) => l({ type: "android", data: state.native }));
    return { token: "ExponentPushToken[x]", platform: "android" };
  },
}));

const flush = async () => {
  for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
};

async function mount() {
  const { MonitoredPushInitializer } = await import("../components/monitored-push-initializer");
  MonitoredPushInitializer();
  const cleanups = effects.map((e) => e()).filter((c): c is () => void => typeof c === "function");
  await flush();
  return cleanups;
}

const emit = (data: string) => state.listeners.forEach((l) => l({ type: "android", data }));
const registros = () => trpcMutation.mock.calls.filter((c) => c[0] === "push.register");

beforeEach(() => {
  vi.resetModules();
  effects.length = 0;
  state.listeners.length = 0;
  state.native = "native-1";
  state.openId = "u-1";
  state.expoCalls = 0;
  state.userCalls = 0;
  state.flipAtCall = -1;
  trpcMutation.mockReset();
  trpcMutation.mockResolvedValue({ success: true });
  removeSpy.mockReset();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("registro do token do idoso", () => {
  it("registra uma vez na montagem; o eco do próprio registro não registra de novo", async () => {
    await mount();
    expect(registros()).toHaveLength(1);
    expect(state.expoCalls).toBe(1);
  });

  it("o mesmo token nativo repetido (ex.: eco do unregister do logout) não registra", async () => {
    await mount();
    emit("native-1");
    emit("native-1");
    await flush();
    expect(registros()).toHaveLength(1);
  });

  it("um token nativo DIFERENTE registra mais uma vez, e o eco desse registro não gera laço", async () => {
    await mount();
    state.native = "native-2";
    emit("native-2");
    await flush();
    expect(registros()).toHaveLength(2);
    emit("native-2");
    await flush();
    expect(registros()).toHaveLength(2);
  });

  it("logout em andamento (backup travado): a troca de token não registra", async () => {
    await mount();
    const { setCloudPushBlocked } = await import("../lib/cloud-sync");
    setCloudPushBlocked(true);
    state.native = "native-2";
    emit("native-2");
    await flush();
    expect(registros()).toHaveLength(1);
  });

  it("a conta mudou durante a resolução do token: não registra o token na conta errada", async () => {
    await mount();
    state.flipAtCall = state.userCalls + 1; // 1ª leitura do próximo registro; a 2ª já vê u-2
    state.native = "native-2";
    emit("native-2");
    await flush();
    expect(registros()).toHaveLength(1);
  });

  it("solta a assinatura do listener ao desmontar", async () => {
    const cleanups = await mount();
    cleanups.forEach((c) => c());
    expect(removeSpy).toHaveBeenCalled();
  });
});
