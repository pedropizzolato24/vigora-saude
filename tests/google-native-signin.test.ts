// tests/google-native-signin.test.ts
// Login Google pelo Play Services — caminho que não depende de navegador
// (aparelhos sem Custom Tab e sem navegador visível, ex. Samsung A15).
import { describe, it, expect, vi, beforeEach } from "vitest";

const { configure, hasPlayServices, signIn } = vi.hoisted(() => ({
  configure: vi.fn(),
  hasPlayServices: vi.fn().mockResolvedValue(true),
  signIn: vi.fn(),
}));
const { postAuthRoute, completeServerLogin } = vi.hoisted(() => ({
  postAuthRoute: vi.fn().mockResolvedValue({ sessionToken: "t", user: {} }),
  completeServerLogin: vi.fn().mockResolvedValue(undefined),
}));

// @/constants/oauth importa react-native só para o Platform.OS do fallback web.
vi.mock("react-native", () => ({
  Platform: { OS: "android", select: (o: any) => o.android ?? o.default },
}));
vi.mock("@react-native-google-signin/google-signin", () => ({
  GoogleSignin: { configure, hasPlayServices, signIn },
}));
vi.mock("@/lib/auth-session", () => ({
  postAuthRoute,
  completeServerLogin,
  getNextRoute: vi.fn(),
}));

import { signInWithGoogleNative } from "@/lib/google-native-signin";

const router = {} as any;
const reconcile = vi.fn().mockResolvedValue(undefined);

describe("signInWithGoogleNative", () => {
  beforeEach(() => {
    signIn.mockClear();
    postAuthRoute.mockClear();
    completeServerLogin.mockClear();
  });

  it("manda o id_token para o servidor e conclui a sessão", async () => {
    signIn.mockResolvedValueOnce({
      type: "success",
      data: { idToken: "id-token-do-play-services" },
    });

    expect(await signInWithGoogleNative(router, reconcile)).toBe(true);
    expect(postAuthRoute).toHaveBeenCalledWith("/api/auth/google", {
      id_token: "id-token-do-play-services",
    });
    expect(completeServerLogin).toHaveBeenCalled();
  });

  it("fechar o seletor de conta não é erro nem autentica", async () => {
    signIn.mockResolvedValueOnce({ type: "cancelled", data: null });

    expect(await signInWithGoogleNative(router, reconcile)).toBe(false);
    expect(postAuthRoute).not.toHaveBeenCalled();
  });

  it("falha alto se o Play Services devolver sucesso sem id_token", async () => {
    signIn.mockResolvedValueOnce({ type: "success", data: { idToken: null } });

    await expect(signInWithGoogleNative(router, reconcile)).rejects.toThrow(
      /id_token/
    );
    expect(postAuthRoute).not.toHaveBeenCalled();
  });

  it("propaga a ausência do Play Services (o login cai para o navegador)", async () => {
    hasPlayServices.mockRejectedValueOnce(new Error("PLAY_SERVICES_NOT_AVAILABLE"));

    await expect(signInWithGoogleNative(router, reconcile)).rejects.toThrow(
      /PLAY_SERVICES_NOT_AVAILABLE/
    );
    expect(signIn).not.toHaveBeenCalled();
  });
});
