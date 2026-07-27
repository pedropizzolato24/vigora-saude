# Guia de Build, Publicação e Paywall — Vigora

Este documento cobre os dois processos principais para lançar o Vigora nas lojas e configurar o Paywall visual no RevenueCat.

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

### Passo 2 — Build via EAS CLI

```bash
# Build de preview para Android (APK para testes internos)
eas build --profile preview --platform android

# Build de produção para Android (AAB para Google Play)
eas build --profile production --platform android

# Build de produção para iOS (IPA para App Store)
eas build --profile production --platform ios
```

Os builds são executados na nuvem do Expo. Você receberá um link para acompanhar o progresso e baixar o arquivo ao final.

> **Android APK (preview):** Pode ser instalado diretamente em qualquer dispositivo Android (ative "Instalar de fontes desconhecidas" nas configurações do dispositivo).

---

### Passo 3 — Enviar para o Google Play

1. Acesse [Google Play Console](https://play.google.com/console)
2. Crie um novo app → **Criar aplicativo**
3. Preencha as informações básicas (nome, categoria, idioma)
4. Em **Versões** → **Testes internos** → **Criar nova versão**
5. Faça upload do arquivo `.aab` gerado pelo build de produção
6. Preencha as notas da versão e publique

> **Dica:** Comece sempre com "Testes internos" para validar o app antes de publicar para todos os usuários.

---

### Passo 4 — Enviar para a App Store (iOS)

1. Acesse [App Store Connect](https://appstoreconnect.apple.com)
2. Crie um novo app em **Meus Apps** → **+**
3. Preencha: Bundle ID (`com.vigora.saude`), nome, SKU
4. Use o EAS Submit: `eas submit --profile production --platform ios`

---

### Passo 5 — Configurar o eas.json para Submit

O `eas.json` já traz o submit do **Android** configurado:

```json
"submit": {
  "production": {
    "android": {
      "serviceAccountKeyPath": "./google-service-account.json",
      "track": "internal"
    }
  }
}
```

Para o **iOS**, acrescente o bloco correspondente com suas credenciais:

```json
"ios": {
  "appleId": "seu@email.com",
  "ascAppId": "1234567890",
  "appleTeamId": "ABCDE12345"
}
```

Depois execute:
```bash
eas submit --profile production --platform all
```

> **Versionamento:** o `eas.json` usa `appVersionSource: "remote"` com `autoIncrement` no profile de produção — o `versionCode`/`buildNumber` é gerenciado pelo EAS, não pelo `app.config.ts`. Não incremente à mão.

---

### Passo 6 — Google OAuth por profile

O Client ID Android do Google depende do SHA-1 do certificado de assinatura, que é **diferente** entre debug e release. Por isso o `eas.json` fixa um `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` por profile:

| Profile | Certificado | Client ID |
|---|---|---|
| `development` / `simulator` | debug | `...-cm5s8hs0rare5smst57l1gbin9obt0u1` |
| `preview` / `production` | release (upload/Play App Signing) | `...-iv01adn3g5di03k6ukp9n02mri393s6n` |

Ambos precisam estar cadastrados no Google Cloud com o SHA-1 correspondente, e o servidor aceita os dois como audience válida. Se o login Google falhar com `redirect_uri_mismatch` ou `invalid_grant`, é quase sempre SHA-1 ausente no Google Cloud.

> No build Android de release, o bundle JS é gerado pelo passo do **Gradle** — as variáveis `EXPO_PUBLIC_*` precisam estar no env daquele passo (ver `.github/workflows/eas-build.yml`), senão saem vazias no app mesmo estando definidas em outro lugar.

---

## Opção 2 — Personalizar o Paywall no Painel RevenueCat

### Passo 1 — Acessar o Painel RevenueCat

1. Acesse [app.revenuecat.com](https://app.revenuecat.com)
2. Faça login ou crie uma conta gratuita
3. Crie um novo projeto chamado **Vigora**

---

### Passo 2 — Adicionar os Apps

No projeto criado, clique em **+ New App**:

**Para iOS:**
- Platform: **App Store**
- App Name: `Vigora`
- Bundle ID: `com.vigora.saude`
- Copie a **Public API Key** gerada

**Para Android:**
- Platform: **Google Play**
- App Name: `Vigora`
- Package Name: `com.vigora.saude`
- Copie a **Public API Key** gerada

> **Importante:** a chave é lida **apenas** de `EXPO_PUBLIC_REVENUECAT_API_KEY` — `lib/purchases.ts` não tem chave hardcoded, e não deve ganhar uma. Use a chave **pública** por plataforma (`goog_*` no Android, `appl_*` no iOS); a secret `sk_*` jamais pode entrar no bundle do app.

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

| Elemento | Cor da marca |
|---|---|
| Cor primária / CTA | `#1E4D8C` (azul profundo) |
| Fundo | `#F4EFE5` (creme) |
| Superfície dos cards | `#FFFFFF` |
| Texto principal | `#0E1417` |
| Texto secundário | `#5B636A` |
| Destaque do plano anual | `#C96442` (terracota) |

3. **Personalize os textos:**
   - **Título:** `Vigora Pro`
   - **Subtítulo:** `Tranquilidade para quem você ama`
   - **Descrição do Lifetime:** `Acesso vitalício — pague uma vez, use para sempre`
   - **Descrição do Anual:** `Melhor custo-benefício`
   - **Descrição do Mensal:** `Comece agora, cancele quando quiser`
   - **Botão CTA:** `Assinar agora`
   - **Texto de restauração:** `Restaurar compras`

4. **Features (lista de benefícios):**
   - ✓ Alertas automáticos aos seus contatos de emergência
   - ✓ Cuidadores avisados na hora, pelo app
   - ✓ Lembretes de medicação com confirmação
   - ✓ Seus dados salvos na sua conta, mesmo se trocar de celular
   - ✓ Suporte prioritário

> **Atenção — linguagem.** O paywall é material de marketing e está sujeito às mesmas linhas vermelhas do resto do app: nada de "controla a pressão", "previne quedas", "trata", "diagnostica", "garante segurança" ou "substitui consulta médica". Use linguagem de bem-estar e segurança. Ver `docs/strategy/regulatory-context.md`.

> **Atenção — o app não bloqueia recursos por plano.** Contatos, alarmes, PDF e monitoramento são liberados para todos (`components/pro-limits.ts`). Os benefícios acima descrevem o produto, não recursos destravados pela assinatura — não escreva "ilimitado" em oposição a um plano gratuito limitado que não existe.

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
| App Name | Vigora |
| Bundle ID / Package | `com.vigora.saude` |
| URL Schemes (deep link) | `vigora://` e `com.vigora.saude://` (este último usado no redirect do OAuth Google) |
| Callback do OAuth Google | `com.vigora.saude:/oauthredirect` |
| Link universal de convite | `https://<EXPO_PUBLIC_LINK_HOST>/convite/<token>` |
| Versão atual | 1.0.0 (`versionCode`/`buildNumber` remotos via EAS) |
| Entitlement | `Vigora Saúde Pro` |
| Offering padrão | `default` |
| API de produção | `https://api.vigorasaude.com` |
