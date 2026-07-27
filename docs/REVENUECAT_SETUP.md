# Guia de Configuração do RevenueCat — Vigora

Este documento descreve o passo a passo completo para configurar os produtos de assinatura do Vigora no painel RevenueCat, na App Store Connect (iOS) e no Google Play Console (Android).

---

## 1. Visão Geral da Arquitetura

O Vigora utiliza o RevenueCat como camada de abstração para gerenciar assinaturas em iOS e Android. A integração funciona da seguinte forma:

| Camada | Responsabilidade |
|---|---|
| App Store Connect / Google Play | Definição dos produtos e preços |
| RevenueCat Dashboard | Agrupamento em Offerings e Entitlements |
| SDK (`react-native-purchases`) | Compra, restauração e verificação no app |
| `lib/purchases.ts` | Serviço local que encapsula o SDK |
| `context/purchases-context.tsx` | Estado global de assinatura no React |

---

## 2. Configuração no App Store Connect (iOS)

### 2.1 Criar os Produtos In-App Purchase

Acesse [App Store Connect](https://appstoreconnect.apple.com) → seu app → **Monetização** → **Compras no aplicativo**.

Crie os seguintes produtos:

| Product ID | Tipo | Nome de exibição | Duração |
|---|---|---|---|
| `lifetime` | Non-Consumable | Vigora Pro — Vitalício | Única vez |
| `yearly` | Auto-Renewable Subscription | Vigora Pro — Anual | 1 ano |
| `monthly` | Auto-Renewable Subscription | Vigora Pro — Mensal | 1 mês |

> **Importante:** Os Product IDs devem ser exatamente `lifetime`, `yearly` e `monthly` para corresponder à configuração em `lib/purchases.ts`.

### 2.2 Configurar Subscription Group

Para os produtos `yearly` e `monthly`, crie um **Subscription Group** chamado `Vigora Pro`. Ambos devem pertencer ao mesmo grupo para que o upgrade/downgrade funcione corretamente.

### 2.3 Configurar Preços Sugeridos

| Produto | Preço (BRL) | Equivalente mensal |
|---|---|---|
| `lifetime` | R$ 299,90 | — |
| `yearly` | R$ 199,90/ano | R$ 16,66/mês |
| `monthly` | R$ 19,90/mês | R$ 19,90/mês |

### 2.4 Configurar App Store Server Notifications

No App Store Connect → **Configurações do App** → **Server Notifications**, adicione a URL de webhook do RevenueCat:

```
https://api.revenuecat.com/v1/webhooks/app_store
```

---

## 3. Configuração no Google Play Console (Android)

### 3.1 Criar os Produtos

Acesse [Google Play Console](https://play.google.com/console) → seu app → **Monetização** → **Produtos**.

**Produto único (Lifetime):**
- Tipo: **Produto gerenciado** (one-time purchase)
- ID do produto: `lifetime`
- Nome: Vigora Pro — Vitalício

**Assinaturas (Yearly e Monthly):**
- Tipo: **Assinatura**
- IDs: `yearly` e `monthly`
- Crie ambos dentro do mesmo grupo de assinaturas `vigora_pro`

### 3.2 Configurar Real-Time Developer Notifications

No Google Play Console → **Monetização** → **Configurações de monetização**, adicione o tópico Pub/Sub do RevenueCat (disponível no painel RC em **App Settings → Android**).

---

## 4. Configuração no Painel RevenueCat

Acesse [app.revenuecat.com](https://app.revenuecat.com).

### 4.1 Criar o App

1. Clique em **+ New Project** → nomeie como `Vigora`
2. Adicione dois apps: **iOS** e **Android**

| Plataforma | Campo | Valor |
|---|---|---|
| iOS | Bundle ID | `com.vigora.saude` |
| Android | Package Name | `com.vigora.saude` |

3. Copie as **API Keys** de cada plataforma e configure em `EXPO_PUBLIC_REVENUECAT_API_KEY`.

### 4.2 Criar o Entitlement

1. No menu lateral, acesse **Entitlements** → **+ New Entitlement**
2. **Identifier:** `Vigora Saúde Pro` *(deve ser exatamente este valor)*
3. Clique em **Add** e vincule os 3 produtos (`lifetime`, `yearly`, `monthly`) a este entitlement

### 4.3 Criar os Products

1. Acesse **Products** → **+ New Product**
2. Adicione os 3 produtos para cada plataforma:

| Identifier | Plataforma | Store Product ID |
|---|---|---|
| `lifetime` | App Store | `lifetime` |
| `lifetime` | Play Store | `lifetime` |
| `yearly` | App Store | `yearly` |
| `yearly` | Play Store | `yearly` |
| `monthly` | App Store | `monthly` |
| `monthly` | Play Store | `monthly` |

### 4.4 Criar o Offering

1. Acesse **Offerings** → **+ New Offering**
2. **Identifier:** `default` *(o SDK busca o offering padrão automaticamente)*
3. Clique em **+ New Package** e adicione os 3 pacotes:

| Package Identifier | Tipo | Product |
|---|---|---|
| `$rc_lifetime` | Lifetime | `lifetime` |
| `$rc_annual` | Annual | `yearly` |
| `$rc_monthly` | Monthly | `monthly` |

4. Marque o offering como **Current** (padrão)

> **Armadilha conhecida:** produtos criados apenas na **Test Store** do RevenueCat não são entregues ao SDK em builds reais — o paywall abre e mostra "Sem conexão" / "Planos indisponíveis". Os produtos precisam existir na App Store Connect e no Google Play e estar vinculados no painel RC. Sintoma idêntico ao de chave de API ausente, então cheque os dois.

### 4.5 Configurar o Paywall (RevenueCat Paywalls)

1. Acesse **Paywalls** → **+ New Paywall**
2. Selecione o template desejado (recomendado: **Blaze** para 3 planos)
3. Personalize com as cores do Vigora:
   - Primary: `#1E4D8C` (azul profundo)
   - Background: `#F4EFE5` (creme)
   - Accent: `#C96442` (terracota)
4. Vincule ao offering `default`
5. Publique o paywall

---

## 5. Build EAS — Configuração

O projeto já possui `eas.json` configurado com 4 profiles:

| Profile | Uso | Distribuição |
|---|---|---|
| `development` | Testes com `expo-dev-client` | Internal (TestFlight / APK) |
| `simulator` | Testes no simulador iOS | Internal |
| `preview` | Testes internos antes do lançamento | Internal |
| `production` | Lançamento nas lojas | App Store / Play Store |

### 5.1 Pré-requisitos

```bash
# Instalar EAS CLI globalmente
npm install -g eas-cli

# Fazer login na conta Expo
eas login

# Configurar o projeto (primeira vez)
eas build:configure
```

### 5.2 Comandos de Build

```bash
# Build de desenvolvimento (iOS + Android)
pnpm eas:build:dev

# Build de desenvolvimento apenas Android (APK)
pnpm eas:build:dev:android

# Build de desenvolvimento apenas iOS
pnpm eas:build:dev:ios

# Build de preview (para testes internos)
pnpm eas:build:preview:android

# Build de produção
pnpm eas:build:production
```

### 5.3 Testando Compras em Desenvolvimento

- **iOS:** Use contas de Sandbox Tester criadas no App Store Connect → **Usuários e Acesso** → **Sandbox**
- **Android:** Use contas de teste no Google Play Console → **Testadores internos**
- **RevenueCat:** No painel RC, ative o **Sandbox Mode** para visualizar compras de teste

---

## 6. Verificação de Entitlement no Código

O entitlement é verificado em `lib/purchases.ts`:

```typescript
export const ENTITLEMENT_PRO = "Vigora Saúde Pro";

export function hasProAccess(customerInfo: CustomerInfo | null): boolean {
  if (!customerInfo) return false;
  return typeof customerInfo.entitlements.active[ENTITLEMENT_PRO] !== "undefined";
}
```

E consumido via hook em qualquer tela:

```typescript
import { usePurchases } from '@/hooks/use-purchases';

function MyScreen() {
  const { isPro } = usePurchases();
  // isPro === true quando o usuário tem o entitlement ativo
}
```

---

## 7. Política de Acesso — Sem Bloqueio por Plano

O app **não bloqueia recursos por plano**. A monetização é por assinatura após o **trial de 14 dias** (`TRIAL_DAYS` em `context/purchases-context.tsx`), via `TrialBanner` / `ExpiredBanner` / paywall — nunca por restrição de funcionalidade. A fonte única de verdade é `components/pro-limits.ts`, um módulo puro que UI e testes importam:

```typescript
export const FREE_LIMITS = {
  CONTACTS: Infinity,   // sem limite por plano
  ALARMS: Infinity,     // sem limite por plano
  PDF_EXPORT: true,     // liberado para todos
  MONITORING: true,     // liberado para todos
} as const;

/** Teto técnico de alarmes simultâneos (limite do agendador, não do plano). */
export const MAX_ALARMS = 24;
```

Os componentes `ProGate` / `ProBanner` / `ProLimitBadge` / `useProFeature` foram **removidos** junto com os limites por plano — não existe mais `components/pro-gate.tsx`. Sobrou o `ProUpsellModal`, usado como convite à assinatura.

Para consultar o estado da assinatura em qualquer tela:

```typescript
import { usePurchases } from '@/hooks/use-purchases';

const { isPro, isTrialActive, trialDaysLeft } = usePurchases();
```

> Se um recurso realmente precisar virar premium no futuro, reintroduza o gate deliberadamente — e atualize este documento junto. Alterar `FREE_LIMITS` sozinho não bloqueia nada, porque nenhum componente lê esses valores como gate hoje.

---

## 8. Checklist de Lançamento

Antes de publicar o app nas lojas, verifique:

- [ ] Produtos criados na App Store Connect e Google Play Console — **nas lojas reais, não só na Test Store**
- [ ] Entitlement `Vigora Saúde Pro` criado no RevenueCat com os 3 produtos vinculados
- [ ] Offering `default` criado com os 3 pacotes (`$rc_lifetime`, `$rc_annual`, `$rc_monthly`)
- [ ] Paywall configurado e publicado no RevenueCat
- [ ] API Key de produção configurada em `EXPO_PUBLIC_REVENUECAT_API_KEY`
- [ ] Server Notifications configuradas (App Store + Google Play)
- [ ] Bundle ID `com.vigora.saude` configurado em ambas as plataformas
- [ ] Testado o fluxo completo de compra em dispositivo real (Sandbox)
- [ ] Testado o fluxo de restauração de compras
- [ ] Customer Center testado (cancelamento, reembolso)
