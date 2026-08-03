// tests/google-auth-fallback.test.ts
// Aparelhos sem navegador com Custom Tabs (Chrome desativado / ROM enxuta)
// faziam o expo-web-browser rejeitar e o login do Google nem abria (Samsung A15).
// openGoogleAuth cai para o navegador padrão do sistema nesses casos.
import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.hoisted: os vi.mock abaixo sobem para o topo do arquivo e leem estes valores.
const { platform, openURL } = vi.hoisted(() => ({
  platform: { OS: "android" },
  openURL: vi.fn().mockResolvedValue(true),
}));

vi.mock("react-native", () => ({
  Platform: {
    get OS() {
      return platform.OS;
    },
    select: (obj: Record<string, unknown>) => obj[platform.OS] ?? obj.default,
  },
  Linking: {
    openURL: (url: string) => openURL(url),
  },
}));

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: { multiSet: vi.fn(), multiRemove: vi.fn(), getItem: vi.fn() },
}));
vi.mock("expo-auth-session", () => ({ exchangeCodeAsync: vi.fn() }));
vi.mock("@/lib/auth-session", () => ({
  completeServerLogin: vi.fn(),
  getNextRoute: vi.fn(),
  postAuthRoute: vi.fn(),
}));

import { openGoogleAuth } from "@/lib/google-signin";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth?client_id=x";
const NO_BROWSER = new Error("No matching browser activity found");

describe("openGoogleAuth", () => {
  beforeEach(() => {
    platform.OS = "android";
    openURL.mockClear();
  });

  it("usa o Custom Tab quando ele funciona", async () => {
    const promptAsync = vi.fn().mockResolvedValue({ type: "dismiss" });

    expect(await openGoogleAuth(promptAsync, AUTH_URL)).toBe(false);
    expect(openURL).not.toHaveBeenCalled();
  });

  it("abre o navegador padrão quando não há Custom Tab no aparelho", async () => {
    const promptAsync = vi.fn().mockRejectedValue(NO_BROWSER);

    expect(await openGoogleAuth(promptAsync, AUTH_URL)).toBe(true);
    expect(openURL).toHaveBeenCalledWith(AUTH_URL);
  });

  it("propaga o erro quando não há URL para o fallback", async () => {
    const promptAsync = vi.fn().mockRejectedValue(NO_BROWSER);

    await expect(openGoogleAuth(promptAsync, null)).rejects.toThrow(NO_BROWSER);
    expect(openURL).not.toHaveBeenCalled();
  });

  it("não faz fallback no iOS (o retorno lá não vem por deep link)", async () => {
    platform.OS = "ios";
    const promptAsync = vi.fn().mockRejectedValue(NO_BROWSER);

    await expect(openGoogleAuth(promptAsync, AUTH_URL)).rejects.toThrow(NO_BROWSER);
    expect(openURL).not.toHaveBeenCalled();
  });
});
