# Vigora Saúde — Assistente Pessoal de Saúde e Segurança

**Vigora Saúde** é um aplicativo móvel nativo para iOS e Android que funciona como assistente pessoal de saúde e segurança, especialmente projetado para idosos e pessoas com condições de saúde crônicas. O app monitora a saúde do usuário, gerencia medicações através de alarmes inteligentes, facilita o acesso rápido a serviços de emergência e mantém contatos de emergência sempre à mão.

---

## Visão Geral

O Vigora Saúde foi desenvolvido com **Expo SDK 54** (React Native 0.81) e oferece uma experiência mobile-first otimizada para usuários com diferentes níveis de literacia digital. O app combina funcionalidades de saúde, segurança e comunicação em uma interface intuitiva com suporte a modo claro/escuro, ajuste de tamanho de fonte e modo de acessibilidade.

A infraestrutura é **100% própria**: o backend roda em Node.js auto-hospedado no Railway, a autenticação usa **OAuth direto com o Google** (`expo-auth-session`, PKCE) com sessão JWT própria, e os dados do usuário são respaldados na própria conta para sobreviver a uma reinstalação.

### Números-Chave

| Atributo | Valor |
|---|---|
| Plataformas | iOS 14+ e Android 7.0+ (Expo managed workflow) |
| Stack Frontend | React Native 0.81 + Expo Router 6 + NativeWind 4 + TypeScript 5.9 |
| Backend | Node.js + Express + tRPC v11 + MySQL + Drizzle ORM (hospedado no Railway) |
| Autenticação | Google OAuth direto (`expo-auth-session`, PKCE) + sessão JWT própria |
| API | `https://api.vigorasaude.com` |
| Monetização | RevenueCat SDK v10 — Lifetime, Anual, Mensal + trial de 7 dias |
| Testes Automatizados | Suíte com Vitest (auth, segurança, monitoramento, push, RevenueCat) |
| Telas | 10 abas + 5 telas de fluxo (onboarding, login, registro, callback, alarme) + 2 modais |
| Repositório | [github.com/pedropizzolato24/vigora-saude](https://github.com/pedropizzolato24/vigora-saude) |

---

## Fluxo de Autenticação e Cadastro

O app guia o usuário por um funil **onboarding → login → registro** controlado pelo componente `OnboardingGate` no startup:

1. **Onboarding:** slides de apresentação na primeira abertura.
2. **Login (Google):** OAuth direto com o Google via `expo-auth-session` (fluxo **PKCE**). O `expo-web-browser` intercepta o retorno `vigora://oauth/callback`; o cliente troca o código por tokens e envia o `id_token` para `POST /api/auth/google`, que o verifica e emite um **JWT próprio** (Bearer no nativo, cookie na web).
3. **Registro:** novos usuários completam o cadastro informando nome, telefone, **tipo de conta** (cuidador ou monitorado) e, opcionalmente, data de nascimento e tipo sanguíneo. Enquanto o `userType` não é definido, o app roteia para `/register` em vez das abas principais.

### Tipos de Usuário

| Tipo | Descrição |
|---|---|
| **Monitorado** | Usa o app para a própria saúde e segurança. |
| **Cuidador** | Acompanha a saúde de outra pessoa. |

O perfil (nome, telefone, data de nascimento, tipo sanguíneo) é persistido no servidor e pré-preenche a tela "Meu Perfil". Edições no app são salvas via `auth.updateProfile`.

---

## Sincronização na Nuvem (Backup por Conta)

Todos os dados do app são respaldados na conta Google do usuário, permitindo recuperação completa após reinstalar o app:

- **O que é sincronizado:** ficha de anamnese, contatos de emergência, alarmes, configurações e histórico de métricas de saúde.
- **Como funciona:** o estado local é a fonte de verdade; a cada mudança, um snapshot é enviado ao servidor (com debounce de 3s). No login, o app reconcilia local vs. nuvem por **last-write-wins** (`dataUpdatedAt`). Se a cópia da nuvem for mais recente (ex.: após reinstalar), ela hidrata o estado local.
- **Escopo:** o backup é amarrado ao `openId` (conta Google), independente de dispositivo. O acesso é sempre restrito ao usuário autenticado.
- **Exceção:** a foto de perfil permanece somente local (não sincronizada).

> "Limpar Todos os Dados" nas Configurações também propaga o apagamento para o backup. O logout **não** apaga o backup — é justamente isso que viabiliza o restore após reinstalar.

---

## Funcionalidades Principais

### 1. Dashboard (Início)

- **Botão SOS:** acionamento rápido com animação de pulso; modal de confirmação para evitar disparos acidentais.
- **Botão de Ambulância:** pré-configurado com número SUS e dados do plano de saúde; integra WhatsApp para notificar contatos.
- **Cards de Status:** próximos alarmes, últimas métricas, contatos configurados e status do monitoramento.
- **Ações Rápidas:** atalhos para Alarmes, Métricas, Contatos e Configurações.
- **TrialBanner / ExpiredBanner:** contagem regressiva do trial e chamada para assinar após expiração.

### 2. Alarmes (Medicações)

- **CRUD de Alarmes** com confirmação de exclusão.
- **Agendamento Flexível:** diário, dias úteis, fins de semana, dias personalizados.
- **Notificações Nativas:** no Android os alarmes disparam via AlarmManager nativo (`expo-alarm-module`); no iOS/Web via `expo-notifications`.
- **Full-Screen Alarm:** tela cheia com contador regressivo e botão de confirmação.
- **Escalação Automática:** se não confirmado, o servidor avisa os contatos de emergência por WhatsApp (com localização GPS) e envia push em tempo real aos cuidadores vinculados.
- **Limite Gratuito:** 5 alarmes no plano gratuito; ilimitados no Vigora Pro.

### 3. Saúde (Métricas)

- **Tipos:** pressão arterial, frequência cardíaca, glicemia, peso, temperatura, oxigenação (SpO2).
- **Histórico:** últimas entradas no plano gratuito; histórico completo no Pro.
- **Persistência:** local (AsyncStorage) com backup na conta do usuário.

### 4. Contatos de Emergência

- **CRUD de Contatos:** nome, telefone, relação, email e toggle WhatsApp.
- **Importação da Agenda:** via `expo-contacts` com validação de duplicatas.
- **Monitoramento:** contatos são registrados no servidor para uso pelo dead man's switch.
- **Limite Gratuito:** 3 contatos; ilimitados no Vigora Pro.

### 5. Anamnese (Ficha Médica)

- **Campos:** nome, data de nascimento, gênero, alergias, medicações, doenças crônicas, número SUS, plano de saúde e operadora.
- **Exportação PDF:** PDF profissional com logo e QR code (exclusivo Vigora Pro).
- **Compartilhamento:** via `expo-sharing` (WhatsApp, email, etc.).

### 6. Configurações

- **Tema:** claro/escuro.
- **Tamanho de Fonte** e **Modo de Acessibilidade** (alto contraste, fontes maiores, layout simplificado).
- **Monitoramento Contínuo** (exclusivo Pro).
- **Vigora Pro:** assinar / gerenciar assinatura.
- **Limpar Todos os Dados.**

---

## Modelo de Monetização (RevenueCat)

Modelo freemium com assinatura gerenciada pelo RevenueCat SDK v10.

### Plano Gratuito vs. Vigora Pro

| Recurso | Gratuito | Vigora Pro |
|---|---|---|
| Contatos de emergência | 3 | Ilimitados |
| Alarmes de medicação | 5 | Ilimitados |
| Histórico de métricas | Limitado | Completo |
| Exportação PDF da Anamnese | Bloqueado | Liberado |
| Monitoramento contínuo | Bloqueado | Liberado |
| Suporte | Padrão | Prioritário |

### Opções de Assinatura

| Plano | Duração | Preço Sugerido |
|---|---|---|
| Lifetime | Permanente | R$ 99,90 |
| Yearly | 1 ano | R$ 29,90/ano |
| Monthly | 1 mês | R$ 4,90/mês |

### Trial de 7 Dias

Novos usuários recebem trial de 7 dias do Vigora Pro. Durante o trial, `isTrialActive` e `trialDaysLeft` são expostos pelo `PurchasesContext` e o **TrialBanner** aparece no Dashboard; após expirar, o **ExpiredBanner** convoca a assinatura.

### Upsell Contextual

Ao tentar usar um recurso bloqueado, o `ProUpsellModal` aparece com benefícios Pro e atalho para o paywall nativo.

---

## Arquitetura de Backend

### Servidor (Node.js + Express + tRPC + MySQL)

Auto-hospedado no **Railway** (`https://api.vigorasaude.com`). Responsável por autenticação, perfil, backup de dados, monitoramento contínuo (dead man's switch) e envio de alertas.

**Routers tRPC:**
- `auth.me` / `auth.completeRegistration` / `auth.updateProfile` / `auth.logout` — sessão e perfil.
- `userData.get` / `userData.put` — backup/restore do estado do app por conta.
- `monitoring.*` — registro de dispositivo, heartbeat, sync de alarmes, eventos e histórico (todas autenticadas e amarradas ao `openId`).
- `link.*` — vínculo monitorado↔cuidador (convites por código/QR/link, alertas do monitorado).
- `push.register` — registro do token de push (Expo) do cuidador.
- `whatsapp.sendEmergencyAlert` / `whatsapp.isConfigured` — alertas de emergência via WhatsApp.

**Rotas REST de auth:** `GET /api/auth/me`, `POST /api/auth/logout`, `POST /api/auth/session`, e `POST /api/auth/google` (verifica o `id_token` do Google e emite o JWT próprio).

**Canais de alerta:** WhatsApp Business API para os **contatos de emergência** + push (Expo) em tempo real para os **cuidadores vinculados**. São conjuntos de destinatários independentes.

### Dead Man's Switch

Detecta quando o usuário não responde a um alarme e aciona os contatos de emergência. Roda no próprio servidor via `monitoring-job.ts`, iniciado em processo no boot do servidor com `setInterval` de 5 minutos.

**Tabelas (MySQL / Drizzle ORM):**

| Tabela | Descrição |
|---|---|
| `users` | Conta do usuário: `openId`, nome, email, telefone, `userType`, data de nascimento, tipo sanguíneo. |
| `user_data` | Backup do estado do app por conta (anamnese, contatos, alarmes, settings, métricas) + `dataUpdatedAt`. |
| `app_users` | Dispositivo registrado (`deviceId`) com contatos de emergência e última localização. |
| `synced_alarms` | Espelho dos alarmes do app por dispositivo. |
| `alarm_events` | Eventos de disparo de alarme (pending/responded/missed/not_sent). |
| `device_heartbeat` | Último "estou vivo" por dispositivo. |
| `warning_log` | Registro de avisos enviados aos contatos. |
| `caregiver_links` | Vínculo persistente monitorado↔cuidador (`active`/`revoked`). |
| `link_invites` | Convites efêmeros de vínculo (código/QR/link), single-use. |
| `push_tokens` | Tokens de push (Expo) por conta — usados para alertar cuidadores. |

> Uma arquitetura anterior usava Supabase (Auth + Edge Function `check-missed-alarms`) para o dead man's switch. O Supabase foi **removido**: autenticação e monitoramento são servidos pelo backend Node no Railway.

---

## Estrutura de Pastas

```
vigora-saude/
├── app/
│   ├── _layout.tsx              ← Root layout (providers, OnboardingGate, Stack)
│   ├── onboarding.tsx           ← Slides de apresentação
│   ├── login.tsx                ← Login com Google
│   ├── register.tsx             ← Cadastro (tipo de conta, nome, telefone, etc.)
│   ├── alarm-ring.tsx           ← Tela cheia de alarme disparado
│   ├── (tabs)/
│   │   ├── index.tsx            ← Dashboard
│   │   ├── alarms.tsx           ← Alarmes (limite 5 gratuito)
│   │   ├── health.tsx           ← Métricas de saúde
│   │   ├── contacts.tsx         ← Contatos (limite 3 gratuito)
│   │   ├── anamnesis.tsx        ← Anamnese (PDF bloqueado no gratuito)
│   │   ├── ambulance.tsx        ← Ambulância / SUS
│   │   ├── location.tsx         ← Localização
│   │   ├── help.tsx             ← Ajuda
│   │   ├── profile.tsx          ← Meu Perfil (sincronizado com o servidor)
│   │   └── settings.tsx         ← Configurações
│   ├── (caregiver-tabs)/        ← Fluxo do cuidador (início, alertas, pessoa, vínculo, config)
│   │   └── _layout.tsx          ← Tabs do cuidador + registro do token de push
│   └── (modal)/
│       ├── paywall.tsx          ← RevenueCat Paywall nativo
│       └── customer-center.tsx  ← RevenueCat Customer Center
├── components/
│   ├── onboarding-gate.tsx      ← Funil onboarding → login → registro
│   ├── monitoring-initializer.tsx ← Registro de device + heartbeat + sync de alarmes
│   ├── caregiver-push-initializer.tsx ← Registra o token de push do cuidador
│   ├── pro-gate.tsx             ← ProGate, ProBanner, ProLimitBadge
│   └── pro-upsell-modal.tsx     ← Upsell contextual
├── hooks/
│   ├── use-auth.ts              ← Sessão/usuário (Bearer no nativo, cookie na web)
│   └── use-purchases.ts         ← Estado RevenueCat
├── lib/
│   ├── app-context.tsx          ← Estado global + reconcile/push do cloud backup
│   ├── cloud-sync.ts            ← pullCloudData / pushCloudData (userData tRPC)
│   ├── monitoring-service.ts    ← Cliente do dead man's switch (tRPC via HTTP)
│   ├── push-registration.ts     ← Resolve o token de push (Expo) do dispositivo
│   ├── _core/auth.ts            ← Token de sessão e cache do usuário
│   ├── _core/api.ts             ← Helper de chamadas autenticadas
│   └── trpc.ts                  ← Cliente tRPC (React Query)
├── server/
│   ├── _core/                   ← Bootstrap Express, tRPC, sessão JWT, cookies, env
│   ├── routers.ts               ← auth, userData, whatsapp, push
│   ├── routers-monitoring.ts    ← Dead man's switch (monitoring.*)
│   ├── routers-links.ts         ← Vínculo monitorado↔cuidador (link.*)
│   ├── routers-push.ts          ← Registro de token de push (push.register)
│   ├── push.ts / db-push.ts     ← Push (Expo) para cuidadores + tokens
│   ├── whatsapp.ts              ← Alertas a contatos via Meta Graph API
│   ├── google-auth.ts           ← Verifica id_token do Google → JWT próprio
│   └── db.ts                    ← Drizzle (MySQL) + queries
├── drizzle/
│   ├── schema.ts                ← Schema (users, user_data, app_users, push_tokens, ...)
│   └── 0000..0008_*.sql         ← Migrations
├── tests/                       ← Suíte Vitest (auth, monitoring, segurança, RevenueCat, ...)
├── eas.json                     ← Profiles EAS: development/preview/production
├── vitest.config.ts             ← Vitest com alias @, JSX, __DEV__
└── README.md                    ← Este arquivo
```

---

## Variáveis de Ambiente

### Servidor (Railway)

| Variável | Descrição | Obrigatória |
|---|---|---|
| `DATABASE_URL` | URL do MySQL (fornecida pelo plugin do Railway) | Sim |
| `JWT_SECRET` | Segredo para assinar a sessão JWT (≥ 32 caracteres) | Sim |
| `NODE_ENV` | `production` em produção | Sim |
| `CORS_ORIGIN_ALLOWLIST` | Origens permitidas (ex.: `https://...,vigora://*`) | Recomendado |
| `WHATSAPP_API_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp Business API (alertas a contatos) | Recomendado |

> Push aos cuidadores usa o serviço público da Expo (`exp.host`) — não requer secret no servidor.

### App (build time, prefixo `EXPO_PUBLIC_`)

| Variável | Descrição | Obrigatória |
|---|---|---|
| `EXPO_PUBLIC_API_BASE_URL` | URL do backend (ex.: `https://api.vigorasaude.com`) | Sim |
| `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` | OAuth Google — Client ID Android | Sim |
| `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` | OAuth Google — Client ID iOS | Sim |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | OAuth Google — Client ID Web/Expo Go | Sim |
| `EXPO_PUBLIC_REVENUECAT_API_KEY` | API key do RevenueCat | Sim |

---

## Banco de Dados (Migrations)

```bash
# Gerar migration a partir do schema
pnpm drizzle-kit generate

# Aplicar migrations (requer DATABASE_URL apontando para o MySQL)
pnpm db:push
```

> Para rodar migrations a partir do terminal local contra o MySQL do Railway, use a **URL pública** (`MYSQL_PUBLIC_URL`) — o host interno `mysql.railway.internal` só resolve dentro da rede do Railway.

---

## Testes

```bash
# Executar todos os testes
pnpm test

# Executar um arquivo específico
pnpm vitest run tests/session-revocation.test.ts
```

A suíte cobre autenticação e revogação de sessão, autorização do monitoramento, CORS e cabeçalhos de segurança, rate limiting, privacidade de localização e RevenueCat.

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

Os dados do usuário ficam no dispositivo (AsyncStorage) e são respaldados na infraestrutura própria do Vigora Saúde (servidor Node + MySQL no Railway), sempre escopados ao usuário autenticado pelo `openId`. O backup na nuvem (anamnese, contatos, alarmes, configurações e métricas) existe para permitir recuperação após reinstalar o app, e o acesso é protegido por sessão JWT.

Boas práticas de segurança aplicadas: sessões JWT com revogação (`jti`), autorização por propriedade de dispositivo no monitoramento (previne enumeração de `deviceId`), rate limiting nos alertas de emergência, allowlist de CORS e cabeçalhos de segurança. A conformidade com a **LGPD** é apoiada por consentimento explícito para localização e contatos e minimização de dados.

---

## Próximos Passos

1. **Aplicar migrations no Railway MySQL** (incluindo a tabela `user_data`).
2. **Configurar Google OAuth** (Client IDs Android/iOS/Web + redirect `vigora://oauth/callback`).
3. **Publicação nas Lojas** — seguir `docs/BUILD_GUIDE.md` para App Store e Google Play.
4. **Testes Beta** — distribuir APK de preview para usuários idosos e validar UX.
5. **Integração com Wearables** — Apple Watch e Wear OS (roadmap v2.0).

---

## Contato e Suporte

- **Repositório:** [github.com/pedropizzolato24/vigora-saude](https://github.com/pedropizzolato24/vigora-saude)
- **Versão:** 1.0.0
- **Última Atualização:** Maio de 2026
- **Licença:** Proprietária (Vigora Saúde)

> **Aviso:** Este aplicativo não substitui consulta médica profissional. Em caso de emergência, ligue para o SAMU (192) ou Bombeiros (193).
