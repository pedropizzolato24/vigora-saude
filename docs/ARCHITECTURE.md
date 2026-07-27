# Arquitetura Técnica — Vigora

Este documento descreve a arquitetura técnica, stack de tecnologias, padrões de design e decisões arquiteturais do Vigora. **Este arquivo deve ser atualizado sempre que houver mudanças significativas na arquitetura, dependências ou padrões do projeto.**

---

## Visão Geral da Arquitetura

O Vigora segue uma arquitetura **mobile-first com um backend próprio único**: o servidor Node.js + tRPC hospedado no Railway cuida de autenticação, cloud backup, dead man's switch e envio de alertas. A aplicação funciona completamente offline, com sincronização opcional para o backend quando o usuário está autenticado.

```
┌─────────────────────────────────────────────────────────────────┐
│                      Camada de Apresentação                     │
│  (React Native + Expo Router + NativeWind + Reanimated)         │
│  Rotas: (tabs)/ · (caregiver-tabs)/ · alarm-ring · login · ...  │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│                   Camada de Lógica de Negócio                   │
│  Context API + Custom Hooks + RevenueCat SDK                     │
│  AppContext · CaregiverContext · PurchasesContext · AppLock ·    │
│  FontSize · Accessibility · Notifications · Theme                │
└──────────────────────────┬──────────────────────────────────────┘
                           │
          ┌────────────────┼────────────────┐
          │                │                │
┌─────────▼──────────┐  ┌──▼────────────┐  ┌──▼──────────────────┐
│  AsyncStorage Local │  │  Auth Layer   │  │  Backend Railway    │
│  (dados de saúde,  │  │  SecureStore  │  │  Node.js + tRPC     │
│   alarmes, perfil) │  │  JWT / Cookie │  │  + MySQL (Drizzle)  │
└────────────────────┘  └───────────────┘  └─────────────────────┘
```

---

## Stack de Tecnologias

### Frontend (React Native + Expo)

| Tecnologia | Versão | Propósito |
|---|---|---|
| React | 19.1.0 | Framework UI |
| React Native | 0.81.5 | Plataforma mobile |
| Expo | 54.0.35 | Managed workflow |
| Expo Router | 6.0.24 | Navegação file-based |
| TypeScript | 5.9.3 | Type safety |
| NativeWind | 4.2.1 | Tailwind CSS para RN |
| React Native Reanimated | 4.1.6 | Animações performáticas |
| React Native Gesture Handler | 2.28.0 | Gestos customizados |
| React Native Safe Area Context | 5.6.2 | SafeArea handling |
| TanStack Query | 5.90.12 | Server state management |

### Backend Principal (Node.js + Express — Railway)

| Tecnologia | Versão | Propósito |
|---|---|---|
| Node.js | 22.x | Runtime (CI e Railway) |
| Express | 4.22.1 | HTTP server |
| tRPC | 11.17.0 | Type-safe API |
| Drizzle ORM | 0.45.2 | Database ORM |
| MySQL | 8+ | Database (plugin Railway) |
| Zod | 4.2.1 | Schema validation |
| jose | 6.1.0 | Assinatura/verificação dos JWTs de sessão |

**Routers tRPC:**

| Router | Procedimentos | Propósito |
|---|---|---|
| `auth` | `me`, `refresh`, `completeRegistration`, `updateProfile`, `logout`, `deleteAccount` | Sessão (deslizante) e perfil |
| `userData` | `get`, `put` | Cloud backup por conta |
| `monitoring` | `heartbeat`, `createEvent`, `confirmEvent`, `getHistory`, `getWarnings`, `getStatus`, `sosAlertCaregivers` (+ `register`/`syncAlarms` como stubs de compat) | Liveness da conta e eventos de alarme — posse por `openId` |
| `link` | `createInvite`, `redeemInvite`, `createShareInvite`, `getInviteInfo`, `acceptInvite`, `getMyLink`, `getMyCaregivers`, `getMonitoredData`, `getMonitoredAlerts`, `revokeLink` | Vínculo monitorado↔cuidador |
| `push` | `register` | Registro do token de push (Expo) do cuidador |
| `whatsapp` | `sendEmergencyAlert`, `isConfigured` | Alertas via WhatsApp |
| `system` | health check | Status do servidor |

**Rotas REST (fora do tRPC):** ciclo de vida da sessão (`/api/auth/me`, `/logout`, `/session`), um endpoint por provedor de login (`/api/auth/google`, `/apple`, `/anonymous`, `/email/*`, `/phone/*`), descoberta de métodos habilitados (`/api/auth/methods`), health check profundo (`/api/health`, responde **503** quando o banco ou o job do dead man's switch estão ruins) e a landing de convite (`/convite/:token`).

**Rate limits:** 30 req/min/IP em `/api/auth`, 120 req/min/IP em `/api/trpc`, mais limites por procedimento nos alertas de emergência.

### Dead Man's Switch (Railway)

| Tecnologia | Propósito |
|---|---|
| `monitoring-job.ts` | Job em processo (`setInterval` 5 min) que detecta alarmes/check-ins não respondidos. Carência de 15 min, 30 min sem sinal = aparelho offline, mínimo de 2 h entre avisos do mesmo nível. |
| MySQL (Drizzle) | Banco de dados para liveness da conta, eventos de alarme e avisos |
| Meta Graph API (WhatsApp) | Alertas aos contatos de emergência |
| Expo Push (`exp.host`) | Push em tempo real aos cuidadores vinculados |

### Monetização

| Pacote | Versão | Propósito |
|---|---|---|
| react-native-purchases | 10.0.1 | RevenueCat SDK — compras e assinaturas |
| react-native-purchases-ui | 10.0.1 | RevenueCat UI — paywall e Customer Center nativos |

### Dependências Críticas

| Pacote | Versão | Propósito |
|---|---|---|
| expo-notifications | 0.32.17 | Notificações nativas (iOS e Web) |
| expo-alarm-module | 1.2.0 (com patch local) | AlarmManager nativo Android |
| `modules/expo-alarm-countdown` | local | Módulo Expo próprio — contagem regressiva nativa do alarme |
| expo-secure-store | 15.0.8 | Armazenamento seguro de tokens JWT |
| expo-local-authentication | 17.0.8 | Biometria do bloqueio do app |
| expo-location | 19.0.8 | Geolocalização |
| expo-contacts | 15.0.11 | Acesso a contatos do dispositivo |
| expo-sharing | 14.0.8 | Compartilhamento de arquivos |
| expo-print | 15.0.8 | Geração do PDF da anamnese |
| expo-haptics | 15.0.8 | Feedback háptico |
| @react-native-async-storage/async-storage | 2.2.0 | Persistência local |
| expo-auth-session | 7.0.11 | OAuth PKCE (Google) |
| expo-apple-authentication | 8.0.8 | Sign in with Apple |
| react-native-android-widget | 0.20.1 | Widgets Android |
| react-native-qrcode-svg | 6.3.21 | QR code do convite de cuidador |

### Ferramentas de Desenvolvimento

| Ferramenta | Versão | Propósito |
|---|---|---|
| Vitest | 3.2.6 | Testing framework |
| EAS CLI | >= 16.0.0 (`eas.json`) | Build e deployment |
| Prettier | 3.7.4 | Code formatting |
| ESLint | 9.39.2 | Linting |
| pnpm | 9.12.0 | Package manager |

---

## Estrutura de Pastas

```
vigora-saude/
├── app/                              # Expo Router (file-based routing)
│   ├── _layout.tsx                   # Root layout — providers, gates e initializers
│   ├── +native-intent.ts             # Roteia deep links crus (oauthredirect, alarm-ring)
│   ├── login.tsx                     # Login (Google, Apple, e-mail, telefone, sem conta)
│   ├── email-login.tsx               # Cadastro/login por e-mail + senha e recuperação
│   ├── phone-login.tsx               # Login por OTP no WhatsApp
│   ├── oauthredirect.tsx             # Callback do OAuth Google (troca code → JWT)
│   ├── register.tsx                  # Tela de cadastro com seleção de tipo de usuário
│   ├── onboarding.tsx                # Onboarding inicial do usuário monitorado
│   ├── caregiver-onboarding.tsx      # Onboarding inicial do cuidador
│   ├── alarm-ring.tsx                # Tela fullscreen de alarme disparado
│   ├── checkin-response.tsx          # Resposta ao check-in diário
│   ├── app-lock-setup.tsx            # Configuração de PIN + biometria
│   ├── appearance-settings.tsx       # Tema, tamanho de fonte, modo acessível
│   ├── help.tsx                      # Ajuda (fora das abas)
│   ├── convite/[token].tsx           # Aceite de convite por link universal
│   ├── (tabs)/                       # 11 abas + `tudo` (rota oculta)
│   │   ├── index.tsx                 # Dashboard (TrialBanner, ExpiredBanner, UpdateBanner)
│   │   ├── alarms.tsx                # Alarmes
│   │   ├── health.tsx                # Saúde (métricas)
│   │   ├── contacts.tsx              # Contatos de emergência
│   │   ├── anamnesis.tsx             # Anamnese + exportação PDF
│   │   ├── ambulance.tsx             # Ambulância
│   │   ├── location.tsx              # Localização GPS
│   │   ├── invite-caregiver.tsx      # Convidar cuidador (código / QR / link)
│   │   ├── profile.tsx               # Perfil do usuário (nome, data nasc., tipo sanguíneo)
│   │   ├── help.tsx                  # Ajuda e suporte
│   │   ├── settings.tsx              # Configurações (MonitoringPanel, card Pro, LGPD)
│   │   └── tudo.tsx                  # Menu completo
│   ├── (caregiver-tabs)/             # Seção exclusiva do cuidador
│   │   ├── _layout.tsx               # Layout com 4 abas + proteção de rota
│   │   ├── index.tsx                 # Dashboard do cuidador
│   │   ├── alerts.tsx                # Alertas recebidos
│   │   ├── person.tsx                # Detalhes da pessoa monitorada
│   │   ├── link.tsx                  # Wizard de vínculo (código / email-phone / QR)
│   │   └── settings.tsx              # Configurações do cuidador
│   └── (modal)/
│       ├── paywall.tsx               # RevenueCat Paywall nativo
│       └── customer-center.tsx       # RevenueCat Customer Center
├── components/
│   ├── screen-container.tsx          # SafeArea wrapper
│   ├── screen-header-back.tsx        # Cabeçalho com botão voltar das telas secundárias
│   ├── pro-limits.ts                 # FREE_LIMITS + MAX_ALARMS (módulo puro, fonte única)
│   ├── pro-upsell-modal.tsx          # Modal de upsell contextual (bottom sheet)
│   ├── trial-banner.tsx              # TrialBanner (azul) e ExpiredBanner (vermelho)
│   ├── update-banner.tsx             # Aviso de nova versão disponível
│   ├── app-dialog.tsx / app-toast.tsx # Diálogos e toasts do app (nunca `Alert.alert`)
│   ├── alarm-card.tsx                # Card de alarme reutilizável
│   ├── alarm-history-sheet.tsx       # Histórico de disparos
│   ├── contact-card.tsx              # Card de contato reutilizável
│   ├── monitoring-status-panel.tsx   # Painel de status de monitoramento
│   ├── monitoring-status-badge.tsx   # Badge compacto de status
│   ├── health-consent-gate.tsx       # Consentimento destacado para dados de saúde (LGPD)
│   ├── sos-countdown-dialog.tsx / sos-active-screen.tsx / sos-strip.tsx  # SOS
│   ├── app-lock-gate.tsx / app-lock-screen.tsx / pin-keypad.tsx  # Bloqueio do app
│   ├── caregiver-tab-bar.tsx         # Tab bar customizada para a seção de cuidador
│   ├── caregiver-empty-state.tsx     # Placeholder "aguardando vínculo"
│   ├── onboarding-gate.tsx           # Funil onboarding → login → registro
│   ├── alarm-notification-handler.tsx # Handler de notificações de alarme em foreground
│   ├── alarm-sync-initializer.tsx    # Inicializa sincronização de alarmes ao montar
│   ├── checkin-initializer.tsx       # Agenda o check-in diário
│   ├── monitoring-initializer.tsx    # Inicializa serviço de monitoramento contínuo
│   ├── caregiver-push-initializer.tsx # Registra o token de push do cuidador
│   └── animated-components.tsx       # Transições e micro-animações compartilhadas
├── widgets/                          # Widgets Android (SOS, próximo alarme, saúde)
├── modules/expo-alarm-countdown/     # Módulo Expo local (contagem regressiva nativa)
├── context/
│   └── purchases-context.tsx         # PurchasesProvider (isPro, isTrialActive, trialDaysLeft, TRIAL_DAYS)
├── hooks/
│   ├── use-auth.ts                   # Sessão/usuário
│   ├── use-purchases.ts              # Hook usePurchases()
│   ├── use-delete-account.ts         # Exclusão de conta (LGPD)
│   ├── use-monitoring-status.ts      # Status do dead man's switch
│   ├── use-colors.ts                 # Hook para cores do tema
│   └── use-color-scheme.ts           # Detecção light/dark mode
├── lib/
│   ├── _core/                        # Utilitários centrais (sem dependências de UI)
│   │   ├── auth.ts                   # getSessionToken, setSessionToken, getUserInfo (SecureStore/localStorage)
│   │   ├── api.ts                    # Configuração base do cliente HTTP
│   │   ├── theme.ts                  # Tokens de tema (cores, tipografia)
│   │   ├── font-scale.ts             # Escala de fonte por tamanho
│   │   ├── session-status.ts         # Estado global de sessão (401 → login)
│   │   ├── oem-battery-hint.ts       # Rotas de isenção de bateria por fabricante
│   │   └── nativewind-pressable.ts   # Patch de compatibilidade NativeWind/Pressable
│   ├── app-context.tsx               # Global state + cloud sync integrado (pull/push)
│   ├── caregiver-context.tsx         # CaregiverProvider — estado e persistência AsyncStorage
│   ├── caregiver-state.ts            # Tipos + reducer puro do estado do cuidador (unit-testável)
│   ├── cloud-sync.ts                 # pullCloudData / pushCloudData via userData tRPC router
│   ├── session-refresh.ts            # Sessão deslizante (auth.refresh no startup)
│   ├── {google,apple,email,phone,anonymous}-signin.ts  # Provedores de login (cliente)
│   ├── purchases.ts                  # RevenueCat SDK (inicialização, entitlement)
│   ├── device-id.ts                  # Device ID persistente (metadado, não chave de posse)
│   ├── push-registration.ts          # Resolve o token de push (Expo) do dispositivo
│   ├── alarm-sync.ts                 # Sincronização de alarmes (Android: nativo; iOS: expo-notifications)
│   ├── alarm-fire-times.ts           # Cálculo dos próximos disparos (unit-testável)
│   ├── native-alarm-manager.ts       # AlarmManager nativo Android
│   ├── alarm-timer-store.ts          # Persistência do timer de alarme para cold-start
│   ├── alarm-escalation.ts           # Lógica de escalação para WhatsApp
│   ├── checkin-*.ts                  # Check-in diário (serviço, defaults, dedupe, notificação)
│   ├── app-lock-*.ts(x)              # PIN + biometria (contexto, core puro, storage)
│   ├── battery-optimization.ts       # Isenção de otimização de bateria (Android/OEM)
│   ├── app-update-*.ts               # Checagem de nova versão
│   ├── register-draft.ts             # Rascunho persistente do cadastro
│   ├── caregiver-link-service.ts     # Convites e vínculo (cliente)
│   ├── health-report-generator.ts    # Relatório de saúde
│   ├── pdf-utils-v2.ts               # Geração de PDF da Anamnese
│   ├── font-size-context.tsx         # Context de tamanho de fonte
│   ├── accessibility-context.tsx     # Context de modo acessibilidade
│   ├── notifications-context.tsx     # Context de notificações
│   ├── theme-provider.tsx            # ThemeProvider global
│   └── monitoring-service.ts         # Serviço de monitoramento contínuo (tRPC)
├── server/                           # Backend Node.js (hospedado no Railway)
│   ├── _core/
│   │   ├── oauth.ts                  # Rotas de sessão (me/logout/session)
│   │   ├── trpc.ts                   # publicProcedure / protectedProcedure
│   │   ├── context.ts                # Contexto tRPC por request
│   │   ├── cookies.ts                # Gerenciamento de cookies de sessão
│   │   ├── cors.ts                   # Allowlist de origens
│   │   ├── rate-limit.ts             # Rate limiting por rota
│   │   ├── security-headers.ts       # Headers de segurança HTTP
│   │   ├── pick-pending-event.ts     # Seleção atômica do evento a escalar
│   │   ├── systemRouter.ts           # Health check via tRPC
│   │   └── env.ts                    # Env + `assertRequiredSecrets` (fail-closed)
│   ├── routers.ts                    # Router principal (system, auth, userData, whatsapp)
│   ├── routers-monitoring.ts         # Sub-router de monitoramento e alertas
│   ├── routers-links.ts              # Vínculo monitorado↔cuidador (link.*)
│   ├── routers-push.ts               # Registro de push token (push.register)
│   ├── monitoring-job.ts             # Dead man's switch em processo (setInterval 5 min)
│   ├── db.ts                         # Queries Drizzle + `migrate()` no boot
│   ├── db-monitoring.ts / db-links.ts / db-push.ts / db-auth.ts / db-account.ts
│   ├── {google,apple,email,phone,anonymous}-auth.ts  # Provedores de login (servidor)
│   ├── auth-shared.ts                # Vínculo de identidades pelo e-mail canônico
│   ├── links-code.ts                 # Geração/validação dos códigos de convite
│   ├── invite-landing.ts             # Landing HTML de /convite/:token
│   ├── whatsapp.ts                   # Alertas a contatos via Meta Graph API
│   └── push.ts                       # Push (Expo) para cuidadores vinculados
├── tests/                            # Suíte Vitest — 38 arquivos, 290 testes
│   ├── auth-providers.test.ts        # Provedores de login e vínculo por e-mail
│   ├── auth.refresh.test.ts          # Sessão deslizante
│   ├── monitoring-job.*.test.ts      # Resiliência e inatividade do dead man's switch
│   ├── alarm-fire-times.test.ts      # Cálculo dos próximos disparos
│   ├── checkin-*.test.ts             # Check-in diário
│   ├── push.test.ts                  # Sender de push (Expo): batching + poda de token
│   ├── caregiver-state.test.ts       # Reducer do estado do cuidador
│   ├── rate-limit.test.ts / security-headers.test.ts / cors.test.ts  # Segurança
│   └── ...
├── docs/
│   ├── ARCHITECTURE.md               # Este arquivo
│   ├── BUILD_GUIDE.md                # Build e publicação nas lojas
│   ├── REVENUECAT_SETUP.md           # Configuração do painel RevenueCat
│   ├── DEVELOPMENT_PROCESS.md        # Cronograma e decisões de desenvolvimento
│   ├── claude/                       # Detalhe por subsistema (lido sob demanda)
│   ├── design/                       # Design docs datados de decisões pontuais
│   └── strategy/                     # Contexto regulatório e de mercado
├── app.config.ts                     # Expo configuration
├── eas.json                          # EAS Build profiles
├── vitest.config.ts                  # Vitest com alias @, JSX, __DEV__
├── package.json
├── tailwind.config.js
└── theme.config.js
```

---

## Padrões de Design

### 1. Autenticação — JWT em SecureStore (nativo) / Cookie (web)

O app tem cinco caminhos de login — Google (OAuth PKCE), Apple, e-mail+senha, telefone (OTP via WhatsApp) e conta anônima ("continuar sem conta"). Todos convergem: o servidor verifica a credencial do provedor e emite um JWT próprio, armazenado pelo app:

```typescript
// lib/_core/auth.ts
export async function setSessionToken(token: string): Promise<void> {
  if (Platform.OS === 'web') return; // web usa cookie httpOnly
  await SecureStore.setItemAsync(SESSION_TOKEN_KEY, token);
}

// Em requests nativos: header Authorization: Bearer <token>
// Em requests web: cookie httpOnly gerenciado pelo servidor
```

O tipo de usuário (`caregiver | monitored`) é definido no cadastro e determina qual fluxo o app segue após o login.

O e-mail verificado é a **chave canônica de vínculo de conta** (`users.email` é único, `auth_identities` guarda um registro por provedor): logar com Google e depois com e-mail+senha no mesmo endereço cai na mesma conta. Contas só de telefone e contas Apple com "hide my email" não têm e-mail e ficam fora dessa regra.

A sessão é **deslizante**: `auth.refresh` roda a cada abertura do app (`lib/session-refresh.ts`), emitindo um token novo para quem já está autenticado. Um 401 em qualquer chamada dispara o tratamento global (`lib/_core/session-status.ts`) e leva ao login. Sem isso, uma sessão expirada silenciosamente desarmava o dead man's switch — heartbeat, sync e eventos começavam a dar 401 sem nenhum sinal para o usuário.

---

### 2. Context API + useReducer (Global State)

O estado global é gerenciado através do **AppContext** com `useReducer`. Ao iniciar, o contexto carrega o estado do AsyncStorage e, se o usuário estiver autenticado, faz pull do cloud backup:

```typescript
// lib/app-context.tsx
useEffect(() => {
  const reconcile = async () => {
    const cloud = await pullCloudData();
    if (cloud && cloud.dataUpdatedAt > localTimestamp) {
      // Cloud mais recente → substitui local (last-write-wins)
      dispatch({ type: 'RESTORE_SNAPSHOT', payload: cloud });
    }
  };
  reconcile();
}, [isAuthenticated]);
```

---

### 3. Cloud Backup — Push com Debounce de 3s

Toda mudança de estado dispara um push para o servidor após 3 segundos de inatividade (debounce), garantindo que o dado mais recente sobreviva a reinstalações:

```typescript
// lib/cloud-sync.ts
export async function pushCloudData(snapshot: CloudSnapshot): Promise<boolean> {
  // Bearer token no header (nativo) ou cookie (web)
  // Endpoint: POST /api/trpc/userData.put
  // Conflict resolution: last-write-wins via snapshot.dataUpdatedAt
}
```

---

### 4. Caregiver Shell — Contexto Separado

Usuários do tipo `caregiver` recebem um layout completamente diferente (`app/(caregiver-tabs)/`). O estado do cuidador é gerenciado pelo `CaregiverContext` com reducer puro e testável:

```typescript
// lib/caregiver-state.ts
export interface CaregiverState {
  linkedMonitored: LinkedMonitored | null; // pessoa monitorada vinculada
  notificationPrefs: CaregiverNotificationPrefs;
}
// Vínculo via 3 métodos: 'code' | 'email_phone' | 'qr'
```

---

### 5. RevenueCat SDK — Inicialização e Contexto

O RevenueCat SDK é inicializado no root layout e exposto via `PurchasesContext`:

```typescript
// context/purchases-context.tsx
export function PurchasesProvider({ children }) {
  const [isPro, setIsPro] = useState(false);
  const [isTrialActive, setIsTrialActive] = useState(false);
  const [trialDaysLeft, setTrialDaysLeft] = useState(0);

  useEffect(() => {
    initializePurchases();
    Purchases.addCustomerInfoUpdateListener((info) => {
      const proEntitlement = info.entitlements.active['Vigora Saúde Pro'];
      setIsPro(!!proEntitlement?.isActive);
      setIsTrialActive(proEntitlement?.periodType === 'TRIAL');
    });
  }, []);
}
```

---

### 6. Política de Acesso — Sem Bloqueio por Plano

O app **não restringe recursos por plano**. A monetização é por assinatura após o trial de 14 dias (TrialBanner/ExpiredBanner + paywall), nunca por bloqueio de funcionalidade. A fonte única de verdade é um módulo puro, importado tanto pela UI quanto pelos testes:

```typescript
// components/pro-limits.ts
export const FREE_LIMITS = {
  CONTACTS: Infinity,
  ALARMS: Infinity,
  PDF_EXPORT: true,
  MONITORING: true,
} as const;

/** Teto técnico de alarmes simultâneos (limite do agendador, não do plano). */
export const MAX_ALARMS = 24;
```

> Os componentes `ProGate` / `ProBanner` / `ProLimitBadge` foram removidos junto com os limites por plano. Sobrou o `ProUpsellModal`, usado como convite à assinatura — não como bloqueio.

---

### 7. Sincronização de Alarmes (Plataforma-específica)

```typescript
// lib/alarm-sync.ts
export async function scheduleFullAlarm(alarm: Alarm) {
  if (Platform.OS === 'android' && isNativeAlarmAvailable()) {
    await NativeAlarmManager.scheduleAlarm(alarm); // AlarmManager nativo EXCLUSIVO
    return;
  }
  await scheduleAlarmNotification(alarm); // iOS e Web: expo-notifications
}
```

---

### 8. Dead Man's Switch (Railway)

```
1. App envia heartbeat (monitoring.heartbeat) enquanto ativo — liveness é da CONTA
   ↓
2. Quando um alarme dispara, cria alarm_event (status 'pending')
   ↓
3. Usuário confirma → alarm_event.status = 'responded'
   ↓
4. Se não confirmado em 15 min → monitoring-job.ts (setInterval 5 min) detecta o evento expirado
   ↓
5. Marca como 'missed' (conta deu sinal nos últimos 30 min) ou 'not_sent' (offline)
   ↓
6. Avisa contatos de emergência por WhatsApp (Meta Graph API) E
   envia push (Expo) aos cuidadores vinculados — destinatários independentes
   (mínimo de 2 h entre avisos do mesmo nível)
```

A agenda autoritativa de alarmes vive em `user_data.alarms` (cloud backup). `monitoring.syncAlarms` e `monitoring.register` sobrevivem apenas como stubs de compatibilidade para clientes antigos.

O check-in diário entra na **mesma** máquina de estados: falta de resposta dentro da janela vira um evento expirado e escala igual.

---

## Providers no Root Layout

A ordem importa. O root layout empilha (de fora para dentro):

```tsx
<ThemeProvider>                  // Tema (light/dark) — mais externo
  <SafeAreaProvider>
    <GestureHandlerRootView>
      <PurchasesProvider>        // RevenueCat (monetização)
        <NotificationsProvider>  // Permissões e canais de notificação
          <CaregiverProvider>    // Estado do cuidador (AsyncStorage)
            <AppProvider>        // Estado global do app + cloud sync
              <AlarmSyncInitializer />
              <OnboardingGate />              // Funil onboarding → login → registro
              <FontSizeProvider>
                <AccessibilityProvider>
                  <AppLockProvider>           // PIN + biometria
                    <AlarmNotificationHandler />
                    <MonitoringInitializer /> // Heartbeat do dead man's switch
                    <CheckinInitializer />    // Agenda o check-in diário
                    <QueryClientProvider>     // tRPC / React Query
                      <AppLockGate />         // Bloqueia a UI até destravar
                      <Stack>...</Stack>
```

---

## Fluxo de Dados

### Fluxo de Autenticação (OAuth Google)

```
1. Usuário toca "Entrar com o Google"
   ↓
2. App abre o Custom Tab com a URL de autorização OAuth (PKCE);
   o code_verifier e o redirectUri são persistidos antes de sair do app
   ↓
3. Google redireciona para com.vigora.saude:/oauthredirect?code=...
   ↓
4. app/+native-intent.ts encaminha o deep link para app/oauthredirect.tsx
   ↓
5. A tela troca o code por tokens (usando o PKCE persistido — funciona mesmo
   se o app tiver sido morto durante o login) e envia o id_token para
   POST /api/auth/google, que o verifica e emite o JWT próprio
   ↓
6. JWT armazenado em SecureStore (nativo) ou cookie (web)
   ↓
7. getUserInfo() retorna User com userType
   ↓
8. userType ausente        → router.replace('/register')
   userType === 'caregiver' → router.replace('/(caregiver-tabs)')
   userType === 'monitored' → router.replace('/(tabs)')
```

> O Client ID Android de **debug** e o de **release** são diferentes (SHA-1 do certificado); ambos estão fixados por profile no `eas.json` e são aceitos pelo servidor.

### Fluxo de Cloud Backup

```
1. App inicia → AppProvider carrega AsyncStorage
   ↓
2. Se autenticado → pullCloudData() via userData.get tRPC
   ↓
3. Compara dataUpdatedAt: cloud > local → restaura snapshot
   ↓
4. Usuário altera dados → debounce 3s
   ↓
5. pushCloudData() via userData.put tRPC
   ↓
6. Servidor salva snapshot keyed por openId
```

### Fluxo de Compra (RevenueCat)

```
1. Trial de 14 dias expira (ou o usuário toca "Assinar Vigora Pro")
   ↓
2. ExpiredBanner / ProUpsellModal convida à assinatura — nenhum recurso é bloqueado
   ↓
3. Usuário clica "Assinar Pro" → Paywall nativo abre
   ↓
4. RevenueCat SDK processa transação
   ↓
5. CustomerInfoUpdateListener é disparado
   ↓
6. isPro = true, UI atualiza automaticamente
```

---

## Estratégia de Testes

### Testes Automatizados (Vitest)

Suíte Vitest cobrindo frontend e backend — **290 testes em 38 arquivos** (`pnpm test`):

| Área | Arquivos de Teste |
|---|---|
| RevenueCat / Monetização | `purchases.test.ts`, `revenuecat-expo-key.test.ts` |
| Auth | `auth-providers.test.ts`, `auth.logout.test.ts`, `auth.refresh.test.ts`, `google-auth.test.ts`, `anonymous-account.test.ts`, `session-revocation.test.ts`, `session-expired-status.test.ts` |
| Dead man's switch | `monitoring-job.inactivity.test.ts`, `monitoring-job.resilience.test.ts`, `monitoring-missed-alarm-push.test.ts`, `monitoring-health.test.ts`, `monitoring.auth.test.ts`, `pick-pending-event.test.ts` |
| Alarmes | `alarm-fire-times.test.ts`, `alarm-lock-screen-manifest.test.ts`, `oem-battery-hint.test.ts` |
| Check-in diário | `checkin-service.test.ts`, `checkin-state.test.ts`, `checkin-dedup.test.ts` |
| Caregiver / vínculo | `caregiver-state.test.ts`, `links.test.ts`, `link.getMyCaregivers.test.ts`, `native-intent-redirect.test.ts` |
| Notificações / Push | `push.test.ts` (sender Expo: batching, poda de token morto) |
| Segurança (servidor) | `rate-limit.test.ts`, `security-headers.test.ts`, `cors.test.ts`, `required-secrets.test.ts`, `whatsapp.auth.test.ts` |
| Acessibilidade / UI | `font-scale-touch-target.test.ts`, `app-lock-core.test.ts`, `register-draft.test.ts` |
| Outros | `pdf-escape.test.ts`, `location-privacy.test.ts`, `id-entropy.test.ts`, `app-update-core.test.ts` |

**Configuração (`vitest.config.ts`):**
- Alias `@` → raiz do projeto
- Suporte a JSX com `@vitejs/plugin-react`
- Define `__DEV__ = true` para compatibilidade com React Native

---

## Segurança

### Variáveis de Ambiente

| Variável | Escopo | Propósito |
|---|---|---|
| `EXPO_PUBLIC_REVENUECAT_API_KEY` | Cliente (público) | API key **pública** RevenueCat (`goog_*`/`appl_*` — nunca `sk_*`) |
| `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` / `_IOS_` / `_WEB_` | Cliente (público) | OAuth Google — Client IDs (Android tem IDs distintos p/ debug e release) |
| `EXPO_PUBLIC_API_BASE_URL` | Cliente (público) | URL do servidor Railway |
| `EXPO_PUBLIC_APPLE_SIGNIN_ENABLED` | Cliente (build) | Liga o botão Apple + entitlement (só `"true"` em produção) |
| `EXPO_PUBLIC_LINK_HOST` / `_LINK_BASE_URL` | Cliente (público) | Domínio dos links universais de convite |
| `JWT_SECRET` | Servidor (privado) | Assinatura de tokens JWT — **o servidor não sobe em produção sem ele** (`assertRequiredSecrets`) |
| `WHATSAPP_API_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID` | Servidor (privado) | Meta Graph API — alertas a contatos e OTP de telefone |
| `WHATSAPP_OTP_TEMPLATE_NAME` / `_LANG` | Servidor (privado) | Template de autenticação aprovado no Meta (login por telefone) |
| `RESEND_API_KEY` / `EMAIL_FROM` | Servidor (privado) | Códigos de e-mail (cadastro e recuperação de senha) |
| `APPLE_TEAM_ID` / `ANDROID_CERT_SHA256` | Servidor | Arquivos de associação de App Links / Universal Links |
| `CORS_ORIGIN_ALLOWLIST` | Servidor | Allowlist de origens |

### Armazenamento de Tokens

- **Nativo (iOS/Android):** JWT armazenado em `expo-secure-store` (keychain / Android Keystore)
- **Web:** Cookie `httpOnly; Secure; SameSite=Strict` emitido pelo servidor — sem acesso via JavaScript

### Dados de Saúde

Dados de saúde (métricas, anamnese) são armazenados no **AsyncStorage local** e no cloud backup do servidor próprio (Railway), protegido por autenticação JWT. Nenhum dado de saúde é enviado a serviços de terceiros: o backend único no Railway concentra autenticação, backup e o dead man's switch (alarmes, heartbeat, contatos de emergência).

### Posse de Dados no Monitoramento

Toda autorização do monitoramento é por **conta** (`openId`), nunca por aparelho. O `deviceId` é metadado (`accountLiveness.lastDeviceId`) — gancho para multi-device/wearables no futuro — e não serve como chave de posse, o que elimina a enumeração de dispositivos como vetor. Ver `docs/design/2026-07-12-monitoring-account-ownership.md`.

### Limites Regulatórios (ANVISA / LGPD)

A arquitetura evita deliberadamente qualquer camada de interpretação de dados de saúde: não há scoring, classificação, threshold clínico nem aviso de interação medicamentosa. O app armazena, exibe, lembra e alerta — nada além disso —, o que o mantém fora da definição de dispositivo médico. Alertas automáticos vão apenas para contatos designados pelo usuário, nunca para 192/193.

Do lado da LGPD: consentimento destacado para dados de saúde (`components/health-consent-gate.tsx`), política de privacidade acessível no app com o e-mail do DPO, e `auth.deleteAccount` apagando a conta e os dados do servidor (Art. 18 VI).

---

## Roadmap Técnico

| Versão | Funcionalidade | Status |
|---|---|---|
| v1.0 | MVP com alarmes, contatos, saúde | ✅ Concluído |
| v1.1 | RevenueCat monetização + paywall nativo | ✅ Concluído |
| v1.2 | Upsell contextual + ProGate | ✅ Concluído |
| v1.3 | Supabase dead man's switch + trial de 7 dias | ✅ Concluído |
| v1.4 | Bugfix notificações duplicadas Android | ✅ Concluído |
| v1.5 | Autenticação de conta (OAuth Google/Apple + email) | ✅ Concluído |
| v1.6 | Cloud backup por conta (cloud-sync, userData router) | ✅ Concluído |
| v1.7 | Caregiver shell (4 abas, wizard de vínculo, onboarding) | ✅ Concluído |
| v1.8 | Migração do dead man's switch para o Railway (Supabase removido) | ✅ Concluído |
| v1.9 | Alertas: WhatsApp (contatos) + push no app (cuidadores); Email/SMS removidos | ✅ Concluído |
| v1.10 | Login multi-provedor (Apple, e-mail+senha, telefone via OTP, conta anônima) + vínculo de identidades pelo e-mail | ✅ Concluído |
| v1.11 | Posse por conta (`openId`) no monitoramento — `app_users`/`synced_alarms`/`device_heartbeat` removidas, `account_liveness` criada | ✅ Concluído |
| v1.12 | Check-in diário, bloqueio do app (PIN + biometria), widgets Android, convite de cuidador por link universal | ✅ Concluído |
| v1.13 | Compatibilidade Android 14+ (full-screen intent, isenção de bateria, rotas OEM), sessão deslizante, migrations automáticas no boot | ✅ Concluído |
| v2.0 | Integração com wearables (Apple Watch, Wear OS) | Q4 2026 |
| v2.1 | Notificações push personalizadas (saúde) | Q1 2027 |
| v3.0 | Sugestões de saúde assistidas por IA — **bloqueado por avaliação regulatória** (ANVISA: interpretar métrica caracteriza dispositivo médico) | Em avaliação |

---

## Conclusão

A arquitetura do Vigora foi projetada para ser **simples, resiliente e segura**. O uso de Expo, Context API e AsyncStorage permite funcionamento completo offline. A autenticação por conta (OAuth + JWT) habilita cloud backup automático, permitindo que o usuário reinstale o app e recupere todos os dados. O backend único no Railway concentra o dead man's switch (job em processo), os alertas por WhatsApp e o push aos cuidadores. O RevenueCat gerencia toda a complexidade de monetização cross-platform. O sistema de dois tipos de usuário (`monitored` / `caregiver`) com layouts completamente distintos cobre o caso de uso de monitoramento remoto de pessoas dependentes.
