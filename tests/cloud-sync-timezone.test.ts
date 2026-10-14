/**
 * O servidor calcula os disparos de cada conta no fuso dela (spec 5.1). O fuso
 * só chega se o app mandar em todo userData.put.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
vi.mock("@/constants/oauth", () => ({ getApiBaseUrl: () => "https://api.test" }));
vi.mock("../lib/_core/auth", () => ({ getSessionToken: async () => "jwt" }));

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

import { pushCloudData, type CloudSnapshot } from "../lib/cloud-sync";

const snapshot = {
  anamnesis: null,
  emergencyContacts: [],
  alarms: [],
  settings: null,
  healthMetrics: [],
  profile: null,
  dataUpdatedAt: 123,
} as CloudSnapshot;

const corpoEnviado = () => JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body).json;

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, status: 200 });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("pushCloudData envia o fuso do aparelho", () => {
  it("inclui o fuso IANA resolvido pelo Intl e mantém o snapshot", async () => {
    await pushCloudData(snapshot);
    const json = corpoEnviado();
    expect(json.timezone).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
    expect(json.dataUpdatedAt).toBe(123);
  });

  it("sem fuso resolvido, a chave não vai (o servidor mantém o que tinha)", async () => {
    vi.spyOn(Intl, "DateTimeFormat").mockImplementation(
      () => ({ resolvedOptions: () => ({ timeZone: "" }) }) as never
    );
    await pushCloudData(snapshot);
    expect("timezone" in corpoEnviado()).toBe(false);
  });

  it("Intl que lança (ROM sem ICU) não derruba o backup: a chave não vai e o motivo é logado", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(Intl, "DateTimeFormat").mockImplementation(() => {
      throw new Error("sem ICU");
    });
    await expect(pushCloudData(snapshot)).resolves.toBe(true);
    expect("timezone" in corpoEnviado()).toBe(false);
    expect(warn).toHaveBeenCalled();
  });
});
