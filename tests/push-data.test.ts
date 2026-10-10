/**
 * push-data.test.ts
 *
 * Push silencioso (só dados) e leitura de recibos da Expo. O silencioso carrega
 * a lista gerenciada até o celular do idoso e a verificação diária de "app
 * removido"; nenhum dos dois pode virar notificação visível nem apagar token
 * por conta própria (quem chama decide).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const deletePushToken = vi.fn(async (_token: string) => {});
vi.mock("../server/db-push", () => ({
  deletePushToken: (token: string) => deletePushToken(token),
}));

import { fetchExpoReceipts, sendExpoDataPush } from "../server/push";

function mockFetchJson(body: unknown, ok = true, status = 200) {
  return vi.spyOn(global, "fetch").mockResolvedValue({
    ok,
    status,
    json: async () => body,
  } as unknown as Response);
}

beforeEach(() => {
  deletePushToken.mockClear();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("sendExpoDataPush", () => {
  it("sem tokens não chama a Expo e devolve lista vazia", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    await expect(sendExpoDataPush([], { type: "ping" })).resolves.toEqual([]);
    await expect(sendExpoDataPush([""], { type: "ping" })).resolves.toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("manda só dados: contentAvailable, prioridade alta, sem título, corpo nem som", async () => {
    const fetchSpy = mockFetchJson({ data: [{ status: "ok", id: "t-1" }] });

    await sendExpoDataPush(["ExpoTok[a]"], { type: "managed_alarms_updated", version: 3 });

    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toBe("https://exp.host/--/api/v2/push/send");
    const messages = JSON.parse((init as RequestInit).body as string);
    expect(messages).toEqual([
      {
        to: "ExpoTok[a]",
        data: { type: "managed_alarms_updated", version: 3 },
        _contentAvailable: true,
        priority: "high",
      },
    ]);
    expect(messages[0]).not.toHaveProperty("title");
    expect(messages[0]).not.toHaveProperty("body");
    expect(messages[0]).not.toHaveProperty("sound");
  });

  it("devolve o ticket de cada token e marca DeviceNotRegistered sem apagar o token", async () => {
    mockFetchJson({
      data: [
        { status: "ok", id: "t-1" },
        { status: "error", message: "x", details: { error: "DeviceNotRegistered" } },
        { status: "error", message: "MessageTooBig" },
      ],
    });

    const result = await sendExpoDataPush(["a", "b", "c"], { type: "ping" });

    expect(result).toEqual([
      { token: "a", ticketId: "t-1", deviceNotRegistered: false },
      { token: "b", ticketId: null, deviceNotRegistered: true },
      { token: "c", ticketId: null, deviceNotRegistered: false },
    ]);
    expect(deletePushToken).not.toHaveBeenCalled();
  });

  it("HTTP de erro devolve os tokens sem ticket (nada some em silêncio)", async () => {
    mockFetchJson({}, false, 500);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const result = await sendExpoDataPush(["a", "b"], { type: "ping" });

    expect(result).toEqual([
      { token: "a", ticketId: null, deviceNotRegistered: false },
      { token: "b", ticketId: null, deviceNotRegistered: false },
    ]);
  });

  it("erro de rede devolve os tokens sem ticket e loga só o nome do erro", async () => {
    vi.spyOn(global, "fetch").mockRejectedValue(new TypeError("segredo-no-texto-do-erro"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await sendExpoDataPush(["a"], { type: "ping" });

    expect(result).toEqual([{ token: "a", ticketId: null, deviceNotRegistered: false }]);
    expect(JSON.stringify(errSpy.mock.calls)).not.toContain("segredo-no-texto-do-erro");
    expect(JSON.stringify(errSpy.mock.calls)).toContain("TypeError");
  });

  it("separa em lotes de no máximo 100 mensagens", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockImplementation(async (_url, opts) => {
      const msgs = JSON.parse((opts as RequestInit).body as string) as unknown[];
      return {
        ok: true,
        json: async () => ({ data: msgs.map((_, i) => ({ status: "ok", id: `t${i}` })) }),
      } as unknown as Response;
    });
    const tokens = Array.from({ length: 250 }, (_, i) => `tok${i}`);

    const result = await sendExpoDataPush(tokens, { type: "ping" });

    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(result).toHaveLength(250);
    expect(result[249].token).toBe("tok249");
  });
});

describe("fetchExpoReceipts", () => {
  it("sem ids não chama a Expo", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    await expect(fetchExpoReceipts([])).resolves.toEqual({});
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("consulta os recibos e devolve o mapa id -> recibo", async () => {
    const fetchSpy = mockFetchJson({
      data: {
        "t-1": { status: "ok" },
        "t-2": { status: "error", message: "x", details: { error: "DeviceNotRegistered" } },
      },
    });

    const result = await fetchExpoReceipts(["t-1", "t-2"]);

    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toBe("https://exp.host/--/api/v2/push/getReceipts");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ ids: ["t-1", "t-2"] });
    expect(result["t-1"]).toEqual({ status: "ok" });
    expect(result["t-2"].details?.error).toBe("DeviceNotRegistered");
  });

  it("HTTP de erro devolve mapa vazio", async () => {
    mockFetchJson({}, false, 503);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(fetchExpoReceipts(["t-1"])).resolves.toEqual({});
  });

  it("erro de rede devolve mapa vazio e loga só o nome do erro", async () => {
    vi.spyOn(global, "fetch").mockRejectedValue(new TypeError("segredo-no-texto-do-erro"));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(fetchExpoReceipts(["t-1"])).resolves.toEqual({});
    expect(JSON.stringify(warnSpy.mock.calls)).not.toContain("segredo-no-texto-do-erro");
    expect(JSON.stringify(warnSpy.mock.calls)).toContain("TypeError");
  });

  it("junta o resultado de vários lotes", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockImplementation(async (_url, opts) => {
      const { ids } = JSON.parse((opts as RequestInit).body as string) as { ids: string[] };
      return {
        ok: true,
        json: async () => ({ data: Object.fromEntries(ids.map((id) => [id, { status: "ok" }])) }),
      } as unknown as Response;
    });
    const ids = Array.from({ length: 650 }, (_, i) => `t${i}`);

    const result = await fetchExpoReceipts(ids);

    expect(fetchSpy).toHaveBeenCalledTimes(3); // 300 + 300 + 50
    expect(Object.keys(result)).toHaveLength(650);
  });
});
