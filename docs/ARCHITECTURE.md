# Arquitetura Técnica — Vigora Saúde

Este documento descreve a arquitetura técnica, stack de tecnologias, padrões de design e decisões arquiteturais do Vigora Saúde. **Este arquivo deve ser atualizado sempre que houver mudanças significativas na arquitetura, dependências ou padrões do projeto.**

---

## Visão Geral da Arquitetura

O Vigora Saúde segue uma arquitetura **mobile-first com dois backends complementares** e suporte a dois modos de uso distintos (Usuário Monitorado e Cuidador). O servidor principal (Node.js + tRPC) gerencia monitoramento em tempo real, o sistema de cuidadores e push notifications. O Supabase fornece o dead man's switch. A aplicação funciona completamente offline, com sincronização opcional para os backends.

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Camada de Apresentação                       │
│   (React Native 0.81 + Expo Router 6 + NativeWind 4 + Reanimated)  │
│                                                                     │
│   Modo Usuário (tabs)          Modo Cuidador (caregiver)            │
│   ├── Dashboard                ├── Status do Monitorado             │
│   ├── Alarmes                  └── ...                              │
│   ├── Saúde                                                         │
│   ├── Contatos                                                      │
│   └── Configurações                                                 │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────────┐
│                     Camada de Lógica de Negócio                     │
│   Context API (AppContext, CaregiverContext, UserModeContext)        │
│   RevenueCat SDK + MonitoringService + PushToken                    │
└─────────────────────┬────────────────────────┬──────────────────────┘
                      │                        │
         ┌────────────▼────────┐   ┌───────────▼────────────────────┐
         │  AsyncStorage Local │   │  Backends Remotos               │
         │  (dados de saúde,  │   │  ┌─ Node.js + tRPC (principal) │
         │   alarmes, perfil) │   │  │   ├── monitoring.*           │
         └────────────────────┘   │  │   ├── caregiver.*            │
                                  │  │   └── webhooks.*             │
                                  │  └─ Supabase (dead man's switch)│
                                  │     ├── alarm_events            │
                                  │     └── check-missed-alarms     │
                                  └────────────────────────────────┘
                                              │
                                  ┌───────────▼────────────────────┐
                                  │  Expo Push Notifications API    │
                                  │  (push para cuidadores)         │
                                  └────────────────────────────────┘
```

---

## Stack de Tecnologias

### Frontend (React Native + Expo)

| Tecnologia | Versão | Propósito |
|---|---|---|
| React | 19.1.0 | Framework UI |
| React Native | 0.81.5 | Plataforma mobile (New Architecture ativada) |
| Expo | 54.0.29 | Managed workflow |
| Expo Router | 6.0.19 | Navegação file-based |
| TypeScript | 5.9.3 | Type safety |
| NativeWind | 4.2.1 | Tailwind CSS para RN |
| React Native Reanimated | 4.1.6 | Animações performáticas |
| React Native Worklets | 0.5.1 | Worklets runtime (requer New Arch) |
| React Native Gesture Handler | 2.28.0 | Gestos customizados |
| React Native Safe Area Context | 5.6.2 | SafeArea handling |
| TanStack Query | 5.90.12 | Server state management |

### Backend Principal (Node.js + Express)

| Tecnologia | Versão | Propósito |
|---|---|---|
| Node.js | 22.13.0 | Runtime |
| Express | 4.22.1 | HTTP server |
| tRPC | 11.7.2 | Type-safe API |
| Drizzle ORM | 0.44.7 | Database ORM |
| PostgreSQL | 15+ | Database |
| Zod | 4.2.1 | Schema validation |
| Expo Push API | — | Push notifications para cuidadores |

### Dead Man's Switch (Supabase)

| Tecnologia | Propósito |
|---|---|
| Supabase (PostgreSQL) | Banco de dados para alarmes, usuários, vínculos e eventos |
| Supabase Edge Functions (Deno) | `check-missed-alarms` — verifica alarmes não respondidos |
| pg_cron | Agendamento da Edge Function a cada 2 minutos |
| Meta Graph API (WhatsApp) | Envio de alertas para contatos de emergência |

### Monetização

| Pacote | Versão | Propósito |
|---|---|---|
| react-native-purchases | 10.0.1 | RevenueCat SDK — compras e assinaturas |
| react-native-purchases-ui | 10.0.1 | RevenueCat UI — paywall e Customer Center nativos |

### Dependências Críticas (Mobile)

| Pacote | Versão | Propósito | Compatibilidade New Arch |
|---|---|---|---|
| expo-notifications | 0.32.15 | Notificações nativas (principal no Android após remoção do alarm-module) | ✅ |
| expo-location | ^55.1.8 | Geolocalização | ✅ |
| expo-contacts | ~15.0.11 | Acesso a contatos do dispositivo | ✅ |
| expo-file-system | — | Acesso a arquivos (crash reporter) | ✅ |
| expo-alarm-module | 1.2.0 | ❌ Excluído do build (incompatível com RN 0.81 New Arch) | ❌ |
| react-native-android-widget | 0.20.1 | Widgets Android (temporariamente desabilitado) | ⚠️ |
| expo-alarm-countdown (local) | 1.0.0 | Countdown na notificação nativa | ⚠️ (não auto-linked) |

---

## Estrutura de Pastas

```
vigora-saude/
├── app/                                    # Expo Router (file-based routing)
│   ├── _layout.tsx                         # Root layout: ErrorBoundary, CrashReportViewer, providers
│   ├── mode-select.tsx                     # Seleção de modo (Usuário / Cuidador)
│   ├── alarm-ring.tsx                      # Tela full-screen do alarme
│   ├── onboarding/                         # Fluxo de onboarding
│   ├── oauth/callback.tsx                  # Callback OAuth
│   ├── (tabs)/                             # Modo Usuário Monitorado
│   │   ├── index.tsx                       # Dashboard
│   │   ├── alarms.tsx                      # Alarmes (limite 5 gratuito)
│   │   ├── health.tsx                      # Saúde (métricas)
│   │   ├── contacts.tsx                    # Contatos (limite 3 gratuito)
│   │   ├── anamnesis.tsx                   # Anamnese (PDF bloqueado no gratuito)
│   │   ├── ambulance.tsx                   # Ambulância
│   │   ├── location.tsx                    # Localização GPS
│   │   └── settings.tsx                    # Configurações (MonitoringPanel, Cuidadores, card Pro)
│   ├── (caregiver)/                        # Modo Cuidador
│   │   └── _layout.tsx                     # Layout cuidador + registra push token
│   └── (modal)/
│       ├── paywall.tsx                     # RevenueCat Paywall nativo
│       └── customer-center.tsx             # RevenueCat Customer Center
├── components/
│   ├── alarm-sync-initializer.tsx          # Sincroniza alarmes no startup
│   ├── alarm-notification-handler.tsx      # Intercepta notificações de alarme
│   ├── crash-report-viewer.tsx             # Exibe crash do nativo (fallback React)
│   ├── monitoring-initializer.tsx          # Inicia monitoramento contínuo + dialogs
│   ├── onboarding-gate.tsx                 # Verifica se onboarding foi concluído
│   ├── monitoring-status-panel.tsx         # Painel de status de monitoramento
│   ├── pro-gate.tsx                        # ProGate, ProBanner, ProLimitBadge, FREE_LIMITS
│   ├── pro-upsell-modal.tsx                # Modal de upsell contextual (bottom sheet)
│   ├── trial-banner.tsx                    # TrialBanner (azul) e ExpiredBanner (vermelho)
│   ├── alarm-card.tsx                      # Card de alarme reutilizável
│   └── contact-card.tsx                    # Card de contato reutilizável
├── context/
│   └── purchases-context.tsx               # PurchasesProvider (isPro, isTrialActive, trialDaysLeft)
├── lib/
│   ├── app-context.tsx                     # Global state + sincronização
│   ├── caregiver-context.tsx               # Context do modo cuidador (tRPC real)
│   ├── user-mode-context.tsx               # Context do modo de uso (usuário/cuidador)
│   ├── monitoring-service.ts               # Serviço de monitoramento (raw fetch tRPC)
│   ├── push-token.ts                       # Gestão de Expo push token
│   ├── purchases.ts                        # RevenueCat SDK (inicialização, entitlement)
│   ├── alarm-sync.ts                       # Sincronização de alarmes (Android: expo-notifications)
│   ├── alarm-timer-store.ts                # Persistência do timer de alarme (AsyncStorage)
│   ├── alarm-countdown-notifier.ts         # Atualiza countdown na notificação nativa
│   ├── native-alarm-manager.ts             # Wrapper expo-alarm-module (com fallback graceful)
│   ├── notifications-utils.ts              # Canais e permissões de notificação
│   ├── device-id.ts                        # Device ID persistente via AsyncStorage
│   ├── supabase.ts                         # Cliente Supabase (lazy init)
│   ├── supabase-sync.ts                    # syncUser, syncAlarms, syncContacts, sendHeartbeat
│   ├── pdf-utils-v2.ts                     # Geração de PDF da Anamnese
│   ├── theme-provider.tsx                  # Provider de tema (light/dark)
│   ├── font-size-context.tsx               # Context de tamanho de fonte
│   ├── accessibility-context.tsx           # Context de modo acessibilidade
│   ├── menu-context.tsx                    # Context de menu lateral
│   └── trpc.ts                             # Cliente tRPC
├── server/
│   ├── push-notifications.ts               # Expo Push API wrapper (lotes de 100)
│   ├── routers-caregiver.ts                # Router tRPC: 8 rotas do sistema de cuidadores
│   ├── monitoring-job.ts                   # Job: detecta alarmes perdidos + notifica cuidadores
│   ├── routers.ts                          # Router principal (monitoring + caregiver + webhooks)
│   └── _core/                             # Infraestrutura do servidor
├── widgets/                                # Widgets Android (temporariamente desabilitados)
│   ├── widget-task-handler.tsx             # Handler: lê AsyncStorage e renderiza widgets
│   ├── NextAlarmWidget.tsx                 # Widget: próximo alarme
│   ├── SosWidget.tsx                       # Widget: botão SOS
│   └── HealthWidget.tsx                    # Widget: métricas de saúde
├── modules/
│   └── expo-alarm-countdown/               # Módulo nativo local
│       ├── android/                        # Kotlin: atualiza notificação com countdown
│       ├── src/index.ts                    # JS: wrapper NativeModules
│       └── app.plugin.js                   # Plugin: adiciona ao Gradle
├── plugins/
│   └── crash-reporter.js                   # Plugin: injeta UncaughtExceptionHandler + AlertDialog
├── .github/
│   └── workflows/
│       └── eas-build.yml                   # CI/CD: build APK via EAS Build
├── supabase/
│   ├── schema.sql                          # Schema SQL (tabelas, RLS, índices, cron)
│   └── functions/check-missed-alarms/     # Edge Function dead man's switch
├── tests/
│   ├── purchases_isolated.test.ts          # 35 testes RevenueCat
│   └── supabase-credentials.test.ts        # 3 testes de credenciais Supabase
├── app.config.ts                           # Expo config (newArchEnabled, widgets, crash reporter)
├── eas.json                                # EAS Build profiles
├── package.json                            # expo.autolinking.exclude para módulos incompatíveis
└── vitest.config.ts                        # Vitest com alias @, JSX, __DEV__
```

---

## Padrões de Design

### 1. Context API + useReducer (Global State)

O estado global é gerenciado através do **AppContext** com `useReducer`. Ao iniciar, o contexto carrega o estado do AsyncStorage e dispara a sincronização com o servidor de monitoramento.

### 2. Raw Fetch para tRPC (Serviços do Servidor)

Os serviços que chamam o servidor (monitoramento, cuidadores) usam raw fetch com o protocolo superjson do tRPC, sem depender do client tRPC React (que requer hooks):

```typescript
// Padrão usado em monitoring-service.ts, caregiver-context.tsx e settings.tsx
async function caregiverMutation(procedure: string, input: unknown) {
  const apiBase = getApiBaseUrl();
  const res = await fetch(`${apiBase}/trpc/${procedure}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ json: input }),
  });
  const data = await res.json();
  return data.result?.data?.json;
}
```

### 3. Sistema de Cuidadores

Fluxo de vinculação e notificação:

```
Usuário Monitorado                    Cuidador
       │                                 │
       │── caregiver.generateCode() ──►  │
       │   (código 6 dígitos, 24h)       │
       │                                 │── caregiver.linkWithCode(código)
       │                                 │   (vincula + retorna perfil)
       │                                 │
       │                                 │── caregiver.registerPushToken(token)
       │                                 │   (token salvo no servidor)
       │
  Alarme não respondido
       │
  monitoring-job.ts detecta
       │── getCaregiverPushTokens(userId)
       │── notifyCaregiversMissedAlarm(tokens, ...)
            │── Expo Push API (lotes de 100)
                 │── Push notification no celular do cuidador
```

### 4. Crash Reporter Nativo

O plugin `plugins/crash-reporter.js` injeta código em dois pontos:

1. **`MainApplication.onCreate()`**: Instala `Thread.setDefaultUncaughtExceptionHandler` que escreve o stack trace em `{filesDir}/crash_report.txt` antes do processo morrer.

2. **`MainActivity.onCreate()`** (antes de `super.onCreate()`): Lê o arquivo da sessão anterior e mostra um `AlertDialog` nativo com o stack trace. Funciona mesmo quando o crash acontece antes do JavaScript carregar.

### 5. Compatibilidade New Architecture

O app usa `newArchEnabled: true` (obrigatório pelo `react-native-worklets`). Para módulos nativos incompatíveis, a estratégia é:

```json
// package.json
"expo": {
  "autolinking": {
    "exclude": ["expo-alarm-module", "react-native-android-widget"]
  }
}
```

Módulos excluídos do auto-linking não são compilados no APK. O código JavaScript já tem `try/catch` com fallback graceful em `native-alarm-manager.ts`.

### 6. Sincronização de Alarmes (Fallback Android)

Com a exclusão do `expo-alarm-module` (incompatível com New Arch), Android agora usa `expo-notifications` como caminho principal:

```typescript
// lib/native-alarm-manager.ts
if (Platform.OS === 'android') {
  try {
    const mod = require('expo-alarm-module'); // Lança erro (excluído do build)
    scheduleAlarmNative = mod.scheduleAlarm;
  } catch (e) {
    console.warn('[NativeAlarm] expo-alarm-module not available:', e);
    // Fallback: expo-notifications é usado pelo alarm-sync.ts
  }
}
```

### 7. Dead Man's Switch (Supabase)

```
1. App sincroniza alarmes com Supabase ao iniciar
   ↓
2. Quando alarme dispara, cria alarm_event no Supabase
   ↓
3. Usuário confirma → alarm_event.response_type = 'dismissed'
   ↓
4. Se não confirmado em 5 min → pg_cron chama check-missed-alarms
   ↓
5. Edge Function detecta evento sem resposta
   ↓
6. Envia WhatsApp para contatos de emergência via Meta Graph API
   ↓
7. monitoring-job.ts (servidor principal) notifica cuidadores via push notification
```

---

## Módulos Nativos: Estado e Compatibilidade

Com o React Native 0.81 e New Architecture obrigatória (`newArchEnabled: true`), a compatibilidade de módulos nativos é crítica:

| Módulo | Arch | Status | Detalhe |
|---|---|---|---|
| `react-native-worklets` 0.5.1 | New Arch only | ✅ OK | Requer `newArchEnabled: true`; causa build failure se false |
| `react-native-reanimated` 4.1.6 | New Arch | ✅ OK | Depende de worklets |
| `react-native-purchases` 10.x | New + Old | ✅ OK | RevenueCat com suporte pleno |
| `expo-alarm-module` 1.2.0 | Old Arch | ❌ Excluído | Desenvolvido para RN 0.73, crash nativo no RN 0.81 |
| `react-native-android-widget` 0.20.1 | Parcial | ⚠️ Desabilitado | 0.16.0+ alega suporte; em diagnóstico |
| `expo-alarm-countdown` (local) | Old Arch | ⚠️ Compilado | Não auto-linked; não é registrado pelo RN |

**Regra:** Qualquer novo módulo nativo deve ser verificado para suporte a New Architecture antes de ser adicionado.

---

## CI/CD: EAS Build via GitHub Actions

O build é feito na nuvem via EAS Build, acionado pelo GitHub Actions (sem necessidade de PC local):

```yaml
# .github/workflows/eas-build.yml
on:
  workflow_dispatch:
    inputs:
      profile: [preview, development]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - checkout, setup-node@22, npm install -g pnpm@9.12.0
      - pnpm install --frozen-lockfile
      - npm install -g eas-cli
      - eas build --profile preview --platform android --non-interactive
```

**Pré-requisito:** `EXPO_TOKEN` configurado como GitHub Secret.

---

## Estratégia de Testes

### Testes Automatizados (Vitest)

**38 testes no total:**

| Arquivo | Testes | Cobertura |
|---|---|---|
| `tests/purchases_isolated.test.ts` | 35 | RevenueCat SDK completo |
| `tests/supabase-credentials.test.ts` | 3 | Credenciais e conectividade Supabase |

### Testes Manuais

Validação em dispositivos reais para:
- Notificações de alarme em background (Android e iOS)
- Escalação WhatsApp com localização GPS
- Fluxo de compra com conta Sandbox
- Sistema de cuidadores (vinculação + push notification)
- Dead man's switch (Supabase Edge Function)

---

## Segurança

### Variáveis de Ambiente

| Variável | Escopo | Propósito |
|---|---|---|
| `EXPO_PUBLIC_REVENUECAT_API_KEY` | Cliente (público) | API key RevenueCat |
| `EXPO_PUBLIC_SUPABASE_URL` | Cliente (público) | URL do projeto Supabase |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Cliente (público) | Chave anônima Supabase |
| `EXPO_TOKEN` | CI/CD (GitHub Secret) | Autenticação EAS Build |
| `RESEND_API_KEY` | Servidor (privado) | Email de alertas |
| `TWILIO_ACCOUNT_SID` | Servidor (privado) | SMS de alertas |

### Dados de Saúde

Dados de saúde (métricas, anamnese) são armazenados **exclusivamente no AsyncStorage local** do dispositivo. A sincronização com o Supabase é limitada a dados operacionais (alarmes, heartbeat, contatos de emergência). Push tokens dos cuidadores são armazenados no servidor principal (PostgreSQL).

---

## Roadmap Técnico

| Versão | Funcionalidade | Status |
|---|---|---|
| v1.0 | MVP com alarmes, contatos, saúde | ✅ Concluído |
| v1.1 | RevenueCat monetização + paywall nativo | ✅ Concluído |
| v1.2 | Upsell contextual + ProGate | ✅ Concluído |
| v1.3 | Supabase dead man's switch + trial de 7 dias | ✅ Concluído |
| v1.4 | Bugfix notificações duplicadas Android | ✅ Concluído |
| v1.5 | Sistema de Cuidadores + Push Notifications | ✅ Concluído |
| v1.6 | EAS Build via GitHub Actions + Crash Reporter Nativo | ✅ Concluído |
| v1.7 | Restaurar Widgets Android (após resolver compatibilidade) | 🔄 Em andamento |
| v2.0 | Integração com wearables (Apple Watch, Wear OS) | Q3 2026 |
| v2.1 | Notificações push personalizadas (saúde) | Q4 2026 |
| v3.0 | IA para recomendações de saúde | Q1 2027 |
