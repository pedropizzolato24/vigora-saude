# Guia de Configuração do RevenueCat — Vigora Saúde

Este documento descreve o passo a passo completo para configurar os produtos de assinatura do Vigora Saúde no painel RevenueCat, na App Store Connect (iOS) e no Google Play Console (Android).

---

## 1. Visão Geral da Arquitetura

O Vigora Saúde utiliza o RevenueCat como camada de abstração para gerenciar assinaturas em iOS e Android. A integração funciona da seguinte forma:

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

| Produto | Preço sugerido (BRL) | Equivalente mensal |
|---|---|---|
| `lifetime` | R$ 149,90 | — |
| `yearly` | R$ 79,90/ano | R$ 6,66/mês |
| `monthly` | R$ 12,90/mês | R$ 12,90/mês |

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

1. Clique em **+ New Project** → nomeie como `Vigora Saúde`
2. Adicione dois apps: **iOS** (com o Bundle ID do `app.config.ts`) e **Android** (com o Package Name)
3. Copie as **API Keys** de cada plataforma

A API Key de teste já configurada no app é: `test_vRsfCVmxAKkKikyiJxZLkiqYliI`

> Para produção, substitua pela chave de produção em `lib/purchases.ts` na constante `RC_API_KEY`.

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

### 4.5 Configurar o Paywall (RevenueCat Paywalls)

1. Acesse **Paywalls** → **+ New Paywall**
2. Selecione o template desejado (recomendado: **Blaze** para 3 planos)
3. Personalize com as cores do Vigora Saúde:
   - Primary: `#0a7ea4`
   - Background: `#ffffff`
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

export async function hasProAccess(customerInfo: CustomerInfo): Promise<boolean> {
  return customerInfo.entitlements.active[ENTITLEMENT_PRO] !== undefined;
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

## 7. Limites do Plano Gratuito

Os limites estão centralizados em `components/pro-gate.tsx`:

```typescript
export const FREE_LIMITS = {
  CONTACTS: 3,    // Máximo de contatos de emergência
  ALARMS: 5,      // Máximo de alarmes
  PDF_EXPORT: false,   // Exportação PDF bloqueada
  MONITORING: false,   // Monitoramento contínuo bloqueado
};
```

Para adicionar novos recursos premium, use os componentes disponíveis:

```typescript
import { ProGate, ProBanner, ProLimitBadge, useProFeature } from '@/components/pro-gate';

// Bloquear renderização
<ProGate fallback={<ProBanner title="Recurso Pro" description="..." />}>
  <RecursoPremium />
</ProGate>

// Bloquear ação
const { requirePro } = useProFeature();
const handleAction = () => {
  if (!requirePro()) return; // Abre paywall automaticamente
  // ... lógica premium
};

// Mostrar limite de uso
<ProLimitBadge current={count} limit={FREE_LIMITS.CONTACTS} label="contatos" />
```

---

## 8. Checklist de Lançamento

Antes de publicar o app nas lojas, verifique:

- [ ] Produtos criados na App Store Connect e Google Play Console
- [ ] Entitlement `Vigora Saúde Pro` criado no RevenueCat com os 3 produtos vinculados
- [ ] Offering `default` criado com os 3 pacotes (`$rc_lifetime`, `$rc_annual`, `$rc_monthly`)
- [ ] Paywall configurado e publicado no RevenueCat
- [ ] API Key de produção substituída em `lib/purchases.ts`
- [ ] Server Notifications configuradas (App Store + Google Play)
- [ ] Testado o fluxo completo de compra em dispositivo real (Sandbox)
- [ ] Testado o fluxo de restauração de compras
- [ ] Customer Center testado (cancelamento, reembolso)
