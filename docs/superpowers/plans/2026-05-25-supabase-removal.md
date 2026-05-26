# Supabase Removal — Google OAuth Direto

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminar `@supabase/supabase-js` completamente, substituindo o fluxo de autenticação por `expo-auth-session` (cliente) + endpoint `POST /api/auth/google` com verificação via `oauth2.googleapis.com/tokeninfo` (servidor).

**Architecture:** O cliente usa `expo-auth-session/providers/google` para gerar a URL OAuth, trocar o code por tokens diretamente com o Google, e enviar o `id_token` ao servidor Railway. O servidor verifica o `id_token` com o endpoint público do Google (sem secret), faz upsert no MySQL Railway, e retorna o JWT de sessão existente. O `expo-web-browser` intercepta o redirect antes do Expo Router, então `app/oauth/callback.tsx` é deletado — toda a lógica pós-login vive em `login.tsx`.

**Tech Stack:** `expo-auth-session` ^4.x, `expo-web-browser` (já instalado), `vitest`, Express, Drizzle/MySQL (Railway), `jose` (JWT — já no servidor).

---

## Mapa de Arquivos

| Ação | Arquivo | Responsabilidade |
| ---- | ------- | ---------------- |
| Modificar | `package.json` | Trocar `@supabase/supabase-js` por `expo-auth-session` |
| Modificar | `constants/oauth.ts` | Adicionar `GOOGLE_ANDROID_CLIENT_ID`, `GOOGLE_IOS_CLIENT_ID`, `GOOGLE_WEB_CLIENT_ID` |
| Criar | `tests/google-auth.test.ts` | Testes unitários de `verifyGoogleIdToken` e `handleGoogleAuth` |
| Criar | `server/google-auth.ts` | Endpoint `POST /api/auth/google` com verificação via tokeninfo |
| Modificar | `server/_core/index.ts` | Trocar `registerSupabaseAuthRoute` → `registerGoogleAuthRoute` |
| Modificar | `app/login.tsx` | Substituir Supabase SDK por `Google.useAuthRequest` + `exchangeCodeAsync` |
| Deletar | `lib/supabase.ts` | Não mais necessário |
| Deletar | `lib/supabase-sync.ts` | Já era no-op |
| Deletar | `app/oauth/callback.tsx` | expo-web-browser intercepta antes do Expo Router |
| Deletar | `server/supabase-auth.ts` | Substituído por `server/google-auth.ts` |
| Deletar | `supabase/` (pasta inteira) | Edge Function e schema obsoletos |
| Deletar | `tests/supabase-credentials.test.ts` | Testa credenciais Supabase |
| Deletar | `tests/supabase.lockdown.test.ts` | Testa schema Supabase |
| Deletar | `tests/edge-function-auth.test.ts` | Testa Edge Function auth |
| Deletar | `tests/edge-function-query.test.ts` | Testa Edge Function query |
| Modificar | `server/_core/sdk.ts` | Atualizar comentário estale sobre `/api/auth/supabase` |
| Modificar | `server/_core/oauth.ts` | Atualizar comentário estale sobre Supabase |

---

## Task 1: Trocar dependência de pacote

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Remover @supabase/supabase-js e adicionar expo-auth-session**

Editar `package.json`. Remover a linha:
```json
"@supabase/supabase-js": "^2.105.1",
```

Adicionar (em ordem alfabética junto com os outros expo-*):
```json
"expo-auth-session": "~6.0.3",
```

- [ ] **Step 2: Instalar dependências**

```bash
npx expo install expo-auth-session
```

Saída esperada: `expo-auth-session` instalado sem conflitos de peer.

- [ ] **Step 3: Verificar que @supabase não aparece mais**

```bash
cat package.json | grep supabase
```

Saída esperada: nenhuma linha.

---

## Task 2: Adicionar constantes de Client ID do Google

**Files:**
- Modify: `constants/oauth.ts`

- [ ] **Step 1: Adicionar as três constantes ao fim do arquivo**

O arquivo atual termina com `export const USER_INFO_KEY = "vigora-user-info";`. Adicionar após essa linha:

```ts
// Google OAuth Client IDs — configurar via EAS Secrets ou .env
// expo-auth-session/providers/google seleciona o ID correto por plataforma automaticamente.
// Android usa domínio reverso (com.vigora.saude:/), iOS idem — o Google valida por package/bundle.
// Web usa o proxy Expo (https://auth.expo.io) durante desenvolvimento com Expo Go.
export const GOOGLE_ANDROID_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ?? "";
export const GOOGLE_IOS_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? "";
export const GOOGLE_WEB_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? "";
```

- [ ] **Step 2: Criar variáveis de ambiente locais para desenvolvimento**

Criar (ou editar) `.env` na raiz do projeto:
```
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=<Android Client ID do Google Cloud Console>
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=<iOS Client ID do Google Cloud Console>
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=<Web Client ID do Google Cloud Console>
```

> Esses valores só são necessários para testar o login de verdade. Os testes unitários da Task 3 não dependem deles.

---

## Task 3: Escrever os testes para google-auth.ts (TDD — falha primeiro)

**Files:**
- Create: `tests/google-auth.test.ts`

- [ ] **Step 1: Criar o arquivo de testes**

```ts
// tests/google-auth.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mocks declarados ANTES do import do módulo testado
vi.mock("../server/db", () => ({
  upsertUser: vi.fn().mockResolvedValue(undefined),
  getUserByOpenId: vi.fn().mockResolvedValue({
    id: 1,
    openId: "google:abc123",
    name: "Test User",
    email: "test@example.com",
    phone: null,
    userType: null,
    birthDate: null,
    bloodType: null,
    loginMethod: "google",
    lastSignedIn: new Date("2026-01-01"),
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    role: "user",
  }),
}));

vi.mock("../server/_core/sdk", () => ({
  sdk: {
    signSession: vi.fn().mockResolvedValue("mock-session-token"),
  },
}));

import { handleGoogleAuth, verifyGoogleIdToken } from "../server/google-auth";
import { upsertUser } from "../server/db";

const MOCK_TOKEN_INFO = {
  sub: "abc123",
  email: "test@example.com",
  name: "Test User",
  aud: "web-client-id.apps.googleusercontent.com",
  iss: "accounts.google.com",
  exp: String(Math.floor(Date.now() / 1000) + 3600),
};

describe("verifyGoogleIdToken", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("retorna payload quando Google responde 200", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(MOCK_TOKEN_INFO), { status: 200 })
    );

    const result = await verifyGoogleIdToken("valid-token");

    expect(result.sub).toBe("abc123");
    expect(result.email).toBe("test@example.com");
    expect(result.name).toBe("Test User");
  });

  it("lança INVALID_TOKEN quando Google responde com status não-200", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "invalid_token" }), { status: 400 })
    );

    await expect(verifyGoogleIdToken("bad-token")).rejects.toThrow(
      "INVALID_TOKEN"
    );
  });

  it("chama o endpoint correto do Google", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(MOCK_TOKEN_INFO), { status: 200 })
    );

    await verifyGoogleIdToken("my-token");

    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      expect.stringContaining("oauth2.googleapis.com/tokeninfo?id_token=my-token")
    );
  });
});

describe("handleGoogleAuth", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(MOCK_TOKEN_INFO), { status: 200 })
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("retorna sessionToken e user em caso de sucesso", async () => {
    const result = await handleGoogleAuth("valid-id-token");

    expect(result.sessionToken).toBe("mock-session-token");
    expect(result.user.openId).toBe("google:abc123");
    expect(result.user.email).toBe("test@example.com");
    expect(result.user.loginMethod).toBe("google");
  });

  it("faz upsert com openId prefixado com 'google:'", async () => {
    await handleGoogleAuth("valid-id-token");

    expect(vi.mocked(upsertUser)).toHaveBeenCalledWith(
      expect.objectContaining({
        openId: "google:abc123",
        loginMethod: "google",
      })
    );
  });

  it("propaga INVALID_TOKEN quando Google recusa o token", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "invalid_token" }), { status: 400 })
    );

    await expect(handleGoogleAuth("bad-token")).rejects.toThrow("INVALID_TOKEN");
  });
});
```

- [ ] **Step 2: Rodar os testes — devem falhar com "module not found"**

```bash
npx vitest run tests/google-auth.test.ts
```

Saída esperada: erro de importação `Cannot find module '../server/google-auth'`.

---

## Task 4: Implementar server/google-auth.ts

**Files:**
- Create: `server/google-auth.ts`

- [ ] **Step 1: Criar o arquivo**

```ts
// server/google-auth.ts
import type { Express, Request, Response } from "express";
import { getUserByOpenId, upsertUser } from "./db";
import { sdk } from "./_core/sdk";

interface GoogleTokenPayload {
  sub: string;
  email?: string;
  name?: string;
  aud: string;
  iss: string;
  exp: string;
}

function buildUserResponse(
  user: Awaited<ReturnType<typeof getUserByOpenId>>
) {
  return {
    id: user?.id ?? null,
    openId: user?.openId ?? null,
    name: user?.name ?? null,
    email: user?.email ?? null,
    phone: user?.phone ?? null,
    userType: user?.userType ?? null,
    birthDate: user?.birthDate ?? null,
    bloodType: user?.bloodType ?? null,
    loginMethod: user?.loginMethod ?? null,
    lastSignedIn: (user?.lastSignedIn ?? new Date()).toISOString(),
  };
}

/**
 * Verifica um Google id_token usando o endpoint público de tokeninfo.
 * Lança "INVALID_TOKEN" se o Google rejeitar o token.
 * Não requer secret — tokeninfo é um endpoint público do Google.
 */
export async function verifyGoogleIdToken(
  idToken: string
): Promise<GoogleTokenPayload> {
  const res = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`
  );
  if (!res.ok) {
    throw new Error("INVALID_TOKEN");
  }
  return res.json() as Promise<GoogleTokenPayload>;
}

/**
 * Núcleo da autenticação Google:
 * 1. Verifica o id_token com o Google
 * 2. Faz upsert do usuário no Railway MySQL
 * 3. Emite o JWT de sessão interno
 */
export async function handleGoogleAuth(idToken: string) {
  const payload = await verifyGoogleIdToken(idToken);

  const openId = `google:${payload.sub}`;
  const name = payload.name ?? payload.email ?? "Usuário";
  const email = payload.email ?? null;

  await upsertUser({
    openId,
    name,
    email,
    loginMethod: "google",
    lastSignedIn: new Date(),
  });

  const appId =
    process.env.APP_ID ?? process.env.VITE_APP_ID ?? "vigora-saude";
  const sessionToken = await sdk.signSession({ openId, appId, name });
  const dbUser = await getUserByOpenId(openId);

  return {
    sessionToken,
    user: buildUserResponse(dbUser),
  };
}

/**
 * POST /api/auth/google
 * Body: { id_token: string }
 *
 * Verifica o Google id_token, faz upsert do usuário no Railway MySQL,
 * e retorna { sessionToken, user } com o JWT de sessão interno.
 */
export function registerGoogleAuthRoute(app: Express): void {
  app.post("/api/auth/google", async (req: Request, res: Response) => {
    const { id_token } = req.body as { id_token?: string };

    if (!id_token) {
      res.status(400).json({ error: "id_token é obrigatório" });
      return;
    }

    try {
      const result = await handleGoogleAuth(id_token);
      res.json(result);
    } catch (err) {
      if (err instanceof Error && err.message === "INVALID_TOKEN") {
        res.status(401).json({ error: "Token inválido ou expirado" });
        return;
      }
      console.error("[Google Auth] Error:", err);
      res.status(500).json({ error: "Erro interno do servidor" });
    }
  });
}
```

- [ ] **Step 2: Rodar os testes — devem passar**

```bash
npx vitest run tests/google-auth.test.ts
```

Saída esperada:
```
✓ tests/google-auth.test.ts (6)
  ✓ verifyGoogleIdToken (3)
  ✓ handleGoogleAuth (3)
Test Files  1 passed (1)
```

- [ ] **Step 3: Commit**

```bash
git add server/google-auth.ts tests/google-auth.test.ts
git commit -m "feat: add google-auth endpoint replacing supabase token verification"
```

---

## Task 5: Conectar google-auth ao servidor Express

**Files:**
- Modify: `server/_core/index.ts`

- [ ] **Step 1: Substituir import e chamada de registerSupabaseAuthRoute**

No arquivo `server/_core/index.ts`, substituir:
```ts
import { registerSupabaseAuthRoute } from "../supabase-auth";
```
por:
```ts
import { registerGoogleAuthRoute } from "../google-auth";
```

E substituir:
```ts
registerSupabaseAuthRoute(app);
```
por:
```ts
registerGoogleAuthRoute(app);
```

E atualizar o comentário na linha ~48:
```ts
// Auth endpoints — /api/auth/google verifica o Google id_token e emite
// o JWT de sessão; os demais são ciclo de vida da sessão (me / logout / cookie sync).
```

- [ ] **Step 2: Verificar que o servidor compila sem erros**

```bash
npx tsc --noEmit --project server/tsconfig.json 2>/dev/null || npx tsc --noEmit
```

Saída esperada: sem erros de tipo.

- [ ] **Step 3: Commit**

```bash
git add server/_core/index.ts
git commit -m "feat: wire google-auth route into express server"
```

---

## Task 6: Reescrever app/login.tsx com expo-auth-session

**Files:**
- Modify: `app/login.tsx`

- [ ] **Step 1: Substituir o conteúdo de login.tsx**

Reescrever o arquivo completo. O JSX da tela (botão, estilos, benefícios) permanece idêntico — apenas a lógica de autenticação muda:

```tsx
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import AntDesign from "@expo/vector-icons/AntDesign";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import * as WebBrowser from "expo-web-browser";
import * as Google from "expo-auth-session/providers/google";
import { exchangeCodeAsync } from "expo-auth-session";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useColors } from "@/hooks/use-colors";
import { useAppContext } from "@/lib/app-context";
import * as Auth from "@/lib/_core/auth";
import {
  getApiBaseUrl,
  GOOGLE_ANDROID_CLIENT_ID,
  GOOGLE_IOS_CLIENT_ID,
  GOOGLE_WEB_CLIENT_ID,
} from "@/constants/oauth";

// Obrigatório: limpa sessão de browser pendente ao montar a tela.
// Deve ser chamado no nível do módulo, fora do componente.
WebBrowser.maybeCompleteAuthSession();

const LOGIN_COMPLETED_KEY = "vigora_login_completed";
const CAREGIVER_ONBOARDING_KEY = "vigora_caregiver_onboarding_completed";

function getNextRoute(
  userType: "caregiver" | "monitored" | null,
  caregiverOnboardingDone: boolean
): string {
  if (!userType) return "/register";
  if (userType === "caregiver") {
    return caregiverOnboardingDone
      ? "/(caregiver-tabs)"
      : "/caregiver-onboarding";
  }
  return "/(tabs)";
}

export default function LoginScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { reconcileFromCloud } = useAppContext();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // expo-auth-session seleciona o clientId e redirect URI corretos por plataforma.
  // Android/iOS usam o formato de domínio reverso (com.vigora.saude:/).
  // Web usa o proxy Expo (https://auth.expo.io) com o webClientId.
  const [request, response, promptAsync] = Google.useAuthRequest({
    androidClientId: GOOGLE_ANDROID_CLIENT_ID,
    iosClientId: GOOGLE_IOS_CLIENT_ID,
    webClientId: GOOGLE_WEB_CLIENT_ID,
    scopes: ["openid", "email", "profile"],
  });

  // expo-web-browser intercepta o redirect antes do Expo Router.
  // O resultado da autenticação chega aqui via hook, não via app/oauth/callback.tsx.
  useEffect(() => {
    if (!response) return;

    if (response.type === "success") {
      handleAuthCode(response.params.code);
    } else if (response.type === "error") {
      setError("Autenticação cancelada ou recusada pelo Google.");
      setLoading(false);
    } else if (response.type === "dismiss") {
      // Usuário fechou o browser — silencioso
      setLoading(false);
    }
  }, [response]);

  async function handleAuthCode(code: string) {
    if (!request) return;

    try {
      // 1. Trocar code por tokens diretamente com o Google
      const tokens = await exchangeCodeAsync(
        {
          clientId: request.clientId,
          code,
          redirectUri: request.redirectUri,
          extraParams: { code_verifier: request.codeVerifier ?? "" },
        },
        { tokenEndpoint: "https://oauth2.googleapis.com/token" }
      );

      if (!tokens.idToken) {
        throw new Error("id_token não recebido do Google");
      }

      // 2. Trocar Google id_token por JWT de sessão do Railway
      const baseUrl = getApiBaseUrl();
      if (!baseUrl) {
        throw new Error(
          "URL do servidor não configurada. Rebuilde o app com EXPO_PUBLIC_API_BASE_URL."
        );
      }

      const res = await fetch(`${baseUrl}/api/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id_token: tokens.idToken }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error ?? `Erro ${res.status}`);
      }

      const result = (await res.json()) as {
        sessionToken: string;
        user: {
          id: number | null;
          openId: string;
          name: string | null;
          email: string | null;
          phone: string | null;
          userType: "caregiver" | "monitored" | null;
          birthDate: string | null;
          bloodType: string | null;
          loginMethod: string | null;
          lastSignedIn: string;
        };
      };

      // 3. Persistir sessão (mesma lógica que era feita em oauth/callback.tsx)
      await Auth.setSessionToken(result.sessionToken);
      await Auth.setUserInfo({
        id: result.user.id ?? 0,
        openId: result.user.openId,
        name: result.user.name,
        email: result.user.email,
        phone: result.user.phone,
        userType: result.user.userType,
        birthDate: result.user.birthDate,
        bloodType: result.user.bloodType,
        loginMethod: result.user.loginMethod,
        lastSignedIn: new Date(result.user.lastSignedIn),
      });

      await AsyncStorage.setItem(LOGIN_COMPLETED_KEY, "true");
      reconcileFromCloud().catch(() => {});

      const flag = await AsyncStorage.getItem(CAREGIVER_ONBOARDING_KEY);
      router.replace(getNextRoute(result.user.userType, flag === "true"));
    } catch (err) {
      console.error("[Login] Auth failed:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Falha ao completar a autenticação"
      );
    } finally {
      setLoading(false);
    }
  }

  const handleLogin = async () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    setLoading(true);
    setError(null);
    try {
      await promptAsync();
    } catch {
      setError(
        "Não foi possível iniciar o login. Verifique sua conexão e tente novamente."
      );
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.content,
          {
            paddingTop: Math.max(insets.top, 40) + 20,
            paddingBottom: Math.max(insets.bottom, 20) + 20,
          },
        ]}
      >
        <View style={[styles.iconCircle, { backgroundColor: "#0066CC" }]}>
          <MaterialIcons name="favorite" size={56} color="#FFFFFF" />
        </View>

        <Text style={[styles.title, { color: colors.foreground }]}>
          Vigora Saúde
        </Text>
        <Text style={[styles.subtitle, { color: colors.muted }]}>
          Faça login para sincronizar seus dados de saúde e garantir sua
          segurança em emergências.
        </Text>

        <View
          style={[
            styles.benefitsBox,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          {[
            {
              icon: "cloud-upload" as const,
              text: "Dados salvos e sincronizados na nuvem",
            },
            {
              icon: "people" as const,
              text: "Contatos de emergência sempre protegidos",
            },
            {
              icon: "alarm" as const,
              text: "Alarmes de medicamentos preservados",
            },
            {
              icon: "lock" as const,
              text: "Informações criptografadas e seguras",
            },
          ].map((item, i) => (
            <View key={i} style={styles.benefitItem}>
              <MaterialIcons name={item.icon} size={20} color={colors.primary} />
              <Text
                style={[styles.benefitText, { color: colors.foreground }]}
              >
                {item.text}
              </Text>
            </View>
          ))}
        </View>

        {error && (
          <View
            style={[
              styles.errorBox,
              { backgroundColor: "#FEE2E2", borderColor: "#FCA5A5" },
            ]}
          >
            <MaterialIcons name="error-outline" size={18} color="#DC2626" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <Pressable
          onPress={handleLogin}
          disabled={loading || !request}
          style={({ pressed }) => [
            styles.googleButton,
            {
              borderColor: colors.border,
              backgroundColor: colors.surface,
              opacity: pressed || loading || !request ? 0.7 : 1,
            },
          ]}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#4285F4" />
          ) : (
            <>
              <AntDesign name="google" size={22} color="#4285F4" />
              <Text
                style={[styles.googleButtonText, { color: colors.foreground }]}
              >
                Entrar com o Google
              </Text>
            </>
          )}
        </Pressable>

        <Text style={[styles.privacyNote, { color: colors.muted }]}>
          Ao entrar, você concorda com nossos Termos de Uso e Política de
          Privacidade.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 20,
  },
  iconCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  title: { fontSize: 32, fontWeight: "800", textAlign: "center" },
  subtitle: { fontSize: 16, textAlign: "center", lineHeight: 24 },
  benefitsBox: {
    width: "100%",
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 14,
  },
  benefitItem: { flexDirection: "row", alignItems: "center", gap: 12 },
  benefitText: { fontSize: 15, flex: 1, lineHeight: 22 },
  errorBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    width: "100%",
  },
  errorText: { flex: 1, fontSize: 14, lineHeight: 20, color: "#DC2626" },
  googleButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    width: "100%",
    paddingVertical: 16,
    borderRadius: 16,
    borderWidth: 1.5,
  },
  googleButtonText: { fontSize: 17, fontWeight: "600" },
  privacyNote: { fontSize: 12, textAlign: "center", lineHeight: 18 },
});
```

- [ ] **Step 2: Commit**

```bash
git add app/login.tsx constants/oauth.ts
git commit -m "feat: replace supabase oauth with expo-auth-session google provider"
```

---

## Task 7: Deletar arquivos obsoletos

**Files:**
- Delete: `lib/supabase.ts`, `lib/supabase-sync.ts`, `app/oauth/callback.tsx`, `server/supabase-auth.ts`, `supabase/`, `tests/supabase-credentials.test.ts`, `tests/supabase.lockdown.test.ts`, `tests/edge-function-auth.test.ts`, `tests/edge-function-query.test.ts`

- [ ] **Step 1: Deletar arquivos cliente e servidor**

```bash
git rm lib/supabase.ts lib/supabase-sync.ts app/oauth/callback.tsx server/supabase-auth.ts
```

- [ ] **Step 2: Deletar pasta supabase/ e tests obsoletos**

```bash
git rm -r supabase/
git rm tests/supabase-credentials.test.ts tests/supabase.lockdown.test.ts
git rm tests/edge-function-auth.test.ts tests/edge-function-query.test.ts
```

- [ ] **Step 3: Commit**

```bash
git commit -m "chore: delete supabase client, edge function, and related tests"
```

---

## Task 8: Limpar comentários obsoletos

**Files:**
- Modify: `server/_core/sdk.ts` (linha ~155)
- Modify: `server/_core/oauth.ts` (linha ~27)

- [ ] **Step 1: Atualizar comentário em sdk.ts**

Localizar e substituir o comentário na função `authenticateRequest` (linha ~155):

```ts
// Users are provisioned via /api/auth/supabase on login. If we don't
// find them here, the session is stale or pointing at a deleted user.
```

Substituir por:
```ts
// Users are provisioned via /api/auth/google on login. If we don't
// find them here, the session is stale or pointing at a deleted user.
```

- [ ] **Step 2: Atualizar comentário em oauth.ts**

Localizar e substituir o comentário na função `registerAuthRoutes` (linha ~27):

```ts
 * Auth routes shared across sign-in methods. The OAuth flow itself runs
 * through Supabase (see ../supabase-auth.ts); these endpoints handle the
 * session lifecycle (who am I, logout, cookie sync from a Bearer token).
```

Substituir por:
```ts
 * Auth routes shared across sign-in methods. The OAuth flow runs through
 * expo-auth-session + Google directly (see ../google-auth.ts); these endpoints
 * handle the session lifecycle (who am I, logout, cookie sync from a Bearer token).
```

- [ ] **Step 3: Commit**

```bash
git add server/_core/sdk.ts server/_core/oauth.ts
git commit -m "chore: update stale comments from supabase to google-auth"
```

---

## Task 9: Verificação final

- [ ] **Step 1: Confirmar que nenhum import de Supabase restou**

```bash
grep -r "supabase\|@supabase" . --include="*.ts" --include="*.tsx" \
  --exclude-dir=node_modules --exclude-dir=.claude --exclude-dir=docs \
  -l
```

Saída esperada: nenhuma linha (ou somente arquivos em `docs/` que são specs/planos).

- [ ] **Step 2: Rodar suite de testes completa**

```bash
npx vitest run
```

Saída esperada: todos os testes passam. Os testes deletados na Task 7 não aparecem mais.

- [ ] **Step 3: Verificar compilação TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Saída esperada: nenhum erro.

- [ ] **Step 4: Confirmar que expo-auth-session está no bundle**

```bash
grep "expo-auth-session" node_modules/.package-lock.json 2>/dev/null | head -3
```

Saída esperada: linha com `"expo-auth-session"` e versão instalada.
