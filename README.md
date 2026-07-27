# Vigora — Assistente Pessoal de Saúde e Segurança

**Vigora** é um aplicativo móvel nativo para iOS e Android que funciona como assistente pessoal de saúde e segurança, especialmente projetado para idosos e pessoas com condições de saúde crônicas. O app monitora a saúde do usuário, gerencia medicações através de alarmes inteligentes, facilita o acesso rápido a serviços de emergência e mantém contatos de emergência sempre à mão.

---

## Visão Geral

O Vigora foi desenvolvido com **Expo SDK 54** (React Native 0.81) e oferece uma experiência mobile-first otimizada para usuários com diferentes níveis de literacia digital. O app combina funcionalidades de saúde, segurança e comunicação em uma interface intuitiva com suporte a modo claro/escuro, ajuste de tamanho de fonte e modo de acessibilidade.

A infraestrutura é **100% própria**: o backend roda em Node.js auto-hospedado no Railway, a autenticação é multi-provedor (Google, Apple, e-mail+senha, telefone via WhatsApp OTP e conta anônima) com sessão JWT própria, e os dados do usuário são respaldados na própria conta para sobreviver a uma reinstalação.

### Números-Chave

| Atributo | Valor |
|---|---|
| Plataformas | iOS 14+ e Android 7.0+ (Expo managed workflow) |
| Stack Frontend | React Native 0.81.5 + Expo 54 + Expo Router 6 + NativeWind 4 + TypeScript 5.9 |
| Backend | Node.js 22 + Express + tRPC v11 + MySQL + Drizzle ORM (hospedado no Railway) |
| Autenticação | Google (`expo-auth-session`, PKCE) · Apple · e-mail+senha · telefone (OTP WhatsApp) · anônima — sempre com sessão JWT própria |
| API | `https://api.vigorasaude.com` |
| Monetização | RevenueCat SDK v10 — Lifetime, Anual, Mensal + trial de 14 dias (experiência completa, sem bloqueio de recursos) |
| Testes Automatizados | 290 testes em 38 arquivos (Vitest) — auth, segurança, monitoramento, push, alarmes, RevenueCat |
| Telas | 11 abas do monitorado (+ `tudo`) · 4 abas do cuidador (+ vínculo) · ~13 telas de fluxo · 2 modais |
| Repositório | [github.com/pedropizzolato24/vigora-saude](https://github.com/pedropizzolato24/vigora-saude) |

---

## Fluxo de Autenticação e Cadastro

O app guia o usuário por um funil **onboarding → login → registro** controlado pelo componente `OnboardingGate` no startup:

1. **Onboarding:** slides de apresentação na primeira abertura.
2. **Login:** cinco caminhos, todos terminando em um **JWT próprio** emitido pelo servidor (Bearer no nativo, cookie na web).
3. **Registro:** novos usuários completam o cadastro informando nome, telefone, **tipo de conta** (cuidador ou monitorado) e, opcionalmente, data de nascimento e tipo sanguíneo. Enquanto o `userType` não é definido, o app roteia para `/register` em vez das abas principais. O rascunho do formulário é persistido (`lib/register-draft.ts`), então fechar o app no meio do cadastro não perde o que já foi digitado.

### Métodos de Login

| Método | Como funciona | Endpoint |
|---|---|---|
| **Google** | `expo-auth-session` com **PKCE**. No Android o Custom Tab volta em `com.vigora.saude:/oauthredirect`, que o `app/+native-intent.ts` roteia para `app/oauthredirect.tsx`; o cliente troca o code por tokens e envia o `id_token`. | `POST /api/auth/google` |
| **Apple** | `expo-apple-authentication` (só iOS, e só quando `EXPO_PUBLIC_APPLE_SIGNIN_ENABLED=true` no build). | `POST /api/auth/apple` |
| **E-mail + senha** | Cadastro com código de confirmação e recuperação de senha, enviados via Resend. Sem `RESEND_API_KEY` o servidor responde 503 e o app esconde o botão. | `POST /api/auth/email/{signup,verify,login,forgot,reset}` |
| **Telefone** | OTP entregue por WhatsApp (template de autenticação aprovado no Meta). Sem `WHATSAPP_OTP_TEMPLATE_NAME` o app esconde o botão. | `POST /api/auth/phone/{request,verify}` |
| **Continuar sem conta** | Conta anônima — o app funciona inteiro e o login vira um *upgrade* que anexa os provedores à mesma conta. | `POST /api/auth/anonymous` |

`GET /api/auth/methods` diz ao app quais métodos estão habilitados no deploy, para que ele só mostre botões que funcionam.

O e-mail verificado é a chave canônica de vínculo de conta: logar por provedores diferentes com o mesmo e-mail cai na mesma conta (tabela `auth_identities`).

### Sessão

A sessão é **deslizante**: `auth.refresh` é chamado a cada abertura do app (`lib/session-refresh.ts`), então um aparelho em uso ativo nunca expira. Um 401 em qualquer chamada derruba a sessão de forma global e leva o usuário ao login — sem isso, uma sessão morta desarmava silenciosamente o dead man's switch.

### Tipos de Usuário

| Tipo | Descrição |
|---|---|
| **Monitorado** | Usa o app para a própria saúde e segurança. |
| **Cuidador** | Acompanha a saúde de outra pessoa. |

O perfil (nome, telefone, data de nascimento, tipo sanguíneo) é persistido no servidor e pré-preenche a tela "Meu Perfil". Edições no app são salvas via `auth.updateProfile`. A exclusão de conta (`auth.deleteAccount`) apaga os dados do servidor — requisito da LGPD (Art. 18 VI).

---

## Sincronização na Nuvem (Backup por Conta)

Todos os dados do app são respaldados na conta do usuário, permitindo recuperação completa após reinstalar o app:

- **O que é sincronizado:** ficha de anamnese, contatos de emergência, alarmes, configurações e histórico de métricas de saúde.
- **Como funciona:** o estado local é a fonte de verdade; a cada mudança, um snapshot é enviado ao servidor (com debounce de 3s). No login, o app reconcilia local vs. nuvem por **last-write-wins** (`dataUpdatedAt`). Se a cópia da nuvem for mais recente (ex.: após reinstalar), ela hidrata o estado local.
- **Escopo:** o backup é amarrado ao `openId` (a conta, qualquer que tenha sido o provedor de login), independente de dispositivo. O acesso é sempre restrito ao usuário autenticado.
- **Exceção:** a foto de perfil permanece somente local (não sincronizada).

> "Limpar Todos os Dados" nas Configurações também propaga o apagamento para o backup. O logout **não** apaga o backup — é justamente isso que viabiliza o restore após reinstalar.

---

## Funcionalidades Principais

### 1. Dashboard (Início)

- **Botão SOS:** acionamento rápido com animação de pulso; diálogo de contagem regressiva (`sos-countdown-dialog.tsx`) para permitir cancelar antes do disparo, e tela ativa (`sos-active-screen.tsx`) enquanto o alerta está em curso. O SOS avisa os contatos por WhatsApp e os cuidadores vinculados por push (`monitoring.sosAlertCaregivers`).
- **Botão de Ambulância:** pré-configurado com número SUS e dados do plano de saúde; integra WhatsApp para notificar contatos.
- **Cards de Status:** próximos alarmes, últimas métricas, contatos configurados e status do monitoramento.
- **Ações Rápidas:** atalhos para Alarmes, Métricas, Contatos e Configurações. A aba **Tudo** (`tudo.tsx`) reúne o menu completo.
- **TrialBanner / ExpiredBanner:** contagem regressiva do trial e chamada para assinar após expiração.
- **UpdateBanner:** avisa quando há uma versão mais nova do app disponível.

### 2. Alarmes (Medicações)

- **CRUD de Alarmes** com confirmação de exclusão.
- **Agendamento Flexível:** diário, dias úteis, fins de semana, dias personalizados.
- **Notificações Nativas:** no Android os alarmes disparam via AlarmManager nativo (`expo-alarm-module`, com patch local); no iOS/Web via `expo-notifications`.
- **Full-Screen Alarm:** tela cheia com contador regressivo e botão de confirmação, exibida sobre a tela de bloqueio (Android 14+ exige `USE_FULL_SCREEN_INTENT`, com checagem de permissão em runtime).
- **Soneca por deep link:** o botão "Soneca" da notificação abre `vigora://alarm-ring?...&snooze=1` e a soneca é executada sem passar pela UI.
- **Escalação Automática:** se não confirmado dentro do período de carência (15 min), o servidor avisa os contatos de emergência por WhatsApp (com localização GPS) e envia push em tempo real aos cuidadores vinculados.
- **Isenção de bateria (Android):** o app detecta otimização de bateria ativa (o modo de falha "app morto em background = alarme não toca"), abre o diálogo nativo de isenção e envia essa telemetria no heartbeat (`accountLiveness.batteryExempt`).
- **Limite:** teto técnico de 24 alarmes simultâneos (limite do agendador, igual para todos os planos).

### 3. Saúde (Métricas)

- **Tipos:** pressão arterial, frequência cardíaca, glicemia, peso, temperatura, oxigenação (SpO2).
- **Histórico:** completo para todos os usuários.
- **Persistência:** local (AsyncStorage) com backup na conta do usuário.

### 4. Contatos de Emergência

- **CRUD de Contatos:** nome, telefone, relação, email e toggle WhatsApp.
- **Importação da Agenda:** via `expo-contacts` com validação de duplicatas.
- **Monitoramento:** contatos são registrados no servidor para uso pelo dead man's switch.
- **Limite:** sem limite por plano.

### 5. Anamnese (Ficha Médica)

- **Campos:** nome, data de nascimento, gênero, alergias, medicações, doenças crônicas, número SUS, plano de saúde e operadora.
- **Exportação PDF:** PDF profissional com logo e QR code, disponível para todos.
- **Compartilhamento:** via `expo-sharing` (WhatsApp, email, etc.).

### 6. Check-in Diário

- Pergunta uma vez por dia se está tudo bem (padrão: 09:00, janela de 30 min para responder — desligado por padrão).
- Sem resposta dentro da janela, o evento entra na mesma escalação do dead man's switch.
- Resposta pela notificação, sem abrir o app (`app/checkin-response.tsx`).

### 7. Vínculo com o Cuidador

- **Convite pelo monitorado:** aba "Convidar Cuidador" gera código de 6 dígitos, QR code ou link compartilhável.
- **Link universal:** `https://<EXPO_PUBLIC_LINK_HOST>/convite/<token>` abre direto no app (App Links / Universal Links); sem o app instalado, cai numa landing servida pelo próprio backend com botão para a loja.
- **Do lado do cuidador:** wizard de vínculo, dashboard da pessoa monitorada, alertas recebidos e push em tempo real.
- Vínculos podem ser revogados a qualquer momento por qualquer um dos lados.

### 8. Bloqueio do App

- PIN de 4 dígitos + biometria (`expo-local-authentication`), com teclado próprio (`pin-keypad.tsx`) e gate na raiz do app (`app-lock-gate.tsx`).

### 9. Widgets Android

- `SosWidget`, `NextAlarmWidget` e `HealthWidget` na tela inicial via `react-native-android-widget`.

### 10. Configurações

- **Tema:** claro/escuro (tela dedicada `app/appearance-settings.tsx`).
- **Tamanho de Fonte** e **Modo de Acessibilidade** (alto contraste, fontes maiores, layout simplificado, touch targets ≥60px).
- **Monitoramento Contínuo** — liberado para todos os usuários.
- **Vigora Pro:** assinar / gerenciar assinatura.
- **Política de Privacidade** (com o e-mail do DPO) e **Excluir minha conta** — apaga a conta e os dados do servidor (LGPD Art. 18 VI).
- **Limpar Todos os Dados** (local + backup).

---

## Modelo de Monetização (RevenueCat)

Assinatura gerenciada pelo RevenueCat SDK v10. **O app não bloqueia recursos por plano**: todos os usuários têm a experiência completa (contatos e alarmes ilimitados, PDF, monitoramento contínuo). A conversão acontece via trial + banners de assinatura, não via restrição de funcionalidades.

### Opções de Assinatura

| Plano | Duração | Preço |
|---|---|---|
| Lifetime | Permanente | R$ 299,90 |
| Yearly | 1 ano | R$ 199,90/ano (≈ R$ 16,66/mês) |
| Monthly | 1 mês | R$ 19,90/mês |

### Trial de 14 Dias

Novos usuários recebem trial de 14 dias com a experiência completa do app. Durante o trial, `isTrialActive` e `trialDaysLeft` são expostos pelo `PurchasesContext` e o **TrialBanner** aparece nas telas Tudo e Configurações; após expirar, o **ExpiredBanner** convoca a assinatura. Para assinantes, nenhum banner é exibido.

---

## Arquitetura de Backend

### Servidor (Node.js + Express + tRPC + MySQL)

Auto-hospedado no **Railway** (`https://api.vigorasaude.com`). Responsável por autenticação, perfil, backup de dados, monitoramento contínuo (dead man's switch) e envio de alertas.

**Routers tRPC:**
- `system` — health check.
- `auth.me` / `auth.refresh` / `auth.completeRegistration` / `auth.updateProfile` / `auth.logout` / `auth.deleteAccount` — sessão e perfil.
- `userData.get` / `userData.put` — backup/restore do estado do app por conta.
- `monitoring.*` — `register`, `heartbeat`, `syncAlarms`, `createEvent`, `confirmEvent`, `getHistory`, `getWarnings`, `getStatus`, `sosAlertCaregivers` (todas autenticadas e amarradas ao `openId`).
- `link.*` — vínculo monitorado↔cuidador: `createInvite`, `redeemInvite`, `createShareInvite`, `getInviteInfo`, `acceptInvite`, `getMyLink`, `getMyCaregivers`, `getMonitoredData`, `getMonitoredAlerts`, `revokeLink`.
- `push.register` — registro do token de push (Expo) do cuidador.
- `whatsapp.sendEmergencyAlert` / `whatsapp.isConfigured` — alertas de emergência via WhatsApp.

**Rotas REST:**

| Rota | Propósito |
|---|---|
| `GET /api/auth/me` · `POST /api/auth/logout` · `POST /api/auth/session` | Ciclo de vida da sessão |
| `GET /api/auth/methods` | Quais métodos de login estão habilitados neste deploy |
| `POST /api/auth/google` · `/apple` · `/anonymous` | Verifica a credencial do provedor e emite o JWT |
| `POST /api/auth/email/{signup,verify,login,forgot,reset}` | E-mail + senha (códigos via Resend) |
| `POST /api/auth/phone/{request,verify}` | Login por telefone (OTP via WhatsApp) |
| `GET /api/health` | Health check profundo — responde **503** quando o banco está inacessível ou o job do dead man's switch está parado/falhando |
| `GET /convite/:token` | Landing do convite de cuidador quando o app não está instalado |
| `/api/trpc/*` | Endpoints tRPC (120 req/min/IP) |

**Canais de alerta:** WhatsApp Business API para os **contatos de emergência** + push (Expo) em tempo real para os **cuidadores vinculados**. São conjuntos de destinatários independentes.

### Dead Man's Switch

Detecta quando o usuário não responde a um alarme (ou ao check-in diário) e aciona os contatos de emergência. Roda no próprio servidor via `monitoring-job.ts`, iniciado em processo no boot do servidor com `setInterval` de 5 minutos. Parâmetros: carência de 15 min para responder, 30 min sem sinal para considerar o aparelho offline, e no mínimo 2 h entre avisos do mesmo nível.

> **Posse é por conta (`openId`), não por aparelho.** O `deviceId` é apenas metadado — nunca chave de posse. Ver `docs/design/2026-07-12-monitoring-account-ownership.md`.

**Tabelas (MySQL / Drizzle ORM):**

| Tabela | Descrição |
|---|---|
| `users` | Conta do usuário: `openId`, nome, email (único), telefone, `userType`, data de nascimento, tipo sanguíneo. |
| `auth_identities` | Provedores de login vinculados à conta (google/apple/email/phone/anonymous). |
| `auth_codes` | Códigos efêmeros de verificação de e-mail / OTP de telefone / recuperação de senha. |
| `user_data` | Backup do estado do app por conta (anamnese, contatos, alarmes, settings, métricas) + `dataUpdatedAt`. |
| `account_liveness` | Último sinal de vida da **conta** (qualquer aparelho): `lastSeenAt`, última localização, versão do app e telemetria de isenção de bateria. |
| `alarm_events` | Eventos de disparo de alarme (pending/responded/missed/not_sent). |
| `warning_log` | Registro de avisos enviados aos contatos. |
| `caregiver_links` | Vínculo persistente monitorado↔cuidador (`active`/`revoked`). |
| `link_invites` | Convites efêmeros de vínculo (código/QR/link), single-use. |
| `push_tokens` | Tokens de push (Expo) por conta — usados para alertar cuidadores. |

> Uma arquitetura anterior usava Supabase (Auth + Edge Function `check-missed-alarms`) para o dead man's switch. O Supabase foi **removido**: autenticação e monitoramento são servidos pelo backend Node no Railway. As tabelas `app_users`, `synced_alarms` e `device_heartbeat` — que amarravam o monitoramento ao aparelho — também foram descontinuadas em favor de `account_liveness` (migrations `0010`/`0011`).

---

## Estrutura de Pastas

```
vigora-saude/
├── app/
│   ├── _layout.tsx              ← Root layout (providers, gates, initializers, Stack)
│   ├── +native-intent.ts        ← Roteia deep links crus (oauthredirect, alarm-ring)
│   ├── onboarding.tsx           ← Slides de apresentação
│   ├── login.tsx                ← Login (Google, Apple, e-mail, telefone, sem conta)
│   ├── email-login.tsx          ← Fluxo e-mail + senha (cadastro, código, recuperação)
│   ├── phone-login.tsx          ← Fluxo de OTP por WhatsApp
│   ├── oauthredirect.tsx        ← Callback do OAuth Google (troca code → JWT)
│   ├── register.tsx             ← Cadastro (tipo de conta, nome, telefone, etc.)
│   ├── caregiver-onboarding.tsx ← Onboarding do cuidador
│   ├── alarm-ring.tsx           ← Tela cheia de alarme disparado
│   ├── checkin-response.tsx     ← Resposta ao check-in diário
│   ├── app-lock-setup.tsx       ← Configuração do PIN / biometria
│   ├── appearance-settings.tsx  ← Tema, tamanho de fonte, modo acessível
│   ├── help.tsx                 ← Ajuda (fora das abas)
│   ├── convite/[token].tsx      ← Aceite de convite por link universal
│   ├── (tabs)/                  ← Fluxo do monitorado (11 abas + `tudo`)
│   │   ├── index.tsx            ← Dashboard
│   │   ├── alarms.tsx           ← Alarmes
│   │   ├── health.tsx           ← Métricas de saúde
│   │   ├── contacts.tsx         ← Contatos de emergência
│   │   ├── anamnesis.tsx        ← Anamnese + exportação PDF
│   │   ├── ambulance.tsx        ← Ambulância / SUS
│   │   ├── location.tsx         ← Localização
│   │   ├── invite-caregiver.tsx ← Convidar cuidador (código / QR / link)
│   │   ├── help.tsx             ← Ajuda
│   │   ├── profile.tsx          ← Meu Perfil (sincronizado com o servidor)
│   │   ├── settings.tsx         ← Configurações
│   │   └── tudo.tsx             ← Menu completo (rota oculta da tab bar)
│   ├── (caregiver-tabs)/        ← Fluxo do cuidador (início, alertas, pessoa, config)
│   │   ├── _layout.tsx          ← Tabs do cuidador + registro do token de push
│   │   └── link.tsx             ← Wizard de vínculo
│   └── (modal)/
│       ├── paywall.tsx          ← RevenueCat Paywall nativo
│       └── customer-center.tsx  ← RevenueCat Customer Center
├── components/
│   ├── onboarding-gate.tsx      ← Funil onboarding → login → registro
│   ├── monitoring-initializer.tsx ← Heartbeat + sync de alarmes
│   ├── checkin-initializer.tsx  ← Agenda o check-in diário
│   ├── caregiver-push-initializer.tsx ← Registra o token de push do cuidador
│   ├── app-lock-gate.tsx / app-lock-screen.tsx / pin-keypad.tsx ← Bloqueio do app
│   ├── sos-countdown-dialog.tsx / sos-active-screen.tsx / sos-strip.tsx ← SOS
│   ├── app-dialog.tsx / app-toast.tsx ← Diálogos e toasts (nunca `Alert.alert`)
│   ├── pro-limits.ts            ← FREE_LIMITS + MAX_ALARMS (fonte única)
│   └── pro-upsell-modal.tsx     ← Upsell contextual
├── widgets/                     ← Widgets Android (SOS, próximo alarme, saúde)
├── modules/expo-alarm-countdown/ ← Módulo Expo local (contagem regressiva nativa)
├── hooks/
│   ├── use-auth.ts              ← Sessão/usuário (Bearer no nativo, cookie na web)
│   ├── use-delete-account.ts    ← Exclusão de conta (LGPD)
│   └── use-purchases.ts         ← Estado RevenueCat
├── lib/
│   ├── app-context.tsx          ← Estado global + reconcile/push do cloud backup
│   ├── cloud-sync.ts            ← pullCloudData / pushCloudData (userData tRPC)
│   ├── monitoring-service.ts    ← Cliente do dead man's switch (tRPC via HTTP)
│   ├── session-refresh.ts       ← Sessão deslizante (auth.refresh no startup)
│   ├── {google,apple,email,phone,anonymous}-signin.ts ← Provedores de login
│   ├── checkin-service.ts       ← Check-in diário
│   ├── app-lock-*.ts(x)         ← PIN + biometria
│   ├── battery-optimization.ts  ← Isenção de bateria (Android/OEM)
│   ├── register-draft.ts        ← Rascunho do cadastro
│   ├── push-registration.ts     ← Resolve o token de push (Expo) do dispositivo
│   ├── _core/                   ← Sem UI: auth, api, theme, font-scale, session-status
│   └── trpc.ts                  ← Cliente tRPC (React Query)
├── server/
│   ├── _core/                   ← Bootstrap Express, tRPC, sessão JWT, cookies, CORS, env
│   ├── routers.ts               ← system, auth, userData, whatsapp
│   ├── routers-monitoring.ts    ← Dead man's switch (monitoring.*)
│   ├── routers-links.ts         ← Vínculo monitorado↔cuidador (link.*)
│   ├── routers-push.ts          ← Registro de token de push (push.register)
│   ├── {google,apple,email,phone,anonymous}-auth.ts ← Provedores de login
│   ├── monitoring-job.ts        ← Job do dead man's switch (setInterval 5 min)
│   ├── invite-landing.ts        ← Landing de /convite/:token
│   ├── push.ts / db-push.ts     ← Push (Expo) para cuidadores + tokens
│   ├── whatsapp.ts              ← Alertas a contatos via Meta Graph API
│   └── db.ts                    ← Drizzle (MySQL) + migrate() no boot
├── drizzle/
│   ├── schema.ts                ← Schema (users, user_data, account_liveness, ...)
│   └── 0000..0012_*.sql         ← Migrations
├── tests/                       ← Suíte Vitest (38 arquivos, 290 testes)
├── eas.json                     ← Profiles EAS: development/simulator/preview/production
├── vitest.config.ts             ← Vitest com alias @, JSX, __DEV__
└── README.md                    ← Este arquivo
```

---

## Variáveis de Ambiente

### Servidor (Railway)

| Variável | Descrição | Obrigatória |
|---|---|---|
| `DATABASE_URL` | URL do MySQL (fornecida pelo plugin do Railway) | Sim |
| `JWT_SECRET` | Segredo para assinar a sessão JWT (≥ 32 caracteres). Em produção o servidor **se recusa a subir** sem ele — nada de fail-open. | Sim |
| `NODE_ENV` | `production` em produção | Sim |
| `CORS_ORIGIN_ALLOWLIST` | Origens permitidas (ex.: `https://...,vigora://*`) | Recomendado |
| `WHATSAPP_API_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp Business API (alertas a contatos e OTP de telefone) | Recomendado |
| `WHATSAPP_OTP_TEMPLATE_NAME` / `_LANG` | Template de autenticação aprovado no Meta. Sem ele, login por telefone responde 503. | Opcional |
| `RESEND_API_KEY` / `EMAIL_FROM` | Envio dos códigos de e-mail via Resend (domínio verificado). Sem eles, cadastro por e-mail responde 503. | Opcional |
| `APPLE_BUNDLE_ID` | Audience esperada no identity token da Apple (default `com.vigora.saude`) | Opcional |
| `APPLE_TEAM_ID` / `ANDROID_CERT_SHA256` | Emitidos nos arquivos de associação (`/.well-known/*`) dos links universais de convite | Opcional |
| `IOS_APP_STORE_URL` / `ANDROID_PLAY_STORE_URL` | Botões "instale o app" na landing de `/convite/:token` | Opcional |

> Push aos cuidadores usa o serviço público da Expo (`exp.host`) — não requer secret no servidor.

### App (build time, prefixo `EXPO_PUBLIC_`)

| Variável | Descrição | Obrigatória |
|---|---|---|
| `EXPO_PUBLIC_API_BASE_URL` | URL do backend (ex.: `https://api.vigorasaude.com`) | Sim |
| `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` | OAuth Google — Client ID Android (debug e release usam IDs diferentes; ver `eas.json`) | Sim |
| `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` | OAuth Google — Client ID iOS | Sim |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | OAuth Google — Client ID Web/Expo Go | Sim |
| `EXPO_PUBLIC_REVENUECAT_API_KEY` | API key **pública** do RevenueCat (`goog_*` / `appl_*` — nunca a `sk_*`) | Sim |
| `EXPO_PUBLIC_APPLE_SIGNIN_ENABLED` | Liga o botão Apple + o entitlement. Só `"true"` no build de produção. | Não |
| `EXPO_PUBLIC_LINK_HOST` / `EXPO_PUBLIC_LINK_BASE_URL` | Domínio dos links universais de convite (`/convite/<token>`) | Não |

> No build Android de release, o bundle é gerado pelo passo do Gradle — as `EXPO_PUBLIC_*` precisam estar no env **daquele passo**, não só no `export:embed`.

---

## Banco de Dados (Migrations)

```bash
# Gerar migration a partir do schema
pnpm drizzle-kit generate

# Aplicar migrations (requer DATABASE_URL apontando para o MySQL)
pnpm db:push
```

> O servidor **aplica as migrations pendentes no boot** (`migrate()` em `server/db.ts`), com isolamento de erro por passo. Isso existe porque uma migration não aplicada já derrubou o dead man's switch por 27 h sem ninguém perceber — monitore `GET /api/health`, que responde 503 nesse cenário.

> Para rodar migrations a partir do terminal local contra o MySQL do Railway, use a **URL pública** (`MYSQL_PUBLIC_URL`) — o host interno `mysql.railway.internal` só resolve dentro da rede do Railway.

---

## Testes

```bash
# Executar todos os testes
pnpm test

# Executar um arquivo específico
pnpm vitest run tests/session-revocation.test.ts
```

São **290 testes em 38 arquivos**, cobrindo: autenticação (provedores, logout, refresh, revogação e expiração de sessão), autorização do monitoramento, resiliência e inatividade do job do dead man's switch, horários de disparo dos alarmes, check-in diário, vínculo de cuidador, push, CORS, cabeçalhos de segurança, rate limiting, segredos obrigatórios, privacidade de localização e RevenueCat.

---

## Build e Publicação

```bash
# Build de desenvolvimento (Expo Dev Client)
pnpm eas:build:dev

# Build de preview (APK para testes)
pnpm eas:build:preview

# Build de produção
pnpm eas:build:production
```

O bundle injeta as variáveis `EXPO_PUBLIC_*` em tempo de build via GitHub Secrets no workflow de CI. Consulte `docs/BUILD_GUIDE.md` para o guia completo de publicação.

---

## Conformidade e Segurança

Os dados do usuário ficam no dispositivo (AsyncStorage) e são respaldados na infraestrutura própria do Vigora (servidor Node + MySQL no Railway), sempre escopados ao usuário autenticado pelo `openId`. O backup na nuvem (anamnese, contatos, alarmes, configurações e métricas) existe para permitir recuperação após reinstalar o app, e o acesso é protegido por sessão JWT.

Boas práticas de segurança aplicadas: sessões JWT com revogação (`jti`) e TTL deslizante, autorização por posse de **conta** (`openId`) no monitoramento — o `deviceId` não é chave de posse e por isso não é enumerável —, rate limiting (30 req/min em `/api/auth`, 120 req/min no tRPC, limite próprio nos alertas de emergência), allowlist de CORS, cabeçalhos de segurança e recusa de boot em produção sem `JWT_SECRET`.

A conformidade com a **LGPD** é apoiada por consentimento destacado para dados de saúde, consentimento explícito para localização e contatos, minimização de dados, política de privacidade acessível no app com o e-mail do DPO, e exclusão de conta que apaga os dados do servidor (Art. 18 VI).

O Vigora **não é um dispositivo médico**: não classifica, pontua nem interpreta métricas de saúde, e não sugere conduta clínica — ele armazena, exibe, lembra e alerta. Alertas automáticos vão apenas para contatos designados pelo usuário, nunca para 192/193.

---

## Próximos Passos

1. **Publicação nas Lojas** — seguir `docs/BUILD_GUIDE.md` para App Store e Google Play. Os IAPs já existem na App Store Connect; o cadastro no Google Play está em andamento.
2. **RevenueCat:** mover os produtos da Test Store para as lojas reais — enquanto estiverem só na Test Store, o paywall exibe "Sem conexão".
3. **Monitoramento externo do `/api/health`** — hoje ninguém observa o endpoint que detecta o dead man's switch parado.
4. **Testes Beta** — distribuir APK de preview para usuários idosos e validar UX.
5. **Integração com Wearables** — Apple Watch e Wear OS (roadmap v2.0).

---

## Contato e Suporte

- **Repositório:** [github.com/pedropizzolato24/vigora-saude](https://github.com/pedropizzolato24/vigora-saude)
- **Versão:** 1.0.0 (`versionCode`/`buildNumber` gerenciados remotamente pelo EAS)
- **Última Atualização:** Julho de 2026
- **Licença:** Proprietária (Vigora)

> **Aviso:** Este aplicativo não substitui consulta médica profissional. Em caso de emergência, ligue para o SAMU (192) ou Bombeiros (193).
