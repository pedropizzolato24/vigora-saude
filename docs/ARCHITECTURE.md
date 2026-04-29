# Arquitetura Técnica — Vigora Saúde

Este documento descreve a arquitetura técnica, stack de tecnologias, padrões de design e decisões arquiteturais do Vigora Saúde. **Este arquivo deve ser atualizado sempre que houver mudanças significativas na arquitetura, dependências ou padrões do projeto.**

---

## Visão Geral da Arquitetura

O Vigora Saúde segue uma arquitetura **mobile-first com dois backends complementares**: o servidor principal (Node.js + tRPC) para monitoramento em tempo real e alertas de emergência, e o Supabase para o dead man's switch. A aplicação funciona completamente offline, com sincronização opcional para os backends.

```
┌─────────────────────────────────────────────────────────────────┐
│                      Camada de Apresentação                     │
│   (React Native + Expo Router + NativeWind + Reanimated)        │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│                   Camada de Lógica de Negócio                   │
│   (Context API + Custom Hooks + RevenueCat SDK + Supabase SDK)  │
└──────────────────────────┬──────────────────────────────────────┘
                           │
          ┌────────────────┴────────────────┐
          │                                 │
┌─────────▼──────────┐           ┌──────────▼──────────┐
│  AsyncStorage Local │           │  Backends Remotos   │
│  (dados de saúde,  │           │  - Node.js + tRPC   │
│   alarmes, perfil) │           │  - Supabase (DMS)   │
└────────────────────┘           └─────────────────────┘
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

### Backend Principal (Node.js + Express)

| Tecnologia | Versão | Propósito |
|---|---|---|
| Node.js | 22.13.0 | Runtime |
| Express | 4.22.1 | HTTP server |
| tRPC | 11.7.2 | Type-safe API |
| Drizzle ORM | 0.44.7 | Database ORM |
| PostgreSQL | 15+ | Database |
| Zod | 4.2.1 | Schema validation |

### Dead Man's Switch (Supabase)

| Tecnologia | Propósito |
|---|---|
| Supabase (PostgreSQL) | Banco de dados para alarmes, usuários e eventos |
| Supabase Edge Functions (Deno) | `check-missed-alarms` — verifica alarmes não respondidos |
| pg_cron | Agendamento da Edge Function a cada 2 minutos |
| Meta Graph API (WhatsApp) | Envio de alertas para contatos de emergência |

### Monetização

| Pacote | Versão | Propósito |
|---|---|---|
| react-native-purchases | 10.0.1 | RevenueCat SDK — compras e assinaturas |
| react-native-purchases-ui | 10.0.1 | RevenueCat UI — paywall e Customer Center nativos |

### Dependências Críticas

| Pacote | Versão | Propósito |
|---|---|---|
| expo-notifications | 0.32.15 | Notificações nativas (iOS e Web) |
| expo-location | 16.x | Geolocalização |
| expo-contacts | 14.x | Acesso a contatos do dispositivo |
| expo-file-system | 16.x | Acesso a arquivos |
| expo-sharing | 13.x | Compartilhamento de arquivos |
| expo-haptics | 15.0.8 | Feedback háptico |
| @react-native-async-storage/async-storage | 2.2.0 | Persistência local |
| @supabase/supabase-js | latest | Cliente Supabase |

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
│   ├── _layout.tsx                   # Root layout com PurchasesProvider
│   ├── (tabs)/
│   │   ├── index.tsx                 # Dashboard (TrialBanner, ExpiredBanner)
│   │   ├── alarms.tsx                # Alarmes (limite 5 gratuito)
│   │   ├── health.tsx                # Saúde (métricas)
│   │   ├── contacts.tsx              # Contatos (limite 3 gratuito)
│   │   ├── anamnesis.tsx             # Anamnese (PDF bloqueado no gratuito)
│   │   ├── ambulance.tsx             # Ambulância
│   │   ├── location.tsx              # Localização GPS
│   │   └── settings.tsx              # Configurações (MonitoringPanel, card Pro)
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
│   └── ui/
│       └── icon-symbol.tsx           # Mapeamento SF Symbols → Material Icons
├── context/
│   └── purchases-context.tsx         # PurchasesProvider (isPro, isTrialActive, trialDaysLeft)
├── hooks/
│   ├── use-purchases.ts              # Hook usePurchases()
│   ├── use-colors.ts                 # Hook para cores do tema
│   └── use-color-scheme.ts           # Detecção light/dark mode
├── lib/
│   ├── app-context.tsx               # Global state + Supabase sync integrado
│   ├── purchases.ts                  # RevenueCat SDK (inicialização, entitlement)
│   ├── supabase.ts                   # Cliente Supabase (lazy init, isSupabaseConfigured)
│   ├── device-id.ts                  # Device ID persistente via AsyncStorage
│   ├── supabase-sync.ts              # syncUser, syncAlarms, syncContacts, sendHeartbeat
│   ├── alarm-sync.ts                 # Sincronização de alarmes (Android: nativo; iOS: expo-notifications)
│   ├── native-alarm-manager.ts       # AlarmManager nativo Android
│   ├── pdf-utils-v2.ts               # Geração de PDF da Anamnese
│   ├── font-size-context.tsx         # Context de tamanho de fonte
│   ├── accessibility-context.tsx     # Context de modo acessibilidade
│   └── monitoring-service.ts         # Serviço de monitoramento contínuo (tRPC)
├── supabase/
│   ├── schema.sql                    # Schema SQL (tabelas, RLS, índices, cron)
│   └── functions/
│       └── check-missed-alarms/
│           └── index.ts              # Edge Function dead man's switch
├── tests/
│   ├── purchases_isolated.test.ts    # 35 testes RevenueCat
│   └── supabase-credentials.test.ts  # 3 testes de credenciais Supabase
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

### 1. Context API + useReducer (Global State)

O estado global é gerenciado através do **AppContext** com `useReducer`. Ao iniciar, o contexto carrega o estado do AsyncStorage e dispara a sincronização com o Supabase:

```typescript
// lib/app-context.tsx
useEffect(() => {
  if (isSupabaseConfigured()) {
    syncUser(deviceId, userProfile.name);
    syncAlarms(deviceId, state.alarms);
    syncEmergencyContacts(deviceId, state.contacts);
  }
}, [state.alarms, state.contacts]);
```

### 2. RevenueCat SDK — Inicialização e Contexto

O RevenueCat SDK é inicializado no root layout e exposto via `PurchasesContext`. O contexto expõe `isPro`, `isTrialActive` e `trialDaysLeft`:

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
      // Calcula dias restantes do trial
    });
  }, []);
}
```

### 3. Componentes de Gate (ProGate, ProBanner, ProLimitBadge)

Componentes reutilizáveis para bloquear recursos no plano gratuito:

```typescript
// components/pro-gate.tsx
export const FREE_LIMITS = {
  contacts: 3,
  alarms: 5,
};

export function ProLimitBadge({ current, limit, feature }) {
  const { isPro } = usePurchases();
  if (isPro || current < limit) return null;
  return <Badge text={`${current}/${limit} — Vigora Pro`} />;
}
```

### 4. Trial Banner

O `TrialBanner` e o `ExpiredBanner` são exibidos no Dashboard com base no estado do `PurchasesContext`:

```typescript
// components/trial-banner.tsx
export function TrialBanner({ daysLeft }) {
  return (
    <View className="bg-blue-500 rounded-xl p-3">
      <Text>Trial ativo — {daysLeft} dias restantes</Text>
    </View>
  );
}

export function ExpiredBanner({ onPress }) {
  return (
    <Pressable className="bg-red-500 rounded-xl p-3" onPress={onPress}>
      <Text>Seu trial expirou — Assine o Vigora Pro</Text>
    </Pressable>
  );
}
```

### 5. Sincronização de Alarmes (Bugfix Android)

O sistema de alarmes usa estratégia diferente por plataforma para evitar notificações duplicadas:

```typescript
// lib/alarm-sync.ts
export async function scheduleFullAlarm(alarm: Alarm) {
  if (Platform.OS === 'android' && isNativeAlarmAvailable()) {
    // Android: usa AlarmManager nativo EXCLUSIVAMENTE
    await NativeAlarmManager.scheduleAlarm(alarm);
  } else {
    // iOS e Web: usa expo-notifications
    await scheduleAlarmNotification(alarm);
  }
}
```

**Problema resolvido:** Antes do bugfix, o Android agendava o alarme tanto via AlarmManager nativo quanto via expo-notifications, causando notificações duplicadas. Após o fix, apenas o AlarmManager nativo é usado no Android.

### 6. Dead Man's Switch (Supabase)

O fluxo completo do dead man's switch:

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
7. alarm_event.response_type = 'missed'
```

---

## Fluxo de Dados

### Fluxo de Compra (RevenueCat)

```
1. Usuário tenta usar recurso bloqueado
   ↓
2. ProUpsellModal é exibido (bottom sheet animado)
   ↓
3. Usuário clica "Assinar Pro" → Paywall nativo abre
   ↓
4. Usuário seleciona plano e confirma compra
   ↓
5. RevenueCat SDK processa transação
   ↓
6. CustomerInfoUpdateListener é disparado
   ↓
7. isPro = true, isTrialActive = false, UI atualiza
```

### Fluxo de Sincronização Supabase

```
1. App inicia → getOrCreateDeviceId()
   ↓
2. syncUser(deviceId, name) → upsert na tabela users
   ↓
3. syncAlarms(deviceId, alarms) → upsert + delete na tabela alarms
   ↓
4. syncEmergencyContacts(deviceId, contacts) → replace na tabela emergency_contacts
   ↓
5. sendHeartbeat(deviceId) → atualiza users.last_seen_at
   ↓
6. A cada alarme disparado → createAlarmEvent(alarmId)
   ↓
7. A cada confirmação → respondToAlarmEvent(eventId, 'dismissed')
```

---

## Estratégia de Testes

### Testes Automatizados (Vitest)

**38 testes no total:**

| Arquivo | Testes | Cobertura |
|---|---|---|
| `tests/purchases_isolated.test.ts` | 35 | RevenueCat SDK completo |
| `tests/supabase-credentials.test.ts` | 3 | Credenciais e conectividade Supabase |

**Configuração (`vitest.config.ts`):**
- Alias `@` → raiz do projeto
- Suporte a JSX com `@vitejs/plugin-react`
- Define `__DEV__ = true` para compatibilidade com React Native

### Testes Manuais

Validação em dispositivos reais para:
- Notificações de alarme em background (Android e iOS)
- Escalação WhatsApp com localização GPS
- Fluxo de compra com conta Sandbox
- Dead man's switch (Supabase Edge Function)

---

## Segurança

### Variáveis de Ambiente

Todos os secrets são armazenados como variáveis de ambiente, nunca hardcoded:

| Variável | Escopo | Propósito |
|---|---|---|
| `EXPO_PUBLIC_REVENUECAT_API_KEY` | Cliente (público) | API key RevenueCat |
| `EXPO_PUBLIC_SUPABASE_URL` | Cliente (público) | URL do projeto Supabase |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Cliente (público) | Chave anônima Supabase |
| `RESEND_API_KEY` | Servidor (privado) | Email de alertas |
| `TWILIO_ACCOUNT_SID` | Servidor (privado) | SMS de alertas |
| `TWILIO_AUTH_TOKEN` | Servidor (privado) | Autenticação Twilio |

### Dados de Saúde

Dados de saúde (métricas, anamnese) são armazenados **exclusivamente no AsyncStorage local** do dispositivo. Nenhum dado médico é enviado para servidores externos. A sincronização com o Supabase é limitada a dados operacionais (alarmes, heartbeat, contatos de emergência).

---

## Roadmap Técnico

| Versão | Funcionalidade | Status |
|---|---|---|
| v1.0 | MVP com alarmes, contatos, saúde | ✅ Concluído |
| v1.1 | RevenueCat monetização + paywall nativo | ✅ Concluído |
| v1.2 | Upsell contextual + ProGate | ✅ Concluído |
| v1.3 | Supabase dead man's switch + trial de 7 dias | ✅ Concluído |
| v1.4 | Bugfix notificações duplicadas Android | ✅ Concluído |
| v2.0 | Integração com wearables (Apple Watch, Wear OS) | Q3 2026 |
| v2.1 | Notificações push personalizadas (saúde) | Q4 2026 |
| v3.0 | IA para recomendações de saúde | Q1 2027 |

---

## Conclusão

A arquitetura do Vigora Saúde foi projetada para ser **simples, resiliente e segura**. O uso de Expo, Context API e AsyncStorage permite funcionamento completo offline. O Supabase fornece o dead man's switch sem necessidade de infraestrutura própria. O RevenueCat gerencia toda a complexidade de monetização cross-platform. A estrutura de componentes reutilizáveis (ProGate, TrialBanner, ProUpsellModal) facilita a manutenção e expansão futura.
