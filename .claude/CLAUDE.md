# CLAUDE.md — Vigora Saúde

Guia completo de desenvolvimento para o app Vigora Saúde. Leia do início ao fim antes de tocar em qualquer código.

---

## graphify

Este projeto tem um grafo de conhecimento em `graphify-out/` com god nodes, estrutura de comunidades e relacionamentos cross-file.

Regras:

- Para perguntas sobre código, execute primeiro `graphify query "<pergunta>"` quando `graphify-out/graph.json` existir.
- Use `graphify path "<A>" "<B>"` para relacionamentos e `graphify explain "<conceito>"` para conceitos focados.
- Se `graphify-out/wiki/index.md` existir, use-o para navegação ampla em vez de browsing direto.
- Leia `graphify-out/GRAPH_REPORT.md` somente para revisão de arquitetura ampla.
- **Após modificar código, execute `graphify update .`** para manter o grafo atual (AST-only, sem custo de API).

---

## 1. Identidade do Produto

**Vigora Saúde** é um app de monitoramento de saúde para **idosos brasileiros** (60+). O comprador real é o **filho adulto (35–55 anos)**, não o usuário idoso.

**Diferencial competitivo único:** dead man's switch — se o idoso não responde ao alarme, os contatos de emergência são alertados automaticamente via WhatsApp/Email/SMS. Nenhum concorrente direto tem isso no Brasil.

**Posicionamento de marketing:** sempre linguagem de bem-estar/segurança. Nunca linguagem médica ou terapêutica.

**Tipos de usuário:**

- `monitored` — o idoso que usa o app diariamente (fluxo `/(tabs)/`)
- `caregiver` — filho/cuidador que monitora remotamente (fluxo `/(caregiver-tabs)/`)

---

## 2. Arquitetura do Sistema

### Visão Geral

```
App (React Native + Expo)
  ├── AsyncStorage local       → dados de saúde, alarmes, perfil
  └── Railway (Node.js/tRPC)  → autenticação, cloud backup, dead man's switch, alertas
```

### Backend Railway — Routers tRPC

| Router | Propósito |
|---|---|
| `auth` | OAuth Google/Apple, email/senha, perfil |
| `userData` | Cloud backup por conta (pull/push) |
| `monitoring` | Alertas de emergência, WhatsApp/Email/SMS |
| `system` | Health check |

### Stack completo

- **Frontend:** React Native 0.81.5 + Expo 54 + Expo Router 6 + NativeWind 4 + Reanimated 4
- **Backend:** Node.js 22 + Express + tRPC 11 + Drizzle ORM + PostgreSQL 15
- **Autenticação:** OAuth PKCE direto com Google via `expo-auth-session` + JWT em `expo-secure-store` (nativo) / cookie httpOnly (web)
- **Monetização:** RevenueCat SDK (`react-native-purchases` 10)
- **Testes:** Vitest 2.1.9

### IDs e scheme

- **Bundle ID (iOS):** `com.vigora.saude`
- **Package (Android):** `com.vigora.saude`
- **Deep link scheme:** `vigora://`
- **OAuth callback:** `vigora://oauth/callback`

---

## 3. Sistema de Cores — Use APENAS tokens, nunca hardcode

**Regra absoluta:** nenhum valor hexadecimal ou RGB hardcoded em componentes. Use sempre os tokens de tema via `useColors()` ou classes NativeWind.

### Paleta de tokens (`theme.config.js`)

| Token | Light | Dark | Uso |
|---|---|---|---|
| `primary` | `#0066CC` | `#3399FF` | Botões principais, links, foco |
| `background` | `#FFFFFF` | `#151718` | Fundo de telas |
| `surface` | `#F5F5F5` | `#1E2022` | Cards, modais, inputs |
| `foreground` | `#11181C` | `#ECEDEE` | Texto principal |
| `muted` | `#687076` | `#9BA1A6` | Texto secundário, ícones inativos |
| `border` | `#E5E7EB` | `#334155` | Bordas, divisores |
| `success` | `#22C55E` | `#4ADE80` | Confirmações, status OK |
| `warning` | `#F59E0B` | `#FBBF24` | Avisos |
| `error` | `#EF4444` | `#F87171` | Erros, validação |
| `emergency` | `#FF0000` | `#FF4444` | SOS, alarme crítico |
| `onPrimary` | `#FFFFFF` | `#FFFFFF` | Texto sobre fundo primary |
| `onEmergency` | `#FFFFFF` | `#FFFFFF` | Texto sobre fundo emergency |

### Variantes light (backgrounds suaves)

- `primaryLight` — fundo suave de elementos primary (botões ghost, highlights)
- `emergencyLight` — fundo suave de alertas de emergência
- `successLight` — fundo suave de confirmações
- `warningLight` — fundo suave de avisos
- `errorLight` — fundo suave de erros

### Como usar no código

```tsx
// Via hook (componentes com StyleSheet)
const colors = useColors();
// colors.primary, colors.surface, colors.foreground, etc.

// Via NativeWind (classes Tailwind)
<View className="bg-surface border border-border">
  <Text className="text-foreground">Olá</Text>
  <Text className="text-muted">Subtítulo</Text>
</View>
```

### Proibições de cores

- ❌ `color: '#000000'` — use `colors.foreground`
- ❌ `backgroundColor: '#FFFFFF'` — use `colors.background`
- ❌ `color: 'gray'` — use `colors.muted`
- ❌ `backgroundColor: '#f5f5f5'` — use `colors.surface`
- ❌ `color: 'red'` — use `colors.error` ou `colors.emergency`
- ❌ `backgroundColor: '#0066CC'` — use `colors.primary`

---

## 4. Tipografia e Tamanhos de Fonte

### Público-alvo: idosos (60+)

O app serve usuários com visão reduzida. Respeite os mínimos de acessibilidade.

### Tamanhos mínimos

| Contexto | Tamanho mínimo | Modo Acessível |
|---|---|---|
| Corpo de texto | 15px | 18px |
| Labels de campo | 14px | 17px |
| Texto de botão | 16px | 19px |
| Título de tela | 20px | 24px |
| Título de card | 16px | 19px |
| Texto de ajuda/hint | 13px | 16px |

### Sistema de font size

O app tem três predefinições via `FontSizeContext`:

- `small` — 0.9× do padrão
- `medium` — padrão (default)
- `large` — 1.2× do padrão

**Use sempre o context ao definir tamanhos de fonte dinâmicos:**

```tsx
const { fontSize } = useFontSize();
// fontSize.body, fontSize.title, fontSize.label, etc.
```

### Fontes

- **iOS:** `system-ui` (San Francisco)
- **Android:** `normal` (Roboto)
- **Web:** `system-ui` com fallbacks
- Não use fontes customizadas sem aprovação explícita.

---

## 5. UX e Acessibilidade — Regras Obrigatórias

### Modo Acessível

O app tem um toggle de "Modo Acessível" em Configurações. **Toda tela nova deve ter uma versão acessível** com:

- Fontes 1.2× maiores
- Botões com área de toque ≥ 60px de altura
- Labels mais descritivos
- Contraste aumentado (nunca cinza claro sobre branco)

```tsx
const { isAccessibilityMode } = useAccessibility();
// Renderizar versão simplificada quando true
```

### Touch targets

- Mínimo 44×44px em todos os elementos interativos
- Modo acessível: mínimo 60×60px
- Nunca usar botões de ícone solo sem label visível em fluxos críticos

### Safe Area

**Todo componente raiz de tela deve usar `insets.top`:**

```tsx
const insets = useSafeAreaInsets();
// paddingTop: insets.top + 12
```

Não remova o edge top do `ScreenContainer` — isso causou bugs de sobreposição da status bar no passado.

### Padrão de padding de tela

```
paddingTop: insets.top + 12
paddingHorizontal: 20
paddingVertical: 16
```

### Diálogos e confirmações

Use `AppDialog` (não `Alert.alert()`). Variantes: `info`, `warning`, `error`, `confirm`, `sos`.

```tsx
const { showDialog } = useAppDialog();
// NÃO: Alert.alert(...)
// SIM: showDialog({ type: 'confirm', title: '...', message: '...' })
```

Use `AppToast` para confirmações rápidas (alarme salvo, contato importado, métrica registrada).

### Dark mode

O app suporta light/dark mode completo. **Teste toda UI nova nos dois modos** antes de declarar concluído.

---

## 6. Estrutura de Providers (Ordem Importa)

```tsx
<PurchasesProvider>           // RevenueCat — deve ser o mais externo
  <NotificationsProvider>     // Permissões e canais
    <CaregiverProvider>       // Estado do cuidador
      <AppProvider>           // Estado global + cloud sync
        <FontSizeProvider>    // Preferência de fonte
          <AccessibilityProvider>
            <MonitoringInitializer />
            <MenuProvider>
              <trpc.Provider>
                <Stack />
              </trpc.Provider>
            </MenuProvider>
          </AccessibilityProvider>
        </FontSizeProvider>
      </AppProvider>
    </CaregiverProvider>
  </NotificationsProvider>
</PurchasesProvider>
```

Não altere essa ordem sem entender as dependências entre providers.

---

## 7. Monetização — Free vs Pro

### Limites do plano gratuito

```typescript
FREE_LIMITS = {
  contacts: 3,   // máx 3 contatos de emergência
  alarms: 5,     // máx 5 alarmes
}
```

### Recursos bloqueados no plano gratuito

- Exportação PDF da Anamnese → `requirePro()`
- Monitoramento contínuo pelo servidor → `ProGate` com `ProBanner`
- 4º contato de emergência → upsell contextual
- 6º alarme → upsell contextual

### Entitlement RevenueCat

- Nome: `"Vigora Saúde Pro"`
- Verifique sempre via `PurchasesContext`:

```tsx
const { isPro, isTrialActive, trialDaysLeft } = usePurchases();
```

### Trial de 7 dias

O app oferece 7 dias de trial gratuito rastreado por `firstLaunchDate`. Exibir `TrialBanner` (azul) durante o trial e `ExpiredBanner` (vermelho) após expirar.

---

## 8. Sistema de Alarmes — Especificações Críticas

### Android: AlarmManager nativo EXCLUSIVO

No Android, use **apenas** o AlarmManager nativo (`lib/native-alarm-manager.ts`). Nunca agende via `expo-notifications` no Android — isso causa notificações duplicadas.

```typescript
// lib/alarm-sync.ts
if (Platform.OS === 'android' && isNativeAlarmAvailable()) {
  await NativeAlarmManager.scheduleAlarm(alarm); // EXCLUSIVO Android
  return;
}
await scheduleAlarmNotification(alarm); // iOS e Web
```

### Fluxo de escalação (dead man's switch)

```
Alarme dispara → tela alarm-ring.tsx
  ↓ (sem resposta em timerDuration segundos)
WhatsApp deep link para todos os contatos de emergência
  ↓ (paralelo via Railway)
monitoring-job detecta alarm_event sem resposta no Railway MySQL
  ↓
Envia WhatsApp → Email → SMS em cascata
```

### Não introduza notificações redundantes

O sistema teve histórico de notificações duplicadas. Antes de adicionar qualquer `scheduleNotificationAsync`, confirme que não há outro ponto agendando a mesma notificação.

---

## 9. Autenticação e Sessão

### Fluxo OAuth (Google direto via expo-auth-session)

```
"Entrar com Google"
  → Google.useAuthRequest({ androidClientId, iosClientId, webClientId })
  → promptAsync() abre browser via expo-web-browser

Google → vigora://oauth/callback?code=...
  → expo-web-browser intercepta (não chega ao Expo Router)
  → response.type === 'success' com { code }

login.tsx → exchangeCodeAsync(code, codeVerifier)
  → { idToken, accessToken }
  → POST /api/auth/google { id_token }

server/google-auth.ts
  → GET oauth2.googleapis.com/tokeninfo?id_token=<token>
  → extrai sub / email / name
  → upsertUser() no Railway MySQL
  → cria JWT interno
  → retorna { sessionToken, user }

login.tsx
  → setSessionToken(result.sessionToken)
  → reconcileFromCloud()
  → router.replace(nextRoute(result.user))
```

> **Atenção:** `app/oauth/callback.tsx` foi deletado. O `expo-web-browser` intercepta o deep link antes do Expo Router. Toda lógica pós-login vive em `login.tsx`.

### Armazenamento de token

- **Nativo:** `expo-secure-store` (keychain iOS / Android Keystore)
- **Web:** cookie `httpOnly; Secure; SameSite=Strict`
- **NUNCA** armazene JWT em `AsyncStorage` — não é seguro

### Tipo de usuário

O `userType` (`monitored | caregiver`) é definido no cadastro e determina o layout:

- `monitored` → `/(tabs)/`
- `caregiver` → `/(caregiver-tabs)/`

---

## 10. Segurança — Regras Inegociáveis

### Variáveis de ambiente

| Variável | Escopo | Propósito |
|---|---|---|
| `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` | Cliente (público) | OAuth Google — Client ID Android |
| `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` | Cliente (público) | OAuth Google — Client ID iOS |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | Cliente (público) | OAuth Google — Client ID Web/Expo Go |
| `EXPO_PUBLIC_API_URL` | Cliente (público) | URL do servidor Railway |
| `EXPO_PUBLIC_REVENUECAT_API_KEY` | Cliente (público) | API key RevenueCat |
| `JWT_SECRET` | Servidor apenas | Assinatura de tokens JWT |
| `RESEND_API_KEY` | Servidor apenas | Email de alertas |
| `TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN` | Servidor apenas | SMS de alertas |
| `WHATSAPP_TOKEN` | Servidor apenas | Meta Graph API (WhatsApp) |

> **Nota:** O endpoint `oauth2.googleapis.com/tokeninfo` é público — o servidor não precisa de nenhum secret Google para verificar o `id_token`.

### Regras de segurança

1. **Nunca logue dados de saúde do usuário** — logs podem vazar em crash reporters
2. **Dados de saúde ficam apenas em** AsyncStorage local + Railway (servidor próprio, protegido por JWT) — nunca em serviços terceiros sem consentimento explícito
3. **Rate limiting existe** em todas as rotas críticas (`server/_core/rate-limit.ts`) — não o desabilite
4. **Security headers existem** (`server/_core/security-headers.ts`) — não os remova
5. **CORS configurado** — não alargue sem revisão
6. **Dados de saúde ficam** em AsyncStorage local + cloud backup no Railway (servidor próprio, protegido por JWT) — nunca em serviços de terceiros
7. **Validação de inputs com Zod** em todas as rotas tRPC — nunca confie em dados do cliente sem validar
8. **Nunca use `eval()` ou `Function()` construídos dinamicamente** no código do app
9. **expo-secure-store** para qualquer dado sensível além do JWT
10. **Auditoria de permissions Android** — as permissions declaradas no `app.config.ts` têm justificativa real; não adicione novas sem necessidade documentada

### Dados sensíveis que existem no app

- Métricas de saúde (pressão, glicemia, frequência cardíaca)
- Ficha de anamnese (diagnósticos, medicamentos)
- Localização GPS
- Contatos de emergência (nomes, telefones)
- Tipo sanguíneo

Qualquer feature nova que toque esses dados exige revisão de segurança e conformidade LGPD.

---

## 11. Conformidade Legal — LGPD e Regulatório

> **Esta seção é obrigatória. Ignore por sua conta e risco.**

### Classificação ANVISA

O Vigora Saúde **não é dispositivo médico** (SaMD) sob RDC 657/2022 enquanto:

- ✅ Armazena e exibe valores inseridos pelo usuário
- ✅ Envia lembretes e alertas
- ✅ Registra métricas manualmente

**Cruzar esta linha dispara obrigação de registro na ANVISA (penalidade até R$1,5M):**

- ❌ Auto-flagging de "pressão alta" com recomendação clínica
- ❌ Scoring ou classificação de métricas de saúde
- ❌ Avisos de interação medicamentosa por lógica própria do app
- ❌ Qualquer threshold que sugira decisão clínica
- ❌ Integração direta com 192 (SAMU) ou 193 (Bombeiros) — apenas contatos designados pelo usuário

### LGPD — Regras de implementação

O app processa **dados pessoais sensíveis de saúde de idosos** → regime de alto risco ANPD → LGPD plena, sem regime simplificado.

**Obrigações implementadas no produto:**

1. **Consentimento separado e destacado** para dados de saúde — não bundlar com aceite geral dos termos
2. **Exportação de dados** (Art. 18, V) — usuário deve poder exportar todos os seus dados em formato legível
3. **Exclusão de conta** (Art. 18, VI) — fluxo de "deletar minha conta" deve apagar dados do servidor
4. **DPO designado** — nome e email publicados na política de privacidade
5. **Política de privacidade** em português simples, com linguagem acessível para idosos

**O que nunca fazer:**

- ❌ Vender, compartilhar ou monetizar dados de saúde do usuário
- ❌ Usar dados de saúde para publicidade ou analytics de terceiros
- ❌ Enviar dados de saúde a serviços terceiros sem consentimento explícito
- ❌ Coletar mais dados do que o necessário para a função (princípio da minimização)

### Linguagem de marketing permitida vs. proibida

| ✅ Permitido | ❌ Proibido |
|---|---|
| "Monitoramento de saúde" | "Controla a pressão arterial" |
| "Tranquilidade para quem você ama" | "Previne quedas" |
| "Lembretes de medicação" | "Trata hipertensão" |
| "Registro de seus indicadores" | "Diagnostica problemas" |
| "Se algo acontecer, sua família saberá" | "Garante segurança em emergências" |
| "Cuida da sua saúde" | "Substitui consulta médica" |

### Disclaimer obrigatório (deve aparecer no onboarding e configurações)

> *Vigora Saúde é um aplicativo informativo para monitoramento de saúde e não substitui o diagnóstico, tratamento ou acompanhamento profissional médico. Em caso de emergência médica, ligue 192 (SAMU) ou 193 (Bombeiros). Alertas automáticos podem falhar; não confie exclusivamente neste aplicativo em situações de risco.*

### Consentimento de contatos de emergência

Contatos de emergência devem **optar por receber alertas** antes de serem ativados no dead man's switch. Contato que não confirmou não deve receber mensagens automáticas (requisito ANATEL + boa prática UX).

---

## 12. Checklist de Revisão — Execute Antes de Entregar

> **Todo código novo ou modificado deve passar por este checklist antes de ser considerado pronto.**

### Funcionalidade

- [ ] A funcionalidade faz exatamente o que foi pedido (nem mais, nem menos)
- [ ] Casos de erro estão tratados com feedback visual (AppDialog/AppToast)
- [ ] Estados de loading estão visíveis ao usuário
- [ ] Funciona sem conexão com internet (offline-first)
- [ ] Funciona após reinstalação do app (dados persistidos corretamente)

### UI/UX

- [ ] Todas as cores usam tokens do tema (nenhum hex hardcoded)
- [ ] Testado em modo claro E modo escuro
- [ ] Testado com modo acessível ativado
- [ ] Touch targets ≥ 44px (≥ 60px no modo acessível)
- [ ] `useSafeAreaInsets()` aplicado onde necessário (não cobre a status bar)
- [ ] Fontes respeitam os tamanhos mínimos (≥ 15px corpo, ≥ 16px botões)
- [ ] Texto em português brasileiro correto (sem inglês na UI)

### Segurança

- [ ] Nenhum dado sensível logado no console
- [ ] Nenhum secret ou API key no código do cliente
- [ ] Inputs validados com Zod antes de processamento (se backend)
- [ ] Tokens armazenados em `expo-secure-store`, não em `AsyncStorage`
- [ ] Nenhuma permission Android adicionada sem justificativa

### Legal/LGPD

- [ ] A feature não introduz avaliação/interpretação de métricas de saúde (linha ANVISA)
- [ ] Novos dados coletados têm base legal e estão documentados
- [ ] Dados de saúde não são enviados a serviços terceiros sem consentimento

### Código

- [ ] TypeScript sem erros novos (apenas o erro pré-existente em `storageProxy.ts` é permitido)
- [ ] Sem imports não utilizados introduzidos pela mudança
- [ ] `graphify update .` executado após modificações significativas
- [ ] Documentação atualizada se houver mudança arquitetural (`ARCHITECTURE.md`, `DEVELOPMENT_PROCESS.md`)

---

## 13. Padrões de Código

### Simplicidade primeiro

- Código mínimo que resolve o problema. Nada especulativo.
- Nenhuma abstração para uso único.
- Se escreveu 200 linhas e poderia ser 50, reescreva.

### Mudanças cirúrgicas

- Toque somente o que for necessário para o pedido.
- Não "melhore" código adjacente que não está quebrado.
- Se encontrou código morto não relacionado, mencione mas não delete.

### Convenções de arquivo

```
app/(tabs)/nome-kebab-case.tsx       → telas de usuário monitorado
app/(caregiver-tabs)/                → telas do cuidador
components/nome-kebab-case.tsx       → componentes reutilizáveis
lib/nome-kebab-case.ts(x)            → lógica de negócio e contexts
lib/_core/                           → utilitários sem dependência de UI
hooks/use-nome-kebab-case.ts         → custom hooks
server/                              → backend Railway (Node.js)
tests/                               → testes Vitest
```

### Imports

Use sempre o alias `@/` para imports absolutos:

```typescript
import { useColors } from '@/hooks/use-colors';
// NÃO: import { useColors } from '../../../hooks/use-colors';
```

### Componentes

- Um arquivo = um componente principal + sub-componentes relacionados
- Props tipadas com TypeScript interface nomeada
- Nenhum `any` explícito em código novo

### tRPC no cliente

```typescript
// Query (leitura)
const result = await trpcQuery('router.procedure', payload);
// result.data.json contém os dados (superjson transformer)

// Mutation (escrita)
const result = await trpcMutation('router.procedure', payload);
```

---

## 14. Testes

### Framework: Vitest 2.1.9

```bash
pnpm test              # todos os testes
pnpm test -- --watch   # modo watch
```

### O que testar

- **Reducers e lógica pura:** sempre (ex: `caregiver-state.test.ts`)
- **Segurança do servidor:** sempre (rate-limit, security-headers, CORS, auth)
- **Credenciais de serviços:** sempre antes de configurar em produção
- **Fluxos de compra:** sempre (RevenueCat)

### Cobertura mínima esperada para novos módulos críticos

- Toda lógica de negócio em `lib/` que não seja Context
- Toda rota tRPC nova no servidor
- Todo reducer novo

---

## 15. Fluxo de Dados — Guia Rápido

### Estado global (AppContext)

1. App inicia → carrega AsyncStorage
2. Se autenticado → `pullCloudData()` via `userData.get`
3. Cloud mais recente → `RESTORE_SNAPSHOT` (last-write-wins por `dataUpdatedAt`)
4. Usuário muda dados → debounce 3s → `pushCloudData()`

### Caregiver (CaregiverContext)

Estado separado em `lib/caregiver-context.tsx` com reducer puro em `lib/caregiver-state.ts` (testável sem UI). Vínculo monitorado↔cuidador via 3 métodos: `code | email_phone | qr`.

### Dead man's switch (Railway)

```
syncAlarms() → alarme dispara → alarm_event criado no Railway MySQL
  → usuário responde → alarm_event.response_type = 'dismissed'
  → não responde em 5min → monitoring-job (routers-monitoring.ts)
  → WhatsApp → Email → SMS (cascata)
```

### Compras (RevenueCat)

```
recurso bloqueado → ProUpsellModal → Paywall nativo
  → transação → CustomerInfoUpdateListener → isPro = true
```

---

## 16. Erros Conhecidos e Limitações

| Problema | Status | Localização |
|---|---|---|
| Erro TypeScript pré-existente em `storageProxy.ts` | Permanente (não afeta runtime) | `lib/storageProxy.ts` |
| Countdown na notificação nativa do expo-alarm-module | Limitação técnica — não viável sem código nativo customizado | `lib/alarm-countdown-notifier.ts` |
| Notificações duplicadas no Android | Resolvido: AlarmManager exclusivo no Android | `lib/alarm-sync.ts` |

---

## 17. Decisões Arquiteturais que Não Devem Ser Revertidas

1. **AlarmManager nativo exclusivo no Android** — expo-notifications no Android causa duplicatas
2. **Dados de saúde ficam no Railway** — nunca em serviços terceiros sem consentimento explícito
3. **JWT em SecureStore, não AsyncStorage** — segurança do token
4. **Context API + useReducer, não Redux** — simplicidade para o escopo atual
5. **Debounce de 3s no cloud sync** — evita writes excessivos ao servidor
6. **Last-write-wins por `dataUpdatedAt`** — estratégia de resolução de conflito de cloud sync
7. **Dois layouts completamente separados** (tabs vs caregiver-tabs) — não tente unificar
8. **`Alert.alert()` banido** — substituído pelo `AppDialog` customizado

---

## 18. Roadmap e Prioridades Atuais

### Bloqueadores de lançamento (fazer antes de submeter às lojas)

1. **Confiabilidade de alarmes** — alarmes às vezes não disparam; feature central de segurança
2. **Vínculo monitorado↔cuidador** — usando valores placeholder; dead man's switch depende disso
3. **Check-in diário standalone** — "tudo bem?" com escalação automática; fecha o gap do diferencial
4. **Acessibilidade UI** — centralizar tema, fontes e contraste; converter formulários em wizard
5. **Polimento do fluxo de cuidador** — telas existem mas precisam de teste e refinamento

### Fora de escopo (pós-lançamento)

- Animações e transições extras
- Refatoração de codebase
- Integração com wearables (Apple Watch / Wear OS) — Q3 2026
- IA para recomendações de saúde — Q1 2027

---

## 19. Referências Rápidas

| O que precisa | Onde encontrar |
|---|---|
| Cores e tokens | `theme.config.js`, `lib/_core/theme.ts` |
| Arquitetura completa | `docs/ARCHITECTURE.md` |
| Processo de build | `docs/BUILD_GUIDE.md` |
| Setup RevenueCat | `docs/REVENUECAT_SETUP.md` |
| Contexto regulatório (LGPD/ANVISA) | `docs/strategy/regulatory-context.md` |
| Estratégia de mercado | `docs/strategy/` |
| Configuração do app | `app.config.ts` |
| Variáveis de ambiente | `.env.example` |
| Testes | `tests/`, `vitest.config.ts` |
| Grafo de conhecimento | `graphify-out/wiki/index.md` |
