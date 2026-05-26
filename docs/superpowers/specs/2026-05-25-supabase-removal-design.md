# Spec: Remoção do Supabase — Autenticação Google Direta

**Data:** 2026-05-25  
**Branch:** claude/review-codebase-5HU6v  
**Status:** Aprovado

---

## Contexto

O Supabase está sendo usado exclusivamente como proxy de verificação de token Google. Toda a camada de dados (usuários, alarmes, heartbeat, dead man's switch) já roda no Railway MySQL via Drizzle. O Supabase não armazena nenhum dado de negócio — sua única função é:

1. Gerar a URL OAuth do Google com PKCE
2. Trocar o `code` por um `access_token`
3. Expor o endpoint `/auth/v1/user` para verificar o token

Essas três funções podem ser substituídas por `expo-auth-session` (cliente) e o endpoint público `oauth2.googleapis.com/tokeninfo` (servidor), eliminando a dependência do Supabase completamente.

---

## Fluxo Atual (Supabase)

```
login.tsx
  → supabase.auth.signInWithOAuth({ provider: 'google' })
  → Linking.openURL(url gerada pelo Supabase)

Google → vigora://oauth/callback?code=...
  → Expo Router navega para app/oauth/callback.tsx

oauth/callback.tsx
  → supabase.auth.exchangeCodeForSession(code)  → session.access_token
  → POST /api/auth/supabase { access_token }

server/supabase-auth.ts
  → GET https://<proj>.supabase.co/auth/v1/user
  → extrai sub / email / name
  → cria JWT interno (Railway SDK)
  → retorna { sessionToken, user }
```

---

## Fluxo Novo (Google Direto)

```
login.tsx
  → expo-auth-session.useAuthRequest({ clientId, scopes, redirectUri })
  → promptAsync() abre browser via expo-web-browser

Google → vigora://oauth/callback?code=...
  → expo-web-browser intercepta (não chega ao Expo Router)
  → promptAsync() resolve com { type: 'success', params: { code } }

login.tsx
  → exchangeCodeAsync(code, codeVerifier) → { idToken, accessToken }
  → POST /api/auth/google { id_token }

server/google-auth.ts
  → GET https://oauth2.googleapis.com/tokeninfo?id_token=<token>
  → extrai sub / email / name
  → upsertUser() no Railway MySQL
  → cria JWT interno (Railway SDK)
  → retorna { sessionToken, user }
```

**Consequência importante:** `expo-web-browser` intercepta o deep link `vigora://oauth/callback` antes do Expo Router. A tela `app/oauth/callback.tsx` nunca chega a ser ativada, portanto pode ser deletada. Toda a lógica pós-login (reconcileFromCloud, setSessionToken, roteamento) é absorvida pelo handler de sucesso dentro de `login.tsx`.

---

## Arquivos

### Deletados

| Arquivo | Motivo |
| ------- | ------ |
| `lib/supabase.ts` | Cliente Supabase removido |
| `lib/supabase-sync.ts` | Já era no-op; sem razão de existir |
| `app/oauth/callback.tsx` | `expo-web-browser` intercepta o redirect; tela nunca é ativada |
| `server/supabase-auth.ts` | Substituído por `server/google-auth.ts` |

### Modificados

| Arquivo | O que muda |
| ------- | ---------- |
| `app/login.tsx` | Substitui `supabase.auth.signInWithOAuth` por `useAuthRequest` + `exchangeCodeAsync`; absorve toda a lógica de pós-login (redirect, reconcileFromCloud, setSessionToken, roteamento) |
| `package.json` | Remove `@supabase/supabase-js`; adiciona `expo-auth-session` |
| `constants/oauth.ts` | Adiciona `GOOGLE_ANDROID_CLIENT_ID`, `GOOGLE_IOS_CLIENT_ID`, `GOOGLE_WEB_CLIENT_ID` lidos das variáveis `EXPO_PUBLIC_GOOGLE_*` |
| `server/_core/env.ts` | Nenhuma variável nova obrigatória (tokeninfo é público) |
| `server/_core/index.ts` | Troca `registerSupabaseAuthRoute` por `registerGoogleAuthRoute` |

### Criados

| Arquivo | Conteúdo |
| ------- | -------- |
| `server/google-auth.ts` | Endpoint `POST /api/auth/google`: recebe `id_token`, chama `tokeninfo`, faz upsert no Railway, retorna JWT |

---

## Configuração (Google Cloud Console)

O Google **não aceita** custom schemes arbitrários (`vigora://`) como redirect URI — apenas HTTPS ou o formato de domínio reverso da plataforma. Por isso, `expo-auth-session/providers/google` exige **3 Client IDs separados**, um por plataforma, cada um com a URI correta que o Google reconhece.

### Criar 3 credenciais OAuth 2.0

| Tipo no Console | Para | Redirect URI | O que informar |
| --------------- | ---- | ------------ | -------------- |
| **Android** | APK nativo | gerada automaticamente pelo Google (`com.vigora.saude:/`) | Package: `com.vigora.saude` + SHA-1 do keystore EAS |
| **iOS** | app nativo | gerada automaticamente pelo Google (`com.vigora.saude:/`) | Bundle ID: `com.vigora.saude` |
| **Web** | Expo Go (dev) e plataforma web | `https://auth.expo.io/@<username>/vigora-saude`, `http://localhost:8081` | só as URIs autorizadas |

> O `expo-auth-session/providers/google` seleciona automaticamente o Client ID correto por plataforma e constrói a redirect URI certa internamente — nenhum URI customizado precisa ser registrado manualmente para nativo.

### Variáveis de Ambiente

| Onde | Variável | Valor |
| ---- | -------- | ----- |
| App (`.env` / EAS Secrets) | `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` | Client ID Android |
| App (`.env` / EAS Secrets) | `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` | Client ID iOS |
| App (`.env` / EAS Secrets) | `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | Client ID Web |
| Railway (server) | nenhuma nova | `tokeninfo` é endpoint público, sem secret |

---

## Implementação do Cliente (`login.tsx`)

```tsx
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';

// Obrigatório: limpa sessão de browser pendente ao montar a tela
WebBrowser.maybeCompleteAuthSession();

// No componente:
// Google.useAuthRequest seleciona automaticamente o clientId e a redirect URI
// corretos por plataforma (Android usa domínio reverso, iOS idem, Web usa proxy Expo)
const [request, response, promptAsync] = Google.useAuthRequest({
  androidClientId: GOOGLE_ANDROID_CLIENT_ID,
  iosClientId: GOOGLE_IOS_CLIENT_ID,
  webClientId: GOOGLE_WEB_CLIENT_ID,
  scopes: ['openid', 'email', 'profile'],
});

useEffect(() => {
  if (response?.type === 'success') {
    const { code } = response.params;
    handleCode(code);
  }
}, [response]);

async function handleCode(code: string) {
  // 1. Troca code por tokens (Google.useAuthRequest já gerencia codeVerifier/redirectUri internamente)
  const tokens = await exchangeCodeAsync(
    {
      clientId: /* id da plataforma atual */ request!.clientId,
      code,
      redirectUri: request!.redirectUri,
      extraParams: { code_verifier: request!.codeVerifier! },
    },
    { tokenEndpoint: 'https://oauth2.googleapis.com/token' }
  );
  // 2. Envia id_token ao servidor Railway
  const res = await fetch(`${apiBaseUrl}/api/auth/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id_token: tokens.idToken }),
  });
  const result = await res.json();
  // 3. Persiste sessão (igual ao oauth/callback.tsx atual)
  await Auth.setSessionToken(result.sessionToken);
  await Auth.setUserInfo(result.user);
  reconcileFromCloud().catch(() => {});
  router.replace(nextRoute(result.user));
}
```

---

## Implementação do Servidor (`server/google-auth.ts`)

```ts
app.post('/api/auth/google', async (req, res) => {
  const { id_token } = req.body;
  
  // Verificação pública — sem secret necessário
  const googleRes = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${id_token}`
  );
  if (!googleRes.ok) {
    return res.status(401).json({ error: 'Token inválido ou expirado' });
  }
  
  const payload = await googleRes.json();
  // payload: { sub, email, name, ... }
  
  const openId = `google:${payload.sub}`;
  await upsertUser({ openId, name: payload.name, email: payload.email, loginMethod: 'google' });
  
  const sessionToken = await sdk.signSession({ openId, appId, name: payload.name });
  const dbUser = await getUserByOpenId(openId);
  
  res.json({ sessionToken, user: buildUserResponse(dbUser) });
});
```

---

## Tratamento de Erros

| Cenário | Comportamento |
| ------- | ------------- |
| Usuário fecha o browser | `response.type === 'dismiss'` → silencioso, botão volta ao estado normal |
| Google retorna `error` | `response.type === 'error'` → exibe mensagem inline |
| `exchangeCodeAsync` falha | catch → "Não foi possível completar o login. Tente novamente." |
| `id_token` expirado/inválido | Servidor retorna 401 → mesmo erro genérico de rede |
| Sem conexão | fetch lança → "Verifique sua conexão e tente novamente." |
| `userType` nulo | Redireciona para `/register` |
| `userType === 'caregiver'` | Verifica flag de onboarding → `/(caregiver-tabs)` ou `/caregiver-onboarding` |

---

## O Que Não Muda

- Railway MySQL — schema, tabelas, queries: **intocados**
- JWT de sessão interno — geração, validação, cookies: **intocados**
- tRPC, routers, monitoring job, dead man's switch: **intocados**
- Todas as telas do app exceto `login.tsx`: **intocadas**
- `lib/device-id.ts` — verificado: não usa Supabase, **intocado**

---

## Checklist de Verificação Pós-Implementação

- [ ] Login com Google funciona em iOS
- [ ] Login com Google funciona em Android
- [ ] Login com Google funciona na Web
- [ ] Novo usuário é redirecionado para `/register`
- [ ] Usuário existente (`monitored`) vai direto para `/(tabs)`
- [ ] Usuário existente (`caregiver`) vai para `/(caregiver-tabs)`
- [ ] `reconcileFromCloud` roda após login (dados restaurados)
- [ ] `@supabase/supabase-js` não aparece no bundle (verificar com `npx expo-bundle-analyzer` se necessário)
- [ ] Nenhum import de `lib/supabase` ou `lib/supabase-sync` restante no codebase
