# Arquitetura Técnica — Vigora Saúde

Este documento descreve a arquitetura técnica, stack de tecnologias, padrões de design e decisões arquiteturais do Vigora Saúde. **Este arquivo deve ser atualizado sempre que houver mudanças significativas na arquitetura, dependências ou padrões do projeto.**

---

## Visão Geral da Arquitetura

O Vigora Saúde segue uma arquitetura **mobile-first com um backend próprio único**: o servidor Node.js + tRPC hospedado no Railway cuida de autenticação, cloud backup, dead man's switch e envio de alertas. A aplicação funciona completamente offline, com sincronização opcional para o backend quando o usuário está autenticado.

```
┌─────────────────────────────────────────────────────────────────┐
│                      Camada de Apresentação                     │
│  (React Native + Expo Router + NativeWind + Reanimated)         │
│  Rotas: (tabs)/ · (caregiver-tabs)/ · alarm-ring · login        │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│                   Camada de Lógica de Negócio                   │
│  Context API + Custom Hooks + RevenueCat SDK                     │
│  AppContext · CaregiverContext · PurchasesContext                │
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
| Expo | 54.0.29 | Managed workflow |
| Expo Router | 6.0.19 | Navegação file-based |
| TypeScript | 5.9.3 | Type safety |
| NativeWind | 4.2.1 | Tailwind CSS para RN |
| React Native Reanimated | 4.1.6 | Animações performáticas |
| React Native Gesture Handler | 2.28.0 | Gestos customizados |
| React Native Safe Area Context | 5.6.2 | SafeArea handling |
| TanStack Query | 5.90.12 | Server state management |

### Backend Principal (Node.js + Express — Railway)

| Tecnologia | Versão | Propósito |
|---|---|---|
| Node.js | 22.13.0 | Runtime |
| Express | 4.22.1 | HTTP server |
| tRPC | 11.7.2 | Type-safe API |
| Drizzle ORM | 0.44.7 | Database ORM |
| MySQL | 8+ | Database (plugin Railway) |
| Zod | 4.2.1 | Schema validation |

**Routers tRPC:**

| Router | Procedimentos | Propósito |
|---|---|---|
| `auth` | `completeRegistration`, `updateProfile`, `me`, `logout` | Autenticação e perfil |
| `userData` | `get`, `put` | Cloud backup por conta |
| `monitoring` | `register`, `heartbeat`, `syncAlarms`, `createEvent`, `confirmEvent`, `getHistory` | Registro de device e eventos de alarme |
| `link` | convites (código/QR/link), `getMonitoredAlerts` | Vínculo monitorado↔cuidador |
| `push` | `register` | Registro do token de push (Expo) do cuidador |
| `whatsapp` | `sendEmergencyAlert`, `isConfigured` | Alertas via WhatsApp |
| `system` | health check | Status do servidor |

### Dead Man's Switch (Railway)

| Tecnologia | Propósito |
|---|---|
| `monitoring-job.ts` | Job em processo (`setInterval` 5 min) que detecta alarmes/check-ins não respondidos |
| MySQL (Drizzle) | Banco de dados para dispositivos, alarmes, eventos e avisos |
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
| expo-notifications | 0.32.15 | Notificações nativas (iOS e Web) |
| expo-secure-store | latest | Armazenamento seguro de tokens JWT |
| expo-location | 16.x | Geolocalização |
| expo-contacts | 14.x | Acesso a contatos do dispositivo |
| expo-file-system | 16.x | Acesso a arquivos |
| expo-sharing | 13.x | Compartilhamento de arquivos |
| expo-haptics | 15.0.8 | Feedback háptico |
| @react-native-async-storage/async-storage | 2.2.0 | Persistência local |
| expo-auth-session | latest | OAuth PKCE direto com o Google |

### Ferramentas de Desenvolvimento

| Ferramenta | Versão | Propósito |
|---|---|---|
| Vitest | 2.1.9 | Testing framework |
| EAS CLI | 18.8.1 | Build e deployment |
| Prettier | 3.7.4 | Code formatting |
| ESLint | 9.39.2 | Linting |

---

## Estrutura de Pastas

```
vigora-saude/
├── app/                              # Expo Router (file-based routing)
│   ├── _layout.tsx                   # Root layout — 8 providers empilhados
│   ├── login.tsx                     # Tela de login (OAuth Google/Apple ou email)
│   ├── register.tsx                  # Tela de cadastro com seleção de tipo de usuário
│   ├── onboarding.tsx                # Onboarding inicial do usuário monitorado
│   ├── caregiver-onboarding.tsx      # Onboarding inicial do cuidador
│   ├── alarm-ring.tsx                # Tela fullscreen de alarme disparado
│   ├── oauth/
│   │   └── callback.tsx              # Callback de OAuth (troca code → JWT, roteamento pós-login)
│   ├── (tabs)/
│   │   ├── index.tsx                 # Dashboard (TrialBanner, ExpiredBanner)
│   │   ├── alarms.tsx                # Alarmes (limite 5 gratuito)
│   │   ├── health.tsx                # Saúde (métricas)
│   │   ├── contacts.tsx              # Contatos (limite 3 gratuito)
│   │   ├── anamnesis.tsx             # Anamnese (PDF bloqueado no gratuito)
│   │   ├── ambulance.tsx             # Ambulância
│   │   ├── location.tsx              # Localização GPS
│   │   ├── profile.tsx               # Perfil do usuário (nome, data nasc., tipo sanguíneo)
│   │   ├── help.tsx                  # Ajuda e suporte
│   │   └── settings.tsx              # Configurações (MonitoringPanel, card Pro)
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
│   ├── pro-gate.tsx                  # ProGate, ProBanner, ProLimitBadge, FREE_LIMITS
│   ├── pro-upsell-modal.tsx          # Modal de upsell contextual (bottom sheet)
│   ├── trial-banner.tsx              # TrialBanner (azul) e ExpiredBanner (vermelho)
│   ├── alarm-card.tsx                # Card de alarme reutilizável
│   ├── contact-card.tsx              # Card de contato reutilizável
│   ├── monitoring-status-panel.tsx   # Painel de status de monitoramento
│   ├── caregiver-tab-bar.tsx         # Tab bar customizada para a seção de cuidador
│   ├── caregiver-empty-state.tsx     # Placeholder "aguardando vínculo"
│   ├── onboarding-gate.tsx           # Proteção de rota: redireciona para onboarding se necessário
│   ├── alarm-notification-handler.tsx # Handler de notificações de alarme em foreground
│   ├── alarm-sync-initializer.tsx    # Inicializa sincronização de alarmes ao montar
│   ├── monitoring-initializer.tsx    # Inicializa serviço de monitoramento contínuo
│   ├── sidebar-menu.tsx              # Menu lateral deslizante
│   └── ui/
│       └── icon-symbol.tsx           # Mapeamento SF Symbols → Material Icons
├── context/
│   └── purchases-context.tsx         # PurchasesProvider (isPro, isTrialActive, trialDaysLeft)
├── hooks/
│   ├── use-purchases.ts              # Hook usePurchases()
│   ├── use-colors.ts                 # Hook para cores do tema
│   └── use-color-scheme.ts           # Detecção light/dark mode
├── lib/
│   ├── _core/                        # Utilitários centrais (sem dependências de UI)
│   │   ├── auth.ts                   # getSessionToken, setSessionToken, getUserInfo (SecureStore/localStorage)
│   │   ├── api.ts                    # Configuração base do cliente HTTP
│   │   ├── theme.ts                  # Tokens de tema (cores, tipografia)
│   │   └── nativewind-pressable.ts   # Patch de compatibilidade NativeWind/Pressable
│   ├── app-context.tsx               # Global state + cloud sync integrado (pull/push)
│   ├── caregiver-context.tsx         # CaregiverProvider — estado e persistência AsyncStorage
│   ├── caregiver-state.ts            # Tipos + reducer puro do estado do cuidador (unit-testável)
│   ├── cloud-sync.ts                 # pullCloudData / pushCloudData via userData tRPC router
│   ├── purchases.ts                  # RevenueCat SDK (inicialização, entitlement)
│   ├── device-id.ts                  # Device ID persistente via AsyncStorage
│   ├── push-registration.ts          # Resolve o token de push (Expo) do dispositivo
│   ├── alarm-sync.ts                 # Sincronização de alarmes (Android: nativo; iOS: expo-notifications)
│   ├── native-alarm-manager.ts       # AlarmManager nativo Android
│   ├── alarm-timer-store.ts          # Persistência do timer de alarme para cold-start
│   ├── alarm-escalation.ts           # Lógica de escalação para WhatsApp
│   ├── pdf-utils-v2.ts               # Geração de PDF da Anamnese
│   ├── font-size-context.tsx         # Context de tamanho de fonte
│   ├── accessibility-context.tsx     # Context de modo acessibilidade
│   ├── notifications-context.tsx     # Context de notificações
│   ├── menu-context.tsx              # Context do menu lateral
│   ├── theme-provider.tsx            # ThemeProvider global
│   └── monitoring-service.ts         # Serviço de monitoramento contínuo (tRPC)
├── server/                           # Backend Node.js (hospedado no Railway)
│   ├── _core/
│   │   ├── auth.ts / oauth.ts        # OAuth PKCE + verificação de JWT
│   │   ├── trpc.ts                   # publicProcedure / protectedProcedure
│   │   ├── context.ts                # Contexto tRPC por request
│   │   ├── cookies.ts                # Gerenciamento de cookies de sessão
│   │   ├── rate-limit.ts             # Rate limiting por rota
│   │   ├── security-headers.ts       # Headers de segurança HTTP
│   │   └── env.ts                    # Validação de variáveis de ambiente
│   ├── routers.ts                    # Router principal (auth, userData, monitoring, link, push, whatsapp)
│   ├── routers-monitoring.ts         # Sub-router de monitoramento e alertas
│   ├── routers-links.ts              # Vínculo monitorado↔cuidador (link.*)
│   ├── routers-push.ts               # Registro de push token (push.register)
│   ├── monitoring-job.ts             # Dead man's switch em processo (setInterval 5 min)
│   ├── db.ts                         # Queries Drizzle (getUserByOpenId, upsertUserData, etc.)
│   ├── db-monitoring.ts / db-links.ts / db-push.ts  # Queries de monitoramento, vínculo e push
│   ├── google-auth.ts                # Verifica id_token do Google → JWT próprio
│   ├── whatsapp.ts                   # Alertas a contatos via Meta Graph API
│   └── push.ts                       # Push (Expo) para cuidadores vinculados
├── tests/                            # Suíte Vitest
│   ├── purchases_isolated.test.ts    # RevenueCat SDK
│   ├── push.test.ts                  # Sender de push (Expo): batching + poda de token
│   ├── caregiver-state.test.ts       # Reducer do estado do cuidador (6 testes)
│   ├── rate-limit.test.ts            # Rate limiting do servidor
│   ├── security-headers.test.ts      # Headers de segurança
│   ├── cors.test.ts                  # CORS policy
│   ├── auth.logout.test.ts           # Fluxo de logout
│   ├── session-revocation.test.ts    # Revogação de sessão
│   └── ... (12 outros arquivos)
├── docs/
│   ├── ARCHITECTURE.md               # Este arquivo
│   ├── BUILD_GUIDE.md                # Build e publicação nas lojas
│   ├── REVENUECAT_SETUP.md           # Configuração do painel RevenueCat
│   └── DEVELOPMENT_PROCESS.md        # Cronograma e decisões de desenvolvimento
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

O sistema de autenticação usa OAuth (Google/Apple) e email/senha. Após login, o servidor emite um JWT armazenado pelo app:

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

### 6. Componentes de Gate (ProGate, ProBanner, ProLimitBadge)

```typescript
// components/pro-gate.tsx
export const FREE_LIMITS = {
  contacts: 3,
  alarms: 5,
};
```

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
1. App sincroniza alarmes com o backend (monitoring.syncAlarms) e envia heartbeat
   ↓
2. Quando um alarme dispara, cria alarm_event (status 'pending')
   ↓
3. Usuário confirma → alarm_event.status = 'responded'
   ↓
4. Se não confirmado → monitoring-job.ts (setInterval 5 min) detecta o evento expirado
   ↓
5. Marca como 'missed' (device online) ou 'not_sent' (device offline)
   ↓
6. Avisa contatos de emergência por WhatsApp (Meta Graph API) E
   envia push (Expo) aos cuidadores vinculados — destinatários independentes
```

---

## Providers no Root Layout

O root layout monta 8 providers em ordem específica:

```tsx
<PurchasesProvider>          // RevenueCat (monetização)
  <NotificationsProvider>    // Permissões e canais de notificação
    <CaregiverProvider>      // Estado do cuidador (AsyncStorage)
      <AppProvider>          // Estado global do app + cloud sync
        <FontSizeProvider>   // Preferência de tamanho de fonte
          <AccessibilityProvider>  // Modo de acessibilidade
            <MonitoringInitializer />  // Serviço de monitoramento tRPC
            <MenuProvider>   // Menu lateral
              <trpc.Provider>
                <Stack>...</Stack>
              </trpc.Provider>
            </MenuProvider>
          </AccessibilityProvider>
        </FontSizeProvider>
      </AppProvider>
    </CaregiverProvider>
  </NotificationsProvider>
</PurchasesProvider>
```

---

## Fluxo de Dados

### Fluxo de Autenticação (OAuth)

```
1. Usuário toca "Entrar com Google"
   ↓
2. App abre WebBrowser com URL de autorização OAuth (PKCE)
   ↓
3. Provedor redireciona para vigora://oauth/callback?code=...
   ↓
4. app/oauth/callback.tsx troca code por JWT no servidor
   ↓
5. JWT armazenado em SecureStore (nativo) ou cookie (web)
   ↓
6. getUserInfo() retorna User com userType
   ↓
7. userType === 'caregiver' → router.replace('/(caregiver-tabs)')
   userType === 'monitored' → router.replace('/(tabs)')
```

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
1. Usuário tenta usar recurso bloqueado
   ↓
2. ProUpsellModal é exibido (bottom sheet animado)
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

Suíte Vitest cobrindo frontend e backend:

| Área | Arquivos de Teste |
|---|---|
| RevenueCat / Monetização | `purchases_isolated.test.ts`, `purchases.test.ts`, `revenuecat-*.test.ts` |
| Notificações / Push | `push.test.ts` (sender Expo: batching, poda de token morto) |
| Caregiver | `caregiver-state.test.ts` (6 testes do reducer) |
| Segurança (servidor) | `rate-limit.test.ts`, `security-headers.test.ts`, `cors.test.ts` |
| Auth | `auth.logout.test.ts`, `session-revocation.test.ts`, `monitoring.auth.test.ts` |
| Outros | `pdf-escape.test.ts`, `location-privacy.test.ts`, `id-entropy.test.ts` |

**Configuração (`vitest.config.ts`):**
- Alias `@` → raiz do projeto
- Suporte a JSX com `@vitejs/plugin-react`
- Define `__DEV__ = true` para compatibilidade com React Native

---

## Segurança

### Variáveis de Ambiente

| Variável | Escopo | Propósito |
|---|---|---|
| `EXPO_PUBLIC_REVENUECAT_API_KEY` | Cliente (público) | API key RevenueCat |
| `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` / `_IOS_` / `_WEB_` | Cliente (público) | OAuth Google — Client IDs |
| `EXPO_PUBLIC_API_BASE_URL` | Cliente (público) | URL do servidor Railway |
| `JWT_SECRET` | Servidor (privado) | Assinatura de tokens JWT |
| `WHATSAPP_API_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID` | Servidor (privado) | Meta Graph API (WhatsApp) — alertas a contatos |

### Armazenamento de Tokens

- **Nativo (iOS/Android):** JWT armazenado em `expo-secure-store` (keychain / Android Keystore)
- **Web:** Cookie `httpOnly; Secure; SameSite=Strict` emitido pelo servidor — sem acesso via JavaScript

### Dados de Saúde

Dados de saúde (métricas, anamnese) são armazenados no **AsyncStorage local** e no cloud backup do servidor próprio (Railway), protegido por autenticação JWT. Nenhum dado de saúde é enviado a serviços de terceiros: o backend único no Railway concentra autenticação, backup e o dead man's switch (alarmes, heartbeat, contatos de emergência).

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
| v2.0 | Integração com wearables (Apple Watch, Wear OS) | Q3 2026 |
| v2.1 | Notificações push personalizadas (saúde) | Q4 2026 |
| v3.0 | IA para recomendações de saúde | Q1 2027 |

---

## Conclusão

A arquitetura do Vigora Saúde foi projetada para ser **simples, resiliente e segura**. O uso de Expo, Context API e AsyncStorage permite funcionamento completo offline. A autenticação por conta (OAuth + JWT) habilita cloud backup automático, permitindo que o usuário reinstale o app e recupere todos os dados. O backend único no Railway concentra o dead man's switch (job em processo), os alertas por WhatsApp e o push aos cuidadores. O RevenueCat gerencia toda a complexidade de monetização cross-platform. O sistema de dois tipos de usuário (`monitored` / `caregiver`) com layouts completamente distintos cobre o caso de uso de monitoramento remoto de pessoas dependentes.
