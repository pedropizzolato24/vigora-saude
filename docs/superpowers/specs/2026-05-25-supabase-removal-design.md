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
|---------|--------|
| `lib/supabase.ts` | Cliente Supabase removido |
| `lib/supabase-sync.ts` | Já era no-op; sem razão de existir |
| `app/oauth/callback.tsx` | `expo-web-browser` intercepta o redirect; tela nunca é ativada |
| `server/supabase-auth.ts` | Substituído por `server/google-auth.ts` |

### Modificados

| Arquivo | O que muda |
|---------|------------|
| `app/login.tsx` | Substitui `supabase.auth.signInWithOAuth` por `useAuthRequest` + `exchangeCodeAsync`; absorve toda a lógica de pós-login (redirect, reconcileFromCloud, setSessionToken, roteamento) |
| `package.json` | Remove `@supabase/supabase-js`; adiciona `expo-auth-session` |
| `constants/oauth.ts` | Adiciona `GOOGLE_CLIENT_ID` lido de `EXPO_PUBLIC_GOOGLE_CLIENT_ID` |
| `server/_core/env.ts` | Nenhuma variável nova obrigatória (tokeninfo é público) |
| `server/_core/index.ts` | Troca `registerSupabaseAuthRoute` por `registerGoogleAuthRoute` |

### Criados

| Arquivo | Conteúdo |
|---------|---------|
| `server/google-auth.ts` | Endpoint `POST /api/auth/google`: recebe `id_token`, chama `tokeninfo`, faz upsert no Railway, retorna JWT |

---

## Configuração (Google Cloud Console)

Antes de buildar, criar uma credencial OAuth 2.0 do tipo **Web** com os seguintes URIs de redirecionamento autorizados:

| Ambiente | URI |
|----------|-----|
| Produção (nativo) | `vigora://oauth/callback` |
| Desenvolvimento (Expo Go) | `https://auth.expo.io/@<username>/vigora-saude` |
| Web local | `http://localhost:8081` |

> Um único Client ID do tipo Web é suficiente para `expo-auth-session` em todas as plataformas (iOS, Android, Web). IDs separados por plataforma só são necessários ao usar o Google Sign-In nativo SDK — não é o caso aqui.

### Variáveis de Ambiente

| Onde | Variável | Valor |
|------|----------|-------|
| App (`.env` / EAS Secrets) | `EXPO_PUBLIC_GOOGLE_CLIENT_ID` | Client ID Web gerado acima |
| Railway (server) | nenhuma nova | `tokeninfo` é endpoint público |

---

## Implementação do Cliente (`login.tsx`)

```tsx
import * as WebBrowser from 'expo-web-browser';
import { useAuthRequest, exchangeCodeAsync, makeRedirectUri } from 'expo-auth-session';
import * as Google from 'expo-auth-session/providers/google';

WebBrowser.maybeCompleteAuthSession(); // obrigatório — limpa sessão de browser pendente

const redirectUri = makeRedirectUri({ scheme: 'vigora', path: 'oauth/callback' });

// No componente:
const [request, response, promptAsync] = Google.useAuthRequest({
  clientId: GOOGLE_CLIENT_ID,
  scopes: ['openid', 'email', 'profile'],
  redirectUri,
});

useEffect(() => {
  if (response?.type === 'success') {
    const { code } = response.params;
    handleCode(code);
  }
}, [response]);

async function handleCode(code: string) {
  // 1. Troca code por tokens diretamente com o Google
  const tokens = await exchangeCodeAsync(
    { clientId: GOOGLE_CLIENT_ID, code, redirectUri, extraParams: { code_verifier: request!.codeVerifier! } },
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
|---------|---------------|
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
