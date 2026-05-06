# Vigora Saúde — Assistente Pessoal de Saúde e Segurança

**Vigora Saúde** é um aplicativo móvel nativo para iOS e Android que funciona como assistente pessoal de saúde e segurança, especialmente projetado para idosos e pessoas com condições de saúde crônicas. O app monitora a saúde do usuário, gerencia medicações através de alarmes inteligentes, facilita o acesso rápido a serviços de emergência e mantém contatos de emergência sempre à mão.

---

## Visão Geral

O Vigora Saúde foi desenvolvido com **Expo SDK 54** (React Native 0.81, New Architecture ativada) e oferece uma experiência mobile-first otimizada para usuários com diferentes níveis de literacia digital. O app combina funcionalidades de saúde, segurança, comunicação e monitoramento remoto em uma interface intuitiva com suporte a modo claro/escuro, ajuste de tamanho de fonte e modo de acessibilidade.

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
| Modos de Uso | Usuário monitorado + Cuidador (modos separados) |
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
- **Notificações Nativas:** No Android, alarmes usam `expo-notifications` (fallback confiável após exclusão do `expo-alarm-module` por incompatibilidade com New Architecture). No iOS, agendamento via `expo-notifications` normalmente.
- **Full-Screen Alarm:** Quando disparado, o alarme exibe tela cheia com ícone pulsante, nome/descrição da medicação, contador regressivo e botão de confirmação.
- **Escalação Automática:** Se não confirmado, envia WhatsApp automático para todos os contatos de emergência com localização GPS.
- **Sincronização com Servidor:** Alarmes sincronizados com o backend para o dead man's switch.
- **Notificação para Cuidadores:** Alarmes não respondidos disparam push notifications para os cuidadores vinculados.
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
- **Sincronização com Servidor:** Contatos são sincronizados com o backend para uso pelo dead man's switch.
- **Limite Gratuito:** 3 contatos no plano gratuito; ilimitados no Vigora Pro.

### 5. Anamnese (Ficha Médica)

Formulário completo de histórico médico para compartilhamento com profissionais:

- **Campos:** Nome completo, data de nascimento, gênero, alergias, medicações em uso, doenças crônicas, número SUS, número do plano de saúde e operadora.
- **Exportação PDF:** Gera PDF profissional com logo do app, dados formatados e QR code (exclusivo Vigora Pro).
- **Compartilhamento:** Integração com `expo-sharing` para enviar PDF via WhatsApp, email ou outros apps.

### 6. Sistema de Cuidadores

Modo dedicado para familiares/cuidadores acompanharem remotamente o usuário monitorado:

- **Seleção de Modo:** Na abertura, o usuário escolhe entre "Usuário Monitorado" e "Cuidador".
- **Vinculação por Código:** O usuário monitorado gera um código de convite (6 dígitos, expira em 24h); o cuidador insere o código para se vincular.
- **Status em Tempo Real:** Cuidador visualiza status de saúde, último alarme, localização (se compartilhada) e data/hora do último sinal de vida.
- **Push Notifications:** Quando um alarme não é respondido, o servidor envia push notification para todos os cuidadores vinculados via Expo Push API.
- **Registro de Token:** Push token do cuidador registrado no servidor via `caregiver.registerPushToken`.
- **Gerenciamento de Vínculos:** Usuário monitorado pode ver e remover cuidadores vinculados nas Configurações.

### 7. Widgets Android

Widgets de tela inicial para acesso rápido (temporariamente desabilitados por diagnóstico de compatibilidade):

- **NextAlarm:** Exibe o próximo alarme de medicamento.
- **Sos:** Botão de emergência rápida.
- **Health:** Métricas de saúde (FC, PA, Glicemia).

### 8. Configurações

Painel completo de preferências e personalizações:

- **Tema:** Toggle entre modo claro/escuro (padrão: claro).
- **Tamanho de Fonte:** Pequeno, médio (padrão), grande — aplicado globalmente.
- **Modo de Acessibilidade:** Ativa modo com fontes maiores, espaçamento aumentado, cores de alto contraste e navegação simplificada.
- **Monitoramento Contínuo:** Recebe alertas quando alarmes não são respondidos (exclusivo Pro).
- **Seção Cuidadores:** Gera código de convite, exibe código ativo (com botão copiar) e lista cuidadores vinculados com opção de remoção.
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

---

## Arquitetura de Backend

### Servidor Principal (Node.js + tRPC)

Responsável por monitoramento contínuo, sistema de cuidadores, push notifications e webhooks do RevenueCat.

**Rotas tRPC:**

| Rota | Descrição |
|---|---|
| `monitoring.getStatus` | Status do monitoramento contínuo por device |
| `monitoring.registerDevice` | Registra dispositivo e contatos para monitoramento |
| `monitoring.syncAlarms` | Sincroniza alarmes com o servidor |
| `caregiver.generateCode` | Gera código de convite para cuidador (6 dígitos, expira em 24h) |
| `caregiver.getActiveCode` | Retorna código ativo do usuário monitorado |
| `caregiver.linkWithCode` | Vincula cuidador ao usuário monitorado via código |
| `caregiver.getMonitoredStatus` | Retorna status do monitorado para o cuidador |
| `caregiver.unlinkMonitored` | Remove vínculo (ação do cuidador) |
| `caregiver.getLinkedCaregivers` | Lista cuidadores vinculados (ação do monitorado) |
| `caregiver.removeCaregiver` | Remove cuidador específico (ação do monitorado) |
| `caregiver.registerPushToken` | Registra push token do dispositivo cuidador |
| `whatsapp.sendEmergencyAlert` | Envio de mensagens via WhatsApp Business API |
| `webhooks.revenuecat` | Webhook para eventos de compra/cancelamento |

**Push Notifications para Cuidadores:**
- Quando um alarme não é respondido, `monitoring-job.ts` recupera os tokens dos cuidadores e envia push via Expo Push API (`https://exp.host/--/api/v2/push/send`).
- Envio em lotes de até 100 tokens por requisição.
- Implementado em `server/push-notifications.ts`.

**Fallback de Alertas (cascata):** WhatsApp Business API → Email (Resend API) → SMS (Twilio).

### Dead Man's Switch (Supabase)

Sistema de segurança que detecta quando o usuário não responde a um alarme e aciona contatos de emergência automaticamente.

**Tabelas principais:**

| Tabela | Descrição |
|---|---|
| `users` | Dispositivos registrados com `device_id` e `last_seen_at` |
| `alarms` | Alarmes sincronizados do app (espelho do AsyncStorage) |
| `alarm_events` | Eventos de disparo de alarme com `response_type` (dismissed/snoozed/missed) |
| `emergency_contacts` | Contatos de emergência por usuário |
| `caregiving_links` | Vínculos entre cuidadores e usuários monitorados |
| `caregiver_invite_codes` | Códigos de convite temporários (expira em 24h) |
| `caregiver_push_tokens` | Push tokens dos dispositivos cuidadores |

---

## Estrutura de Pastas

```
vigora-saude/
├── app/
│   ├── _layout.tsx              ← Root layout (ErrorBoundary, CrashReportViewer, providers)
│   ├── mode-select.tsx          ← Seleção de modo: Usuário ou Cuidador
│   ├── onboarding/              ← Fluxo de onboarding
│   ├── alarm-ring.tsx           ← Tela full-screen do alarme
│   ├── (tabs)/
│   │   ├── index.tsx            ← Dashboard
│   │   ├── alarms.tsx           ← Alarmes (limite 5 gratuito)
│   │   ├── contacts.tsx         ← Contatos (limite 3 gratuito)
│   │   ├── anamnesis.tsx        ← Anamnese (PDF bloqueado no gratuito)
│   │   └── settings.tsx         ← Configurações + Seção Cuidadores
│   ├── (caregiver)/             ← Modo Cuidador (navegação separada)
│   │   ├── _layout.tsx          ← Layout cuidador + push token registration
│   │   └── ...                  ← Telas do modo cuidador
│   └── (modal)/
│       ├── paywall.tsx          ← RevenueCat Paywall nativo
│       └── customer-center.tsx  ← RevenueCat Customer Center
├── components/
│   ├── alarm-sync-initializer.tsx     ← Sincroniza alarmes no startup
│   ├── alarm-notification-handler.tsx ← Intercepta notificações de alarme
│   ├── crash-report-viewer.tsx        ← Exibe crash do nativo (fallback React)
│   ├── monitoring-initializer.tsx     ← Inicia monitoramento contínuo
│   ├── onboarding-gate.tsx            ← Verifica se onboarding foi concluído
│   ├── monitoring-status-panel.tsx    ← Painel de status de monitoramento
│   ├── pro-gate.tsx                   ← ProGate, ProBanner, ProLimitBadge
│   ├── pro-upsell-modal.tsx           ← Modal de upsell contextual
│   └── trial-banner.tsx               ← TrialBanner e ExpiredBanner
├── context/
│   └── purchases-context.tsx    ← PurchasesProvider (isPro, isTrialActive, trialDaysLeft)
├── lib/
│   ├── app-context.tsx          ← Global state + sincronização
│   ├── caregiver-context.tsx    ← Context do modo cuidador (tRPC real)
│   ├── user-mode-context.tsx    ← Context do modo de uso (usuário/cuidador)
│   ├── monitoring-service.ts    ← Serviço de monitoramento (tRPC)
│   ├── push-token.ts            ← Gestão de Expo push token
│   ├── purchases.ts             ← RevenueCat SDK
│   ├── alarm-sync.ts            ← Sincronização de alarmes
│   ├── alarm-timer-store.ts     ← Persistência do timer de alarme
│   ├── alarm-countdown-notifier.ts ← Countdown na notificação nativa
│   ├── native-alarm-manager.ts  ← AlarmManager nativo Android (com fallback)
│   └── device-id.ts             ← Device ID persistente
├── server/
│   ├── push-notifications.ts    ← Expo Push API (notificações para cuidadores)
│   ├── routers-caregiver.ts     ← Router tRPC do sistema de cuidadores
│   ├── monitoring-job.ts        ← Job que detecta alarmes perdidos + notifica cuidadores
│   └── routers.ts               ← Router principal (inclui caregiverRouter)
├── widgets/                     ← Widgets Android (temporariamente desabilitados)
│   ├── widget-task-handler.tsx
│   ├── NextAlarmWidget.tsx
│   ├── SosWidget.tsx
│   └── HealthWidget.tsx
├── modules/
│   └── expo-alarm-countdown/    ← Módulo nativo local: countdown na notificação
├── plugins/
│   └── crash-reporter.js        ← Plugin: injeta crash handler nativo (MainApplication + MainActivity)
├── .github/
│   └── workflows/
│       └── eas-build.yml        ← CI/CD: build APK via EAS + GitHub Actions
├── docs/
│   ├── ARCHITECTURE.md
│   ├── BUILD_GUIDE.md
│   ├── REVENUECAT_SETUP.md
│   └── DEVELOPMENT_PROCESS.md
├── app.config.ts                ← Expo config (newArchEnabled: true, widgets config)
├── eas.json                     ← Profiles EAS: development/simulator/preview/production
└── package.json                 ← expo.autolinking.exclude para módulos incompatíveis
```

---

## Variáveis de Ambiente

| Variável | Descrição | Obrigatória |
|---|---|---|
| `EXPO_PUBLIC_REVENUECAT_API_KEY` | API key de produção do RevenueCat | Sim |
| `EXPO_PUBLIC_SUPABASE_URL` | URL do projeto Supabase | Sim (dead man's switch) |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Chave anônima do Supabase | Sim (dead man's switch) |
| `EXPO_TOKEN` | Token de autenticação EAS (GitHub Secret) | Sim (CI/CD build) |
| `RESEND_API_KEY` | API key do Resend para emails de alerta | Recomendado |
| `TWILIO_ACCOUNT_SID` | SID da conta Twilio para SMS | Recomendado |
| `TWILIO_AUTH_TOKEN` | Token de autenticação Twilio | Recomendado |
| `TWILIO_FROM_NUMBER` | Número Twilio para envio de SMS | Recomendado |

---

## Build e Publicação

### Via GitHub Actions (Recomendado — sem necessidade de PC)

1. Adicione `EXPO_TOKEN` nos Secrets do repositório GitHub.
2. Acesse **Actions → EAS Build (Android APK) → Run workflow**.
3. Escolha o perfil (`preview` para APK de teste, `development` para debug).
4. Aguarde ~15 min. Link para download aparece no painel EAS (expo.dev).

### Via CLI Local

```bash
# Build de desenvolvimento (com Expo Dev Client)
eas build --profile development --platform android

# Build de preview (APK para testes)
eas build --profile preview --platform android

# Build de produção (AAB para Play Store)
eas build --profile production --platform android
```

Consulte `docs/BUILD_GUIDE.md` para o guia completo de publicação nas lojas.

---

## Compatibilidade de Módulos Nativos

O app usa `newArchEnabled: true` (New Architecture, obrigatório pelo `react-native-worklets`). Alguns módulos são incompatíveis:

| Módulo | Status | Motivo |
|---|---|---|
| `expo-alarm-module` | ❌ Excluído do build | Desenvolvido para RN 0.73, usa bridge legado, crash nativo no RN 0.81 |
| `react-native-android-widget` | ⚠️ Temporariamente desabilitado | Em diagnóstico de compatibilidade com New Arch |
| `expo-alarm-countdown` (local) | ✅ Compilado | Usa `ReactPackage` antigo, mas não é auto-linked (sem impacto) |
| `react-native-worklets` | ✅ OK | Requer New Arch; `newArchEnabled: true` obrigatório |
| `react-native-purchases` | ✅ OK | RevenueCat SDK com suporte full a New Arch |

---

## Testes

```bash
# Executar todos os testes
pnpm test
```

**Cobertura atual:** 38 testes passando — 35 de RevenueCat + 3 de credenciais Supabase.

---

## Conformidade e Segurança

O Vigora Saúde foi desenvolvido com atenção à privacidade dos dados de saúde. Todos os dados pessoais e de saúde são armazenados localmente no dispositivo do usuário (AsyncStorage), sem sincronização automática com servidores externos. A sincronização com o backend é limitada a dados operacionais do monitoramento (alarmes, heartbeat, contatos de emergência, push tokens) e não inclui métricas de saúde ou dados médicos da anamnese.

---

## Próximos Passos

1. **Resolver crash nativo Android** — Diagnosticar e corrigir crash de startup via crash reporter nativo (plugins/crash-reporter.js).
2. **Restaurar Widgets Android** — Após identificar a causa do crash, restaurar `react-native-android-widget`.
3. **Publicação nas Lojas** — Seguir `docs/BUILD_GUIDE.md` para submissão ao App Store e Google Play.
4. **Testes Beta** — Distribuir APK de preview para grupo de usuários para validar UX.
5. **Integração com Wearables** — Sincronização com Apple Watch e Wear OS (roadmap v2.0).

---

## Contato e Suporte

- **Repositório:** [github.com/pedropizzolato24/vigora-saude](https://github.com/pedropizzolato24/vigora-saude)
- **Versão:** 1.0.0
- **Última Atualização:** Maio de 2026
- **Licença:** Proprietária (Vigora Saúde)

> **Aviso:** Este aplicativo não substitui consulta médica profissional. Em caso de emergência, ligue para o SAMU (192) ou Bombeiros (193).
