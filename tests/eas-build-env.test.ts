import { describe, expect, it } from "vitest";
import easJson from "../eas.json";

/**
 * Perfis do EAS que geram app para testador/loja precisam levar as
 * EXPO_PUBLIC_* no bundle — o EAS NÃO lê o .env local nem os secrets do
 * GitHub (só os workflows do repo fazem isso).
 *
 * Sem EXPO_PUBLIC_API_BASE_URL o app sobe sem servidor: login anônimo falha
 * ("URL do servidor não configurada") e o botão de e-mail some, porque
 * fetchAuthMethods não consegue perguntar ao servidor o que está ligado.
 * Sem o client id da plataforma o Google recusa com "Missing required
 * parameter: client_id". Foi o que chegou ao TestFlight no iPhone.
 */
const DISTRIBUTABLE_PROFILES = ["preview", "production"] as const;

const REQUIRED_VARS = [
  "EXPO_PUBLIC_API_BASE_URL",
  "EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID",
  "EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID",
  "EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID",
] as const;

describe("eas.json — env dos perfis distribuíveis", () => {
  for (const profile of DISTRIBUTABLE_PROFILES) {
    for (const key of REQUIRED_VARS) {
      it(`${profile} define ${key}`, () => {
        const env = (easJson.build as Record<string, { env?: Record<string, string> }>)[
          profile
        ]?.env;
        expect(env?.[key], `${key} ausente no perfil ${profile} do eas.json`).toBeTruthy();
      });
    }
  }

  it("aponta para o servidor de produção via https", () => {
    for (const profile of DISTRIBUTABLE_PROFILES) {
      const url = (easJson.build as Record<string, { env?: Record<string, string> }>)[
        profile
      ].env!.EXPO_PUBLIC_API_BASE_URL;
      expect(url.startsWith("https://"), `${profile} deve usar https`).toBe(true);
    }
  });
});
