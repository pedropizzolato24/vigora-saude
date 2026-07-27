# Processo de Desenvolvimento — Vigora

Este documento descreve o processo de desenvolvimento do Vigora, incluindo decisões arquiteturais, desafios enfrentados, soluções implementadas e lições aprendidas. **Este arquivo deve ser atualizado a cada sprint ou mudança significativa no projeto.**

---

## Regra de Atualização de Documentação

> **Toda alteração no app deve ser acompanhada da atualização dos arquivos `README.md`, `ARCHITECTURE.md` e `DEVELOPMENT_PROCESS.md`.** Isso inclui: novas funcionalidades, bugfixes significativos, mudanças de dependências, novos padrões arquiteturais e alterações de configuração.

---

## Cronograma de Desenvolvimento

### Sprint 1: Setup Inicial (Semana 1)

**Objetivo:** Estabelecer a base do projeto com configuração de tema, providers e estrutura de navegação.

**Atividades:**
1. Criação do projeto Expo com template React Native.
2. Instalação de dependências principais (Expo Router, NativeWind, Reanimated).
3. Configuração de tema com tokens de cor (light/dark mode).
4. Criação de providers globais: ThemeProvider, AppContext, NotificationsContext.
5. Implementação de ScreenContainer para SafeArea handling.

**Decisões:**
- **Expo Managed Workflow:** Escolhido por permitir desenvolvimento rápido sem configuração nativa complexa.
- **NativeWind:** Adotado para reutilizar conhecimento de Tailwind CSS e manter DRY.
- **Context API:** Preferido a Redux por simplicidade e integração nativa ao React.

**Resultado:** Projeto base funcional com 5 providers, tema completo e estrutura de navegação.

---

### Sprint 2-3: Telas Principais (Semanas 2-3)

**Objetivo:** Implementar as 8 telas principais com layouts responsivos e componentes reutilizáveis.

**Telas Implementadas:**
1. Dashboard (Início) — SOS, Ambulância, Cards de Status.
2. Alarmes — CRUD com agendamento flexível.
3. Saúde — Entrada de métricas e histórico.
4. Contatos — Gerenciador de contatos de emergência.
5. Anamnese — Ficha médica com exportação.
6. Ambulância — Acesso rápido a serviços.
7. Localização — Compartilhamento de GPS.
8. Configurações — Preferências e personalizações.

**Desafios:**
- Teclado virtual cobrindo inputs em modais → Resolvido com FlatList + keyboardShouldPersistTaps.
- Ícones não renderizando corretamente → Mapeamento manual em icon-symbol.tsx.

**Resultado:** 8 telas + 5 modais, 100% das funcionalidades básicas implementadas.

---

### Sprint 4-5: Funcionalidades de Saúde (Semanas 4-5)

**Objetivo:** Implementar sistema completo de alarmes com notificações nativas e escalação.

**Funcionalidades Implementadas:**
1. Agendamento de alarmes com expo-notifications.
2. Full-screen alarm experience com som customizado.
3. Sincronização de alarmes ao iniciar app.
4. Escalação automática para WhatsApp.
5. Integração com contatos de emergência.

**Decisões:**
- **expo-notifications:** Escolhido por integração nativa e suporte a Android MAX importance.
- **Som Customizado:** alarm-notification.wav empacotado no build (não usar sons do sistema).

**Desafios:**
- Alarmes não disparando em background → Resolvido com SCHEDULE_EXACT_ALARM permission.
- Notificações não sobrescrevendo DND → Resolvido com Android MAX importance.

**Resultado:** Sistema de alarmes robusto com notificações confiáveis e escalação automática.

---

### Sprint 6: Monetização com RevenueCat (Semana 6)

**Objetivo:** Integrar RevenueCat SDK com modelo de assinatura e paywall nativo.

**Funcionalidades Implementadas:**
1. Instalação de `react-native-purchases` v10.0.1 e `react-native-purchases-ui` v10.0.1.
2. Inicialização com API key via `EXPO_PUBLIC_REVENUECAT_API_KEY`.
3. Criação de Entitlement "Vigora Saúde Pro" no painel RevenueCat.
4. Configuração de 3 produtos (Lifetime, Yearly, Monthly).
5. Implementação de ProGate, ProBanner, ProLimitBadge com `FREE_LIMITS` (contatos: 3, alarmes: 5). *(Superado: os limites por plano e os componentes de gate foram removidos — ver Sprint 15.)*
6. Paywall nativo do RevenueCat (template Health, em português).
7. Customer Center para gerenciamento de assinatura.

**Decisões:**
- **RevenueCat:** Escolhido por gerenciamento completo de assinatura, webhooks e analytics.
- **Env Vars:** API key armazenada como `EXPO_PUBLIC_REVENUECAT_API_KEY`.
- **Upsell Contextual:** Implementado ProUpsellModal com animação bottom sheet em vez de bloquear direto.

**Desafios:**
- API key de teste vs produção → Resolvido com variável de ambiente `EXPO_PUBLIC_REVENUECAT_API_KEY`.
- Paywall não exibindo em Expo Go → Resolvido com build de desenvolvimento EAS.

**Resultado:** Monetização completa com paywall nativo, upsell contextual em 4 pontos de bloqueio.

---

### Sprint 7: Testes e Polimento (Semana 7)

**Objetivo:** Implementar testes automatizados, otimizar performance e polir UX.

**Testes Implementados:**
1. 35 testes com Vitest cobrindo RevenueCat SDK (hasProAccess, purchasePackage, restore, etc.).
2. Vitest configurado com alias `@`, suporte JSX e `define __DEV__`.

**Desafios:**
- Vitest não reconhecendo JSX → Resolvido com suporte a JSX no vitest.config.ts.
- Imports com `@` não resolvendo → Configurado alias no vitest.config.ts.

**Resultado:** 35 testes passando, zero erros TypeScript novos.

---

### Sprint 8: Build e Publicação (Semana 8)

**Objetivo:** Preparar app para publicação nas lojas com EAS Build.

**Atividades:**
1. Criação de `eas.json` com 4 profiles (development, simulator, preview, production).
2. Instalação de expo-dev-client para builds de desenvolvimento.
3. EAS CLI v18.8.1 instalado globalmente.
4. Criação de documentação inicial (README, ARCHITECTURE, BUILD_GUIDE, REVENUECAT_SETUP).
5. Bundle ID migrado para `com.vigora.saude`.

**Resultado:** App pronto para build com documentação completa.

---

### Sprint 9: Supabase, Trial de 7 Dias e Bugfix Notificações (Semana 9)

**Objetivo:** Implementar dead man's switch via Supabase, trial de 7 dias com banners e corrigir notificações duplicadas no Android.

#### Parte 1 — Bugfix: Notificações Duplicadas no Android

**Problema:** No Android, o sistema de alarmes agendava notificações tanto via AlarmManager nativo quanto via expo-notifications, resultando em notificações duplicadas ao disparar um alarme. Adicionalmente, o texto das notificações exibia um ID genérico em vez do nome real do alarme.

**Causa Raiz:** O `alarm-sync.ts` chamava tanto `NativeAlarmManager.scheduleAlarm()` quanto `scheduleAlarmNotification()` no Android, sem verificar se o AlarmManager nativo estava disponível.

**Solução:**

```typescript
// lib/alarm-sync.ts
export async function scheduleFullAlarm(alarm: Alarm) {
  if (Platform.OS === 'android' && isNativeAlarmAvailable()) {
    await NativeAlarmManager.scheduleAlarm(alarm);
    return; // ← não chama expo-notifications
  }
  await scheduleAlarmNotification(alarm);
}
```

**Resultado:** Notificações sem duplicatas no Android; textos exibem nome correto do alarme.

---

#### Parte 2 — Supabase Dead Man's Switch

> **⚠️ Superado (registro histórico):** este desenho com Supabase + Edge Functions + pg_cron foi **removido** posteriormente. O dead man's switch hoje roda no backend Node (Railway) via `server/monitoring-job.ts` (`setInterval` 5 min) sobre MySQL. Os alertas, que originalmente seguiam a cascata WhatsApp → Email → SMS, foram simplificados para **WhatsApp (contatos) + push no app (cuidadores)**. Mantido abaixo para histórico.

**Objetivo:** Criar um sistema de segurança que detecta quando o usuário não responde a um alarme e aciona contatos de emergência automaticamente, mesmo que o app esteja fechado.

**Arquivos Criados:**

| Arquivo | Propósito |
|---|---|
| `lib/supabase.ts` | Cliente Supabase com lazy init (não quebra app se env vars ausentes) |
| `lib/device-id.ts` | Device ID persistente via AsyncStorage |
| `lib/supabase-sync.ts` | syncUser, syncAlarms, syncContacts, sendHeartbeat, createAlarmEvent |
| `supabase/schema.sql` | Schema SQL: tabelas users, alarms, alarm_events, emergency_contacts |
| `supabase/functions/check-missed-alarms/index.ts` | Edge Function: verifica eventos não respondidos e envia WhatsApp |

**Schema SQL:**

```sql
CREATE TABLE users (device_id TEXT PRIMARY KEY, name TEXT, last_seen_at TIMESTAMPTZ);
CREATE TABLE alarms (user_id UUID, local_id TEXT, description TEXT, time TEXT, ...);
CREATE TABLE alarm_events (alarm_id UUID, scheduled_at TIMESTAMPTZ, responded_at TIMESTAMPTZ, response_type TEXT);
CREATE TABLE emergency_contacts (user_id UUID, name TEXT, phone TEXT, whatsapp BOOLEAN);

-- Cron job a cada 2 minutos
SELECT cron.schedule('check-missed-alarms', '*/2 * * * *', ...);
```

**Resultado:** Dead man's switch implementado e testado. 3 testes de credenciais Supabase adicionados.

---

#### Parte 3 — Trial de 7 Dias com TrialBanner e ExpiredBanner

**Arquivos Criados/Modificados:**

| Arquivo | Mudança |
|---|---|
| `components/trial-banner.tsx` | Novo: TrialBanner (azul) e ExpiredBanner (vermelho) |
| `context/purchases-context.tsx` | Adicionado: isTrialActive, trialDaysLeft |
| `app/(tabs)/index.tsx` | Integrado: TrialBanner e ExpiredBanner no Dashboard |

**Resultado:** Banners exibidos corretamente no Dashboard. Total de 38 testes passando.

---

### Sprint 10: GitHub e Documentação (Semana 10)

**Objetivo:** Criar repositório GitHub, fazer push do código e atualizar documentação completa.

**Atividades:**
1. Repositório criado em [github.com/pedropizzolato24/vigora-saude](https://github.com/pedropizzolato24/vigora-saude) (privado).
2. Push de todo o histórico de commits (1.089 objetos).
3. Atualização completa de README.md, ARCHITECTURE.md e DEVELOPMENT_PROCESS.md.
4. Estabelecida regra: documentação deve ser atualizada a cada alteração no app.

---

### Sprint 11: Autenticação de Conta (Semanas 11-12)

**Objetivo:** Implementar sistema de autenticação de conta com login, cadastro e OAuth.

**Funcionalidades Implementadas:**
1. Tela `app/login.tsx` — entrada por email/senha ou OAuth (Google/Apple).
2. Tela `app/register.tsx` — cadastro com seleção de tipo de usuário (`caregiver` | `monitored`).
3. `app/oauth/callback.tsx` — recebe o redirect OAuth, troca `code` por JWT no servidor, roteia por `userType`. *(Hoje é `app/oauthredirect.tsx`, alimentado por `app/+native-intent.ts` — ver Sprint 16.)*
4. `lib/_core/auth.ts` — `getSessionToken`, `setSessionToken`, `getUserInfo` usando `expo-secure-store` (nativo) ou `localStorage` (web).
5. Tipo `User` com campos: `openId`, `name`, `email`, `userType`, `birthDate`, `bloodType`, `loginMethod`.
6. `app/(tabs)/profile.tsx` — tela de perfil com edição de nome, data de nascimento e tipo sanguíneo.
7. Tela de onboarding `app/onboarding.tsx` com gate de proteção de rota (`components/onboarding-gate.tsx`).

**Servidor (Railway):**
- Router `auth` no tRPC: `register`, `completeRegistration`, `updateProfile`, `me`, `logout`.
- JWT emitido no servidor após autenticação OAuth bem-sucedida.
- Tokens são armazenados em `SecureStore` (nativo) ou cookie `httpOnly` (web).

**Decisões:**
- **SecureStore para JWT:** Mais seguro que AsyncStorage; isolado por app no sistema operacional.
- **Cookie httpOnly para web:** Evita acesso via JavaScript (XSS); gerenciado automaticamente pelo browser.
- **userType no cadastro:** Define o fluxo do app — `monitored` acessa `(tabs)`, `caregiver` acessa `(caregiver-tabs)`.
- **PKCE para OAuth:** Elimina necessidade de client_secret no app móvel.

**Desafios:**
- Deep link `vigora://oauth/callback` não disparando no Android → Resolvido com `intentFilters` no `app.config.ts`.
- Token expirado quebrando requests → Resolvido com refresh automático no middleware tRPC.
- Routing pós-login: primeiro login deve ir ao onboarding → Implementado flag `hasCompletedOnboarding` no servidor.

**Resultado:** Autenticação completa funcional. Usuários podem criar contas, fazer login e o app roteia corretamente por tipo de usuário.

---

### Sprint 12: Cloud Backup por Conta (Semana 13)

**Objetivo:** Implementar backup e restore automático de todos os dados do app associado à conta do usuário.

**Funcionalidades Implementadas:**
1. `lib/cloud-sync.ts` — `pullCloudData()` e `pushCloudData()` via `userData` tRPC router.
2. `CloudSnapshot` — estrutura contendo: `anamnesis`, `emergencyContacts`, `alarms`, `settings`, `healthMetrics`, `profile`, `dataUpdatedAt`.
3. Integração no `AppProvider`: pull na inicialização (se autenticado), push com debounce de 3s a cada mudança de estado.
4. Reconciliação por `dataUpdatedAt`: cloud mais recente sobrescreve local (last-write-wins).
5. Router `userData` no servidor: `get` (SELECT por openId) e `put` (UPSERT com timestamp).

**Decisões:**
- **Last-write-wins:** Suficiente para o caso de uso atual (usuário único por conta). Conflito de merge multi-device não é um requisito desta versão.
- **Debounce 3s:** Evita push excessivo em edições rápidas (ex.: digitação em campos de texto).
- **Dados sensíveis no servidor próprio:** Anamnese e saúde ficam no Railway (banco Postgres), não no Supabase. Supabase é usado exclusivamente para o dead man's switch.

**Desafios:**
- Fresh install sem auth ainda tentava pull → Resolvido com verificação de `hasAuthSession()` antes do pull.
- Schema `user_data` no servidor não existia → Migração Drizzle criada para nova tabela.

**Resultado:** Usuários podem reinstalar o app e recuperar todos os dados ao fazer login.

---

### Sprint 13: Caregiver Shell (Semanas 14-15)

**Objetivo:** Implementar a seção completa do cuidador com 4 abas, wizard de vínculo e onboarding.

**Funcionalidades Implementadas:**

| Arquivo | Descrição |
|---|---|
| `lib/caregiver-state.ts` | Tipos + reducer puro (`CaregiverState`, `LinkedMonitored`, `LinkMethod`) |
| `lib/caregiver-context.tsx` | `CaregiverProvider` com persistência AsyncStorage (`vigora_caregiver_*`) |
| `app/(caregiver-tabs)/_layout.tsx` | Layout com 4 abas + proteção de rota (`userType === 'caregiver'`) |
| `app/(caregiver-tabs)/index.tsx` | Dashboard do cuidador |
| `app/(caregiver-tabs)/alerts.tsx` | Alertas recebidos da pessoa monitorada |
| `app/(caregiver-tabs)/person.tsx` | Detalhes da pessoa monitorada com seções placeholder |
| `app/(caregiver-tabs)/link.tsx` | Wizard de vínculo: 3 métodos (código, email/phone, QR) |
| `app/(caregiver-tabs)/settings.tsx` | Config: perfil, gerenciamento de vínculo, notificações, logout |
| `app/caregiver-onboarding.tsx` | Onboarding inicial do cuidador |
| `components/caregiver-tab-bar.tsx` | Tab bar customizada para a seção caregiver |
| `components/caregiver-empty-state.tsx` | Placeholder "aguardando vínculo" reutilizável |
| `tests/caregiver-state.test.ts` | 6 testes unitários do reducer |

**Wizard de Vínculo (3 métodos):**
- **Código:** Cuidador insere código de 6 dígitos gerado pela pessoa monitorada.
- **Email/Phone:** Cuidador insere email ou telefone da pessoa monitorada.
- **QR:** Cuidador escaneia QR code exibido no dispositivo da pessoa monitorada.

**Estado Inicial (Shell):** Links criados no wizard ficam com `status: 'pending'`. A sincronização real cuidador↔monitorado será implementada em versão futura quando a infraestrutura server-side estiver pronta. *(Concluído: o `link` router, os convites single-use e o push em tempo real ao cuidador foram implementados — ver Sprint 17.)*

**Roteamento pós-login:**
```
login → oauth/callback → userType === 'caregiver'
  → hasCompletedCaregiverOnboarding?
    sim → (caregiver-tabs)
    não → caregiver-onboarding
```

**Desafios:**
- Tab bar nativa não suportando estilo customizado → Implementada `CaregiverTabBar` manual com Pressable.
- Estado do cuidador precisando ser testável sem React → Reducer extraído para `caregiver-state.ts` separado do contexto.

**Resultado:** Caregiver shell completo com UI funcional. 6 testes do reducer passando. 17 commits no feature branch.

---

### Sprint 14: Migração do Dead Man's Switch para o Railway (Supabase removido)

**Objetivo:** eliminar o segundo backend e consolidar o dead man's switch no servidor próprio.

**Mudanças:**
1. `server/monitoring-job.ts` — job em processo (`setInterval` 5 min) substituindo a Edge Function + `pg_cron`.
2. Schema migrado para MySQL/Drizzle; `lib/supabase.ts` e `lib/supabase-sync.ts` deletados.
3. Cascata de alertas simplificada: WhatsApp (contatos) **+** push Expo (cuidadores). Email e SMS removidos — dois canais confiáveis valem mais que quatro meio configurados.

**Resultado:** um backend só. Menos superfície de configuração, menos modos de falha silenciosa.

---

### Sprint 15: Auditoria de Simplificação e Remoção dos Limites por Plano

**Objetivo:** remover complexidade acumulada e resolver uma contradição de produto.

**Mudanças:**
1. **43 remoções** de código morto (~−2.100 linhas, −3 dependências): componentes de template, exports sem chamador, contextos não usados (`menu-context`, `sidebar-menu`), constantes órfãs.
2. **Limites por plano removidos.** `ProGate`/`ProBanner`/`ProLimitBadge`/`useProFeature` deletados; `components/pro-limits.ts` passa a ser a fonte única com tudo `Infinity`/`true`. A monetização virou trial de 14 dias + banners, não bloqueio de recurso.
3. **Linha ANVISA:** removida a classificação "Normal/Atenção/Crítico" do relatório de saúde e a função `getHealthStatus`. Interpretar métrica caracterizaria dispositivo médico.

**Decisão:** bloquear recurso de segurança atrás de paywall é ruim de produto **e** ruim de risco. Um idoso com o alarme desligado porque o filho não renovou a assinatura é exatamente o cenário que o app existe para evitar.

---

### Sprint 16: Login Multi-Provedor

**Objetivo:** parar de exigir conta Google de um público que muitas vezes não sabe a senha dela.

**Funcionalidades:**
1. **Apple** (`expo-apple-authentication`), atrás de `EXPO_PUBLIC_APPLE_SIGNIN_ENABLED` — o entitlement não é provisionado por Apple ID gratuito, então fica desligado em dev.
2. **E-mail + senha** com código de confirmação e recuperação, via Resend.
3. **Telefone** com OTP entregue por WhatsApp (mesmo token do dead man's switch).
4. **Conta anônima** — "Continuar sem conta". O app funciona inteiro; logar depois vira *upgrade* que anexa o provedor à mesma conta.
5. `GET /api/auth/methods` — o app esconde botões cuja infraestrutura não está configurada, em vez de mostrar um botão que dá 503.
6. Tabelas `auth_identities` e `auth_codes`; `users.email` vira **único** (chave canônica de vínculo).

**Desafios:**
- O redirect do OAuth Google no Android voltava em `vigora://oauthredirect`, path que o Expo Router não reconhecia ("Unmatched Route") → `app/+native-intent.ts` roteia o deep link cru para `app/oauthredirect.tsx`.
- Cold start durante o login perdia o PKCE → `code_verifier` e `redirectUri` passaram a ser persistidos antes de sair do app.
- Debug e release têm SHA-1 diferentes → dois Client IDs Android, fixados por profile no `eas.json` e ambos aceitos pelo servidor.

---

### Sprint 17: Posse por Conta (`openId`) no Monitoramento

**Objetivo:** corrigir o modelo de posse do dead man's switch, que amarrava tudo ao aparelho.

**Problema:** `app_users`, `synced_alarms` e `device_heartbeat` eram chaveadas por `deviceId`. Trocar de celular, reinstalar ou usar dois aparelhos quebrava o monitoramento — e o `deviceId` como chave de posse era enumerável.

**Mudanças:**
1. `account_liveness` substitui as três tabelas: liveness é da **conta**; qualquer aparelho que pingar mantém a pessoa "viva". `lastDeviceId` vira metadado.
2. `monitoring.register` e `monitoring.syncAlarms` viram stubs de compatibilidade — a agenda autoritativa de alarmes é `user_data.alarms`.
3. Estado local passa a ser por conta (`vigora_app_state:<openId>`) — sem isso, alarmes vazavam entre contas no mesmo aparelho.
4. Migrations `0010`/`0011`. Spec em `docs/design/2026-07-12-monitoring-account-ownership.md`.
5. Aviso por inatividade passou a exigir um evento **não confirmado**, eliminando falso alarme.
6. Vínculo cuidador↔monitorado saiu do shell: `link` router completo (convites single-use por código/QR/link universal), push Expo em tempo real e revogação dos dois lados.

---

### Sprint 18: Sessão Deslizante

**Objetivo:** corrigir a causa-raiz de "histórico vazio e dead man's switch morto" relatada em campo.

**Problema:** o JWT tinha TTL de 7 dias e não havia refresh. Passado o prazo, heartbeat, sync e eventos passavam a dar 401 — **silenciosamente**. O app parecia funcionar; o monitoramento estava desarmado.

**Solução:** `auth.refresh` a cada abertura do app (`lib/session-refresh.ts`) com sessão de 30 dias, mais tratamento **global** de 401 que derruba a sessão e leva ao login. O token anterior expira naturalmente, sem revogação, para não competir com requests em voo.

**Lição:** falha silenciosa em caminho crítico de segurança é pior que falha ruidosa. O sintoma visível (histórico vazio) estava a três camadas do defeito real (TTL).

---

### Sprint 19: Compatibilidade Android 14+ e Confiabilidade dos Alarmes

**Objetivo:** fazer o alarme tocar em aparelhos reais de idosos — Samsung/Xiaomi com otimização agressiva de bateria.

**Mudanças:**
1. `USE_FULL_SCREEN_INTENT` com checagem de `canUseFullScreenIntent()` em runtime e prompt de permissão.
2. `showWhenLocked`/`turnScreenOn` aplicados **no lançamento da activity do alarme**, escopados àquela tela — não à `MainActivity`.
3. Isenção de otimização de bateria: diálogo nativo direto, rotas por OEM (Samsung One UI, Xiaomi) e telemetria no heartbeat (`accountLiveness.batteryExempt`).
4. Prompt de alarme exato (Android 12+); módulo nativo blindado contra variações de versão/OEM.
5. Soneca de volta na notificação, via deep link `vigora://alarm-ring?...&snooze=1`, sem furar o dead man's switch.
6. **Bug corrigido:** alarme diário reagendava +7 dias em vez de +1 ao ser dispensado.
7. **Bug corrigido:** alarme respondido nunca chegava ao servidor (closure velha capturando estado obsoleto).

---

### Sprint 20: Incidente de Produção — Migration Não Aplicada

**Objetivo:** entender e prevenir 27 horas de dead man's switch desarmado em produção.

**Problema:** a migration `0012` nunca foi aplicada no deploy. O job do monitoramento falhava em toda iteração, e ninguém percebeu por mais de um dia.

**Solução:**
1. `migrate()` no boot do servidor (`server/db.ts`), com isolamento de erro por passo.
2. `GET /api/health` como health check **profundo**: responde **503** quando o banco está inacessível ou o job está parado/falhando — não 200 com um campo `ok: false` que nenhum monitor lê.

**Pendência:** ninguém observa o `/api/health` ainda. O endpoint existe; o alarme sobre ele, não.

**Lição:** um job de segurança que falha em silêncio é indistinguível de um que não existe. A instrumentação precisa vir junto com o job, não depois do incidente.

---

## Decisões Arquiteturais Principais

### 1. Expo Managed Workflow vs Bare Workflow

**Decisão:** Managed Workflow.

**Justificativa:** Desenvolvimento rápido sem configuração nativa, updates over-the-air, suporte a Expo Go para testes rápidos e comunidade grande. O AlarmManager nativo Android foi integrado via módulo Expo compatível com managed workflow.

**Quando Migrar:** Se precisar de módulos nativos customizados não disponíveis no ecossistema Expo.

---

### 2. AsyncStorage vs Realm/SQLite

**Decisão:** AsyncStorage para dados locais.

**Justificativa:** Simples, integrado ao Expo, suficiente para dados estruturados (alarmes, contatos, métricas). O servidor Railway complementa com backup remoto por conta.

**Quando Migrar:** Se precisar de queries complexas ou histórico de 5+ anos de dados.

---

### 3. Context API vs Redux/Zustand

**Decisão:** Context API + useReducer.

**Justificativa:** Integrado ao React, type-safe com TypeScript, simples de entender e manter. Suficiente para o porte atual do app.

**Quando Migrar:** Se precisar de time-travel debugging ou middleware complexo.

---

### 4. RevenueCat vs Implementar Pagamentos Manualmente

**Decisão:** RevenueCat.

**Justificativa:** Gerenciamento completo de assinatura, conformidade automática com App Store e Google Play, webhooks, analytics e suporte a múltiplas moedas. Reduz risco de rejeição nas lojas.

**Trade-off:** Taxa de 5-10% do revenue. Justificável até ~$100k/ano.

---

### 5. Supabase vs Servidor Principal para Dead Man's Switch

> **⚠️ Decisão revertida:** o Supabase foi **removido**. O dead man's switch foi consolidado no próprio backend Railway (`monitoring-job.ts`, `setInterval` 5 min, MySQL), eliminando o segundo backend. Os trade-offs originais ficam abaixo para histórico.

**Decisão (histórica):** Supabase para o dead man's switch; Railway para dados do usuário.

**Justificativa (histórica):** Edge Functions serverless com Deno, pg_cron nativo e custo zero no plano gratuito. O servidor Railway (Node.js + tRPC) é responsável por autenticação, cloud backup e alertas de emergência — dados mais sensíveis ficam no banco do Railway, não no Supabase.

---

### 6. AlarmManager Nativo vs expo-notifications no Android

**Decisão:** AlarmManager nativo exclusivamente no Android.

**Justificativa:** O expo-notifications no Android usa o mesmo AlarmManager internamente, causando duplicatas quando ambos são usados. O AlarmManager nativo oferece mais controle sobre prioridade e comportamento em background.

---

### 7. JWT em SecureStore vs AsyncStorage para Tokens de Sessão

**Decisão:** `expo-secure-store` para tokens JWT no nativo; cookie `httpOnly` no web.

**Justificativa:** AsyncStorage não é criptografado e pode ser lido por outras partes do processo. SecureStore usa o keychain do iOS e o Android Keystore, que são isolados por app e protegidos pelo hardware quando disponível. No web, cookie `httpOnly` impede acesso via JavaScript (proteção contra XSS).

---

### 8. Dois Tipos de Usuário vs App Único

**Decisão:** `userType: 'caregiver' | 'monitored'` com layouts completamente distintos.

**Justificativa:** As necessidades de UX são fundamentalmente diferentes: o monitorado usa alarmes e dados de saúde; o cuidador recebe alertas e monitora outra pessoa. Um único layout genérico seria confuso e comprometeria a usabilidade de ambos os públicos.

---

## Desafios Enfrentados e Soluções

### Desafio 1: Notificações Duplicadas no Android

**Solução:** `alarm-sync.ts` verifica plataforma e disponibilidade do AlarmManager nativo. Android usa exclusivamente o AlarmManager; iOS e Web usam expo-notifications.

---

### Desafio 2: Supabase Quebrando App Quando Não Configurado

> **Registro histórico:** o Supabase foi removido no Sprint 14. O padrão sobreviveu: hoje `isEmailServiceConfigured()` / `isPhoneLoginConfigured()` fazem o mesmo para Resend e para o template OTP do WhatsApp, e `GET /api/auth/methods` faz o app esconder o botão em vez de oferecer um caminho que dá 503.

**Solução:** Lazy init com `isSupabaseConfigured()` — o cliente só é criado quando as env vars estão presentes.

---

### Desafio 3: Fresh Install Tentando Pull de Cloud Antes da Auth

**Problema:** `AppProvider` disparava `pullCloudData()` antes de qualquer verificação de sessão, resultando em request não autorizado no servidor.

**Solução:** Verificação explícita de `getSessionToken()` antes do pull. Se não houver token, carrega apenas do AsyncStorage local.

---

### Desafio 4: Deep Link OAuth Não Disparando no Android

**Problema:** O callback `vigora://oauth/callback` após autenticação Google não era capturado pelo app no Android.

**Solução:** Adicionado `intentFilters` no `app.config.ts` com `scheme: 'vigora'` e `autoVerify: true`.

---

### Desafio 5: Estado do Cuidador Não Testável

**Problema:** O reducer do cuidador estava acoplado ao `CaregiverContext`, tornando os testes unitários dependentes de React e AsyncStorage.

**Solução:** Reducer extraído para `lib/caregiver-state.ts` sem imports de React. Contexto importa e usa o reducer; testes importam diretamente o reducer.

---

### Desafio 6: Vitest Não Reconhecendo JSX e Alias @

**Solução:**

```typescript
// vitest.config.ts
export default defineConfig({
  plugins: [react()],
  test: { environment: 'node', globals: true },
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
  define: { __DEV__: true },
});
```

---

## Métricas de Desenvolvimento

| Métrica | Valor |
|---|---|
| Sprints Concluídas | 20 |
| Arquivos de Teste | 38 (290 testes) |
| Telas Implementadas | ~33 rotas (11 abas + 4 abas do cuidador + fluxos + modais) |
| Componentes Reutilizáveis | 39 |
| Migrations aplicadas | 0000 → 0012 |
| TypeScript Errors (novos) | 0 (o pré-existente em `lib/storageProxy.ts` é tolerado) |

---

## Lições Aprendidas

**1. Documentar decisões arquiteturais imediatamente.** Decisões não documentadas são esquecidas. Este arquivo e o ARCHITECTURE.md devem ser atualizados a cada sprint.

**2. Testar em dispositivos reais cedo.** Emuladores não capturam problemas de notificações, SafeArea e WhatsApp deep links.

**3. Usar env vars para todos os secrets.** Nunca hardcode API keys, mesmo que sejam de teste.

**4. Fallback graceful para serviço externo, sim — falha silenciosa em caminho crítico, não.** O app deve continuar funcionando offline se o servidor cair. Mas o dead man's switch *desarmado* precisa gritar: foi exatamente a falha silenciosa (sessão expirada no Sprint 18, migration não aplicada no Sprint 20) que produziu os dois piores incidentes do projeto.

**5. Separar responsabilidades por plataforma.** O bugfix de notificações duplicadas mostrou a importância de tratar Android e iOS separadamente quando o comportamento nativo difere. Android 14+ (Sprint 19) reforçou: cada versão e cada OEM é um caso.

**6. Extrair lógica de estado de contextos React.** O caregiver reducer separado do provider permitiu testes unitários limpos sem mocking de React. O mesmo padrão foi aplicado depois em `pro-limits.ts`, `alarm-fire-times.ts`, `app-lock-core.ts` e `font-scale.ts`.

**7. Um backend só.** A divisão "dados leves no Supabase, dados sensíveis no servidor próprio" (Sprint 9) parecia econômica e virou dois lugares para configurar errado. Consolidar no Railway (Sprint 14) removeu uma classe inteira de falha.

**8. Posse de dado é por conta, não por aparelho.** Amarrar monitoramento ao `deviceId` (Sprint 17) quebrava em troca de celular e reinstalação, e criava um identificador enumerável. `openId` como chave única resolveu correção e segurança de uma vez.

**9. Recurso de segurança não vai atrás de paywall.** Bloquear alarme ou monitoramento por plano (Sprint 6) criava o cenário que o app existe para evitar. Removido no Sprint 15.

**10. Não interpretar métrica de saúde.** A classificação "Normal/Atenção/Crítico" era tecnicamente trivial e regulatoriamente cara — cruza a linha da ANVISA para dispositivo médico. Removida no Sprint 15.

---

## Roadmap Futuro

### Antes do lançamento

- [ ] Produtos RevenueCat migrados da Test Store para App Store / Google Play
- [ ] Monitor externo observando `GET /api/health` (hoje ninguém olha)
- [ ] Secrets de assinatura configurados para os builds de release
- [ ] Beta com usuários idosos reais

### v2.0 (Q4 2026)

- [ ] Integração com wearables (Apple Watch, Wear OS)
- [ ] Notificações push personalizadas baseadas em métricas de saúde
- [ ] Suporte multilíngue (EN, ES)

### v3.0 (em avaliação)

- [ ] Integração com prontuário eletrônico
- [ ] Integração com IoT (medidores de pressão, glicosímetro)
- [ ] ~~IA para recomendações de saúde~~ — **bloqueado por avaliação regulatória.** Recomendação clínica caracteriza dispositivo médico (ANVISA); só entra com o enquadramento resolvido primeiro.
- [ ] ~~Telemedicina~~ — mesma restrição.

---

## Conclusão

O desenvolvimento do Vigora evoluiu de um MVP básico de alarmes para um ecossistema completo com login multi-provedor, cloud backup por conta, dead man's switch com posse por `openId`, check-in diário, bloqueio do app, widgets, monetização e dois perfis de usuário (monitorado e cuidador).

As lições mais caras vieram dos incidentes, não das features: uma sessão expirando em silêncio e uma migration não aplicada desarmaram o recurso central do produto sem nenhum sinal visível. O que distingue este app de um app comum de saúde é que a falha dele é invisível por construção — só se descobre no dia em que alguém precisava e ninguém foi avisado. Toda decisão de engenharia daqui pra frente é medida por esse critério.
