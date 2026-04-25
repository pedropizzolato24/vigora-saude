# Guia de Build, Publicação e Paywall — Vigora Saúde

Este documento cobre os dois processos principais para lançar o Vigora Saúde nas lojas e configurar o Paywall visual no RevenueCat.

---

## Opção 1 — Publicar o App nas Lojas

### Pré-requisitos

Antes de iniciar, você precisará de:

| Requisito | Onde obter |
|---|---|
| Conta Expo (gratuita) | [expo.dev/signup](https://expo.dev/signup) |
| Conta Apple Developer (US$ 99/ano) | [developer.apple.com](https://developer.apple.com) |
| Conta Google Play Developer (US$ 25 único) | [play.google.com/console](https://play.google.com/console) |
| EAS CLI instalado | Já instalado no projeto |

---

### Passo 1 — Fazer login no EAS

No terminal, dentro da pasta do projeto:

```bash
cd vigora-saude
eas login
```

Informe seu e-mail e senha da conta Expo. Se ainda não tiver conta, crie em [expo.dev/signup](https://expo.dev/signup) (gratuito).

---

### Passo 2 — Publicar pelo botão Publish (recomendado)

O jeito mais simples de gerar o APK/IPA é pelo botão **Publish** no painel do Manus:

1. Certifique-se de que o último checkpoint foi salvo (já está salvo: `f520b63b`)
2. Clique no botão **Publish** no canto superior direito do painel
3. Escolha a plataforma (**Android** ou **iOS**)
4. Aguarde o build ser gerado (5–20 minutos)
5. Baixe o arquivo `.apk` (Android) ou `.ipa` (iOS)

> **Android APK:** Pode ser instalado diretamente em qualquer dispositivo Android (ative "Instalar de fontes desconhecidas" nas configurações do dispositivo).

---

### Passo 3 — Build via EAS CLI (alternativo)

Se preferir usar o terminal diretamente:

```bash
# Build de preview para Android (APK para testes)
eas build --profile preview --platform android

# Build de produção para Android (AAB para Google Play)
eas build --profile production --platform android

# Build de produção para iOS (IPA para App Store)
eas build --profile production --platform ios
```

Os builds são executados na nuvem do Expo. Você receberá um link para acompanhar o progresso e baixar o arquivo ao final.

---

### Passo 4 — Enviar para o Google Play

1. Acesse [Google Play Console](https://play.google.com/console)
2. Crie um novo app → **Criar aplicativo**
3. Preencha as informações básicas (nome, categoria, idioma)
4. Em **Versões** → **Testes internos** → **Criar nova versão**
5. Faça upload do arquivo `.aab` gerado pelo build de produção
6. Preencha as notas da versão e publique

> **Dica:** Comece sempre com "Testes internos" para validar o app antes de publicar para todos os usuários.

---

### Passo 5 — Enviar para a App Store (iOS)

1. Acesse [App Store Connect](https://appstoreconnect.apple.com)
2. Crie um novo app em **Meus Apps** → **+**
3. Preencha: Bundle ID (`space.manus.vigora.saude.t20250417181420`), nome, SKU
4. Use o **Transporter** (macOS) ou **Xcode** para fazer upload do `.ipa`
5. Ou use o EAS Submit: `eas submit --profile production --platform ios`

---

### Passo 6 — Configurar o eas.json para Submit (opcional)

Para automatizar o envio às lojas, edite o `eas.json` com suas credenciais:

```json
"submit": {
  "production": {
    "ios": {
      "appleId": "seu@email.com",
      "ascAppId": "1234567890",
      "appleTeamId": "ABCDE12345"
    },
    "android": {
      "serviceAccountKeyPath": "./google-service-account.json",
      "track": "internal"
    }
  }
}
```

Depois execute:
```bash
eas submit --profile production --platform all
```

---

## Opção 2 — Personalizar o Paywall no Painel RevenueCat

### Passo 1 — Acessar o Painel RevenueCat

1. Acesse [app.revenuecat.com](https://app.revenuecat.com)
2. Faça login ou crie uma conta gratuita
3. Crie um novo projeto chamado **Vigora Saúde**

---

### Passo 2 — Adicionar os Apps

No projeto criado, clique em **+ New App**:

**Para iOS:**
- Platform: **App Store**
- App Name: `Vigora Saúde`
- Bundle ID: `space.manus.vigora.saude.t20250417181420`
- Copie a **Public API Key** gerada

**Para Android:**
- Platform: **Google Play**
- App Name: `Vigora Saúde`
- Package Name: `space.manus.vigora.saude.t20250417181420`
- Copie a **Public API Key** gerada

> **Importante:** Atualize a API Key em `lib/purchases.ts` substituindo `test_vRsfCVmxAKkKikyiJxZLkiqYliI` pela chave de produção antes do lançamento.

---

### Passo 3 — Criar os Produtos

Em **Products** → **+ New Product**, adicione para cada plataforma:

| Identifier | Tipo | Store Product ID | Plataforma |
|---|---|---|---|
| `lifetime` | Non-Consumable | `lifetime` | iOS + Android |
| `yearly` | Annual Subscription | `yearly` | iOS + Android |
| `monthly` | Monthly Subscription | `monthly` | iOS + Android |

---

### Passo 4 — Criar o Entitlement

Em **Entitlements** → **+ New Entitlement**:
- **Identifier:** `Vigora Saúde Pro` *(exatamente este valor)*
- Vincule os 3 produtos (`lifetime`, `yearly`, `monthly`) ao entitlement

---

### Passo 5 — Criar o Offering

Em **Offerings** → **+ New Offering**:
- **Identifier:** `default`
- Adicione 3 pacotes:

| Package Identifier | Tipo | Product |
|---|---|---|
| `$rc_lifetime` | Lifetime | `lifetime` |
| `$rc_annual` | Annual | `yearly` |
| `$rc_monthly` | Monthly | `monthly` |

Marque como **Current** (padrão).

---

### Passo 6 — Criar e Personalizar o Paywall

Em **Paywalls** → **+ New Paywall**:

1. **Selecione o template:** Recomendado **Blaze** (3 planos lado a lado) ou **Condensed** (lista vertical)

2. **Personalize as cores** (clique em cada elemento):

| Elemento | Cor sugerida |
|---|---|
| Cor primária / CTA | `#0a7ea4` |
| Fundo | `#ffffff` |
| Texto principal | `#11181C` |
| Texto secundário | `#687076` |
| Destaque do plano anual | `#0a7ea4` |

3. **Personalize os textos:**
   - **Título:** `Vigora Saúde Pro`
   - **Subtítulo:** `Cuide da sua saúde sem limites`
   - **Descrição do Lifetime:** `Acesso vitalício — pague uma vez, use para sempre`
   - **Descrição do Anual:** `Melhor custo-benefício — economize 57%`
   - **Descrição do Mensal:** `Comece agora, cancele quando quiser`
   - **Botão CTA:** `Assinar agora`
   - **Texto de restauração:** `Restaurar compras`

4. **Features (lista de benefícios):**
   - ✓ Contatos de emergência ilimitados
   - ✓ Alarmes de medicação ilimitados
   - ✓ Exportação PDF da ficha médica
   - ✓ Monitoramento contínuo de alarmes
   - ✓ Suporte prioritário

5. **Vincule ao Offering:** Selecione `default`

6. Clique em **Publish** para ativar o paywall remotamente (sem novo build!)

---

### Passo 7 — Testar o Paywall

O paywall configurado no painel RC é carregado dinamicamente pelo app. Para testar:

1. Instale o build de desenvolvimento no dispositivo
2. Vá em **Configurações** → toque em **Assinar Vigora Pro**
3. O paywall aparecerá com o design configurado no painel RC
4. Para testar compras, use contas Sandbox (iOS) ou contas de teste (Android)

---

## Resumo dos Comandos Úteis

```bash
# Login no EAS
eas login

# Ver status do projeto
eas project:info

# Build Android (APK para testes)
eas build --profile preview --platform android

# Build Android (AAB para Google Play)
eas build --profile production --platform android

# Build iOS (IPA para App Store)
eas build --profile production --platform ios

# Enviar para as lojas automaticamente
eas submit --profile production --platform android
eas submit --profile production --platform ios

# Ver builds anteriores
eas build:list
```

---

## Informações do App

| Campo | Valor |
|---|---|
| App Name | Vigora Saúde |
| Bundle ID / Package | `space.manus.vigora.saude.t20250417181420` |
| Versão atual | 1.0.0 |
| API Key RevenueCat (teste) | `test_vRsfCVmxAKkKikyiJxZLkiqYliI` |
| Entitlement | `Vigora Saúde Pro` |
| Offering padrão | `default` |
