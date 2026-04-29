# Vigora Saúde — Assistente Pessoal de Saúde e Segurança

**Vigora Saúde** é um aplicativo móvel nativo para iOS e Android que funciona como assistente pessoal de saúde e segurança, especialmente projetado para idosos e pessoas com condições de saúde crônicas. O app monitora a saúde do usuário, gerencia medicações através de alarmes inteligentes, facilita o acesso rápido a serviços de emergência e mantém contatos de emergência sempre à mão.

---

## Visão Geral

O Vigora Saúde foi desenvolvido com **Expo SDK 54** (React Native 0.81) e oferece uma experiência mobile-first otimizada para usuários com diferentes níveis de literacia digital. O app combina funcionalidades de saúde, segurança e comunicação em uma interface intuitiva com suporte a modo claro/escuro, ajuste de tamanho de fonte e modo de acessibilidade.

### Números-Chave

| Atributo | Valor |
|---|---|
| Plataformas | iOS 14+ e Android 7.0+ (Expo managed workflow) |
| Stack Frontend | React Native 0.81 + Expo Router 6 + NativeWind 4 + TypeScript 5.9 |
| Backend Principal | Node.js + Express + tRPC + PostgreSQL + Drizzle ORM |
| Backend Dead Man's Switch | Supabase (PostgreSQL + Edge Functions + pg_cron) |
| Monetização | RevenueCat SDK v10 — Lifetime, Anual, Mensal + trial de 7 dias |
| Testes Automatizados | 38 testes com Vitest |
| Telas | 8 principais + 5 modais especializadas |
| Repositório | [github.com/pedropizzolato24/vigora-saude](https://github.com/pedropizzolato24/vigora-saude) |

---

## Funcionalidades Principais

### 1. Dashboard (Início)

A tela inicial apresenta um resumo visual da saúde do usuário com:

- **Botão SOS:** Acionamento rápido com animação de pulso contínuo; abre modal de confirmação para evitar acionamentos acidentais.
- **Botão de Ambulância:** Pré-configurado com número SUS e dados do plano de saúde; integrado com WhatsApp para notificação de contatos de emergência.
- **Cards de Status:** Exibem próximos alarmes, últimas métricas de saúde, contatos de emergência configurados e status do monitoramento.
- **Ações Rápidas:** Botões para acessar Alarmes, Métricas, Contatos e Configurações com ícones e indicadores visuais.
- **TrialBanner:** Exibido durante o período de trial de 7 dias (azul, com contagem regressiva de dias restantes).
- **ExpiredBanner:** Exibido após expiração do trial (vermelho, com chamada de urgência para assinar).

### 2. Alarmes (Medicações)

Sistema completo de agendamento de medicações com notificações em tempo real:

- **CRUD de Alarmes:** Criar, editar, visualizar e deletar alarmes com confirmação de exclusão.
- **Agendamento Flexível:** Suporte para repetição diária, dias úteis, fins de semana, dias personalizados (seg-dom) e uma única vez.
- **Notificações Nativas (Bugfix):** No Android, os alarmes são disparados exclusivamente pelo AlarmManager nativo (sem duplicação via expo-notifications). No iOS e Web, o agendamento usa expo-notifications normalmente. Textos das notificações exibem o nome real do alarme.
- **Full-Screen Alarm:** Quando disparado, o alarme exibe tela cheia com ícone pulsante, nome/descrição da medicação, contador regressivo (2 minutos) e botão de confirmação.
- **Escalação Automática:** Se não confirmado em 2-3 minutos, envia WhatsApp automático para todos os contatos de emergência com localização GPS.
- **Sincronização Supabase:** Alarmes são sincronizados com o backend Supabase para o dead man's switch.
- **Limite Gratuito:** 5 alarmes no plano gratuito; ilimitados no Vigora Pro.

### 3. Saúde (Métricas)

Rastreamento de métricas de saúde com histórico e visualização:

- **Tipos de Métricas:** Pressão arterial (sistólica/diastólica), frequência cardíaca, glicemia, peso, temperatura, oxigenação (SpO2).
- **Entrada de Dados:** Formulário simples com campos numéricos, unidades automáticas e data/hora.
- **Histórico:** Visualização em lista com últimas 30 entradas no plano gratuito; histórico completo no Pro.
- **Armazenamento Local:** Todos os dados persistem no AsyncStorage do dispositivo.

### 4. Contatos de Emergência

Gerenciador de contatos com importação da agenda do dispositivo:

- **CRUD de Contatos:** Nome, telefone, relação (mãe, pai, filho, amigo, médico, etc.), email e toggle WhatsApp.
- **Importação da Agenda:** Integração com `expo-contacts` para importar contatos do dispositivo com validação de duplicatas.
- **Sincronização Supabase:** Contatos são sincronizados com o backend para uso pelo dead man's switch.
- **Limite Gratuito:** 3 contatos no plano gratuito; ilimitados no Vigora Pro.

### 5. Anamnese (Ficha Médica)

Formulário completo de histórico médico para compartilhamento com profissionais:

- **Campos:** Nome completo, data de nascimento, gênero, alergias, medicações em uso, doenças crônicas, número SUS, número do plano de saúde e operadora.
- **Exportação PDF:** Gera PDF profissional com logo do app, dados formatados e QR code (exclusivo Vigora Pro).
- **Compartilhamento:** Integração com `expo-sharing` para enviar PDF via WhatsApp, email ou outros apps.

### 6. Configurações

Painel completo de preferências e personalizações:

- **Tema:** Toggle entre modo claro/escuro (padrão: claro).
- **Tamanho de Fonte:** Pequeno, médio (padrão), grande — aplicado globalmente.
- **Modo de Acessibilidade:** Ativa modo com fontes maiores, espaçamento aumentado, cores de alto contraste e navegação simplificada.
- **Monitoramento Contínuo:** Recebe alertas quando alarmes não são respondidos (exclusivo Pro).
- **Vigora Pro:** Card com botão "Assinar" (gratuito) ou "Gerenciar Assinatura" (Pro).

---

## Modelo de Monetização (RevenueCat)

O Vigora Saúde oferece um modelo freemium com assinatura gerenciada pelo RevenueCat SDK v10.

### Plano Gratuito vs. Vigora Pro

| Recurso | Gratuito | Vigora Pro |
|---|---|---|
| Contatos de emergência | 3 | Ilimitados |
| Alarmes de medicação | 5 | Ilimitados |
| Histórico de métricas | 30 dias | Completo |
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

Novos usuários recebem automaticamente um trial de 7 dias do Vigora Pro. Durante o trial:

- `isTrialActive = true` e `trialDaysLeft` (1-7) são expostos pelo `PurchasesContext`.
- O **TrialBanner** (azul) é exibido no Dashboard com contagem regressiva.
- Após expiração, o **ExpiredBanner** (vermelho) é exibido com chamada de urgência.

### Upsell Contextual

Quando o usuário tenta usar um recurso bloqueado (ex: adicionar 4º contato), o `ProUpsellModal` aparece com animação bottom sheet, ícone do recurso, lista de benefícios Pro e botão direto para o paywall nativo.

---

## Arquitetura de Backend

### Servidor Principal (Node.js + tRPC)

Responsável por monitoramento contínuo, envio de alertas WhatsApp/Email/SMS e webhooks do RevenueCat.

**Rotas tRPC:**
- `monitoring.getStatus` — Status do monitoramento contínuo por device.
- `monitoring.registerDevice` — Registra dispositivo e contatos para monitoramento.
- `whatsapp.sendEmergencyAlert` — Envio de mensagens via WhatsApp Business API.
- `webhooks.revenuecat` — Webhook para eventos de compra/cancelamento.

**Fallback de Alertas (cascata):** WhatsApp Business API → Email (Resend API) → SMS (Twilio).

### Dead Man's Switch (Supabase)

Sistema de segurança que detecta quando o usuário não responde a um alarme e aciona contatos de emergência automaticamente.

**Tabelas:**

| Tabela | Descrição |
|---|---|
| `users` | Dispositivos registrados com `device_id` e `last_seen_at` |
| `alarms` | Alarmes sincronizados do app (espelho do AsyncStorage) |
| `alarm_events` | Eventos de disparo de alarme com `response_type` (dismissed/snoozed/missed) |
| `emergency_contacts` | Contatos de emergência por usuário |

**Edge Function `check-missed-alarms`:** Executada a cada 2 minutos via `pg_cron`. Verifica eventos de alarme sem resposta após 5 minutos e envia alertas WhatsApp para os contatos de emergência via Meta Graph API.

**Configuração necessária:**
1. Executar `supabase/schema.sql` no painel Supabase (SQL Editor).
2. Deploy da Edge Function: `supabase functions deploy check-missed-alarms`.
3. Configurar secrets: `SUPABASE_SERVICE_ROLE_KEY`, `WHATSAPP_API_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`.

---

## Estrutura de Pastas

```
vigora-saude/
├── app/
│   ├── _layout.tsx              ← Root layout com PurchasesProvider
│   ├── (tabs)/
│   │   ├── index.tsx            ← Dashboard (TrialBanner, ExpiredBanner)
│   │   ├── alarms.tsx           ← Alarmes (limite 5 gratuito)
│   │   ├── contacts.tsx         ← Contatos (limite 3 gratuito)
│   │   ├── anamnesis.tsx        ← Anamnese (PDF bloqueado no gratuito)
│   │   └── settings.tsx         ← Configurações (MonitoringPanel, card Pro)
│   └── (modal)/
│       ├── paywall.tsx          ← RevenueCat Paywall nativo
│       └── customer-center.tsx  ← RevenueCat Customer Center
├── components/
│   ├── pro-gate.tsx             ← ProGate, ProBanner, ProLimitBadge
│   ├── pro-upsell-modal.tsx     ← Modal de upsell contextual (bottom sheet)
│   └── trial-banner.tsx         ← TrialBanner (azul) e ExpiredBanner (vermelho)
├── context/
│   └── purchases-context.tsx    ← PurchasesProvider (isPro, isTrialActive, trialDaysLeft)
├── hooks/
│   └── use-purchases.ts         ← Hook usePurchases()
├── lib/
│   ├── app-context.tsx          ← Global state + Supabase sync
│   ├── purchases.ts             ← RevenueCat SDK (inicialização, entitlement)
│   ├── supabase.ts              ← Cliente Supabase (lazy init)
│   ├── device-id.ts             ← Device ID persistente via AsyncStorage
│   ├── supabase-sync.ts         ← syncUser, syncAlarms, syncContacts, sendHeartbeat
│   ├── alarm-sync.ts            ← Sincronização de alarmes (Android: nativo; iOS: expo-notifications)
│   └── native-alarm-manager.ts  ← AlarmManager nativo Android
├── supabase/
│   ├── schema.sql               ← Schema SQL (tabelas, RLS, índices, cron)
│   └── functions/
│       └── check-missed-alarms/ ← Edge Function dead man's switch
├── tests/
│   ├── purchases_isolated.test.ts ← 35 testes RevenueCat
│   └── supabase-credentials.test.ts ← 3 testes de credenciais Supabase
├── docs/
│   ├── ARCHITECTURE.md
│   ├── BUILD_GUIDE.md
│   ├── REVENUECAT_SETUP.md
│   └── DEVELOPMENT_PROCESS.md
├── eas.json                     ← Profiles EAS: development/simulator/preview/production
├── vitest.config.ts             ← Vitest com alias @, JSX, __DEV__
└── README.md                    ← Este arquivo
```

---

## Variáveis de Ambiente

| Variável | Descrição | Obrigatória |
|---|---|---|
| `EXPO_PUBLIC_REVENUECAT_API_KEY` | API key de produção do RevenueCat | Sim |
| `EXPO_PUBLIC_SUPABASE_URL` | URL do projeto Supabase | Sim (dead man's switch) |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Chave anônima do Supabase | Sim (dead man's switch) |
| `RESEND_API_KEY` | API key do Resend para emails de alerta | Recomendado |
| `TWILIO_ACCOUNT_SID` | SID da conta Twilio para SMS | Recomendado |
| `TWILIO_AUTH_TOKEN` | Token de autenticação Twilio | Recomendado |
| `TWILIO_FROM_NUMBER` | Número Twilio para envio de SMS | Recomendado |

---

## Testes

```bash
# Executar todos os testes
pnpm test

# Executar testes específicos
pnpm vitest run tests/purchases_isolated.test.ts
pnpm vitest run tests/supabase-credentials.test.ts
```

**Cobertura atual:** 38 testes passando — 35 de RevenueCat + 3 de credenciais Supabase.

---

## Build e Publicação

```bash
# Build de desenvolvimento (com Expo Dev Client)
pnpm eas:build:dev

# Build de preview (APK para testes)
pnpm eas:build:preview

# Build de produção
pnpm eas:build:prod
```

Consulte `docs/BUILD_GUIDE.md` para o guia completo de publicação nas lojas.

---

## Conformidade e Segurança

O Vigora Saúde foi desenvolvido com atenção à privacidade dos dados de saúde. Todos os dados pessoais e de saúde são armazenados localmente no dispositivo do usuário (AsyncStorage), sem sincronização automática com servidores externos. A sincronização com o Supabase é limitada a dados operacionais do dead man's switch (alarmes, heartbeat, contatos de emergência) e não inclui métricas de saúde ou dados médicos da anamnese.

A conformidade com a **LGPD (Lei Geral de Proteção de Dados)** é garantida através de política de privacidade clara, consentimento explícito para uso de localização e contatos, e minimização de dados coletados pelo servidor.

---

## Próximos Passos

1. **Executar schema SQL no Supabase** — Colar `supabase/schema.sql` no SQL Editor do painel Supabase.
2. **Deploy da Edge Function** — `supabase functions deploy check-missed-alarms --project-ref SEU_REF`.
3. **Publicação nas Lojas** — Seguir `docs/BUILD_GUIDE.md` para submissão ao App Store e Google Play.
4. **Testes Beta** — Distribuir APK de preview para grupo de usuários idosos para validar UX.
5. **Integração com Wearables** — Sincronização com Apple Watch e Wear OS (roadmap v2.0).

---

## Contato e Suporte

- **Repositório:** [github.com/pedropizzolato24/vigora-saude](https://github.com/pedropizzolato24/vigora-saude)
- **Versão:** 1.0.0
- **Última Atualização:** Abril de 2026
- **Licença:** Proprietária (Vigora Saúde)

> **Aviso:** Este aplicativo não substitui consulta médica profissional. Em caso de emergência, ligue para o SAMU (192) ou Bombeiros (193).
