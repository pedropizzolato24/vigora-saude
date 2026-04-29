# Processo de Desenvolvimento — Vigora Saúde

Este documento descreve o processo de desenvolvimento do Vigora Saúde, incluindo decisões arquiteturais, desafios enfrentados, soluções implementadas e lições aprendidas. **Este arquivo deve ser atualizado a cada sprint ou mudança significativa no projeto.**

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
5. Implementação de ProGate, ProBanner, ProLimitBadge com `FREE_LIMITS` (contatos: 3, alarmes: 5).
6. Paywall nativo do RevenueCat (template Health, em português).
7. Customer Center para gerenciamento de assinatura.

**Decisões:**
- **RevenueCat:** Escolhido por gerenciamento completo de assinatura, webhooks e analytics.
- **Env Vars:** API key armazenada como `EXPO_PUBLIC_REVENUECAT_API_KEY` (exposta ao cliente, necessário para SDK).
- **Upsell Contextual:** Implementado ProUpsellModal com animação bottom sheet em vez de bloquear direto.

**Desafios:**
- API key de teste vs produção → Resolvido com env var `EXPO_PUBLIC_REVENUECAT_API_KEY`.
- Paywall não exibindo em Expo Go → Resolvido com build de desenvolvimento EAS.
- Erro "Wrong API Key" em produção → Corrigido ao substituir chave de teste pela de produção via Secrets do Manus.

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
    // Android: usa AlarmManager nativo EXCLUSIVAMENTE
    await NativeAlarmManager.scheduleAlarm(alarm);
    return; // ← não chama expo-notifications
  }
  // iOS e Web: usa expo-notifications
  await scheduleAlarmNotification(alarm);
}
```

O `native-alarm-manager.ts` também foi corrigido para incluir o nome real do alarme no título e corpo da notificação nativa.

**Resultado:** Notificações sem duplicatas no Android; textos exibem nome correto do alarme.

---

#### Parte 2 — Supabase Dead Man's Switch

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
-- Tabelas principais
CREATE TABLE users (device_id TEXT PRIMARY KEY, name TEXT, last_seen_at TIMESTAMPTZ);
CREATE TABLE alarms (user_id UUID, local_id TEXT, description TEXT, time TEXT, ...);
CREATE TABLE alarm_events (alarm_id UUID, scheduled_at TIMESTAMPTZ, responded_at TIMESTAMPTZ, response_type TEXT);
CREATE TABLE emergency_contacts (user_id UUID, name TEXT, phone TEXT, whatsapp BOOLEAN);

-- Cron job a cada 2 minutos
SELECT cron.schedule('check-missed-alarms', '*/2 * * * *',
  'SELECT net.http_post(url := ''https://SEU_REF.supabase.co/functions/v1/check-missed-alarms'', ...)');
```

**Integração no AppContext:** A sincronização é disparada automaticamente quando o estado de alarmes ou contatos muda:

```typescript
// lib/app-context.tsx
useEffect(() => {
  if (isSupabaseConfigured()) {
    syncAlarms(deviceId, state.alarms);
    syncEmergencyContacts(deviceId, state.contacts);
  }
}, [state.alarms, state.contacts]);
```

**Decisão:** Supabase foi escolhido em vez de implementar no servidor principal por oferecer Edge Functions serverless, pg_cron nativo e SDK JavaScript pronto para uso no Expo.

**Resultado:** Dead man's switch implementado e testado. 3 testes de credenciais Supabase adicionados.

---

#### Parte 3 — Trial de 7 Dias com TrialBanner e ExpiredBanner

**Objetivo:** Exibir banners informativos no Dashboard durante e após o período de trial, incentivando a conversão para o plano pago.

**Arquivos Criados/Modificados:**

| Arquivo | Mudança |
|---|---|
| `components/trial-banner.tsx` | Novo: TrialBanner (azul) e ExpiredBanner (vermelho) |
| `context/purchases-context.tsx` | Adicionado: isTrialActive, trialDaysLeft |
| `app/(tabs)/index.tsx` | Integrado: TrialBanner e ExpiredBanner no Dashboard |

**Lógica do Trial:**

```typescript
// context/purchases-context.tsx
const proEntitlement = info.entitlements.active['Vigora Saúde Pro'];
const isTrial = proEntitlement?.periodType === 'TRIAL';
const expiryDate = proEntitlement?.expirationDate;
const daysLeft = expiryDate
  ? Math.ceil((new Date(expiryDate).getTime() - Date.now()) / 86400000)
  : 0;

setIsTrialActive(isTrial);
setTrialDaysLeft(Math.max(0, daysLeft));
```

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

## Decisões Arquiteturais Principais

### 1. Expo Managed Workflow vs Bare Workflow

**Decisão:** Managed Workflow.

**Justificativa:** Desenvolvimento rápido sem configuração nativa, updates over-the-air, suporte a Expo Go para testes rápidos e comunidade grande. O AlarmManager nativo Android foi integrado via módulo Expo compatível com managed workflow.

**Quando Migrar:** Se precisar de módulos nativos customizados não disponíveis no ecossistema Expo.

---

### 2. AsyncStorage vs Realm/SQLite

**Decisão:** AsyncStorage para dados locais.

**Justificativa:** Simples, integrado ao Expo, suficiente para dados estruturados (alarmes, contatos, métricas). O Supabase complementa com persistência remota apenas para o dead man's switch.

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

**Decisão:** Supabase para o dead man's switch.

**Justificativa:** Edge Functions serverless com Deno, pg_cron nativo, SDK JavaScript pronto para Expo, e custo zero no plano gratuito para o volume esperado. O servidor principal (Node.js + tRPC) permanece responsável pelo monitoramento em tempo real e alertas imediatos.

---

### 6. AlarmManager Nativo vs expo-notifications no Android

**Decisão:** AlarmManager nativo exclusivamente no Android.

**Justificativa:** O expo-notifications no Android usa o mesmo AlarmManager internamente, causando duplicatas quando ambos são usados. O AlarmManager nativo oferece mais controle sobre prioridade e comportamento em background.

---

## Desafios Enfrentados e Soluções

### Desafio 1: Notificações Duplicadas no Android

**Problema:** Alarmes disparavam duas notificações simultâneas no Android.

**Causa Raiz:** `alarm-sync.ts` chamava tanto AlarmManager nativo quanto expo-notifications sem verificar disponibilidade.

**Solução:** Adicionada verificação de plataforma e disponibilidade do AlarmManager nativo. Android usa exclusivamente o AlarmManager; iOS e Web usam expo-notifications.

---

### Desafio 2: Texto Genérico nas Notificações Nativas

**Problema:** Notificações nativas do Android exibiam ID do alarme em vez do nome da medicação.

**Causa Raiz:** `native-alarm-manager.ts` usava `alarm.id` como título em vez de `alarm.name`.

**Solução:** Corrigido para usar `alarm.name` e `alarm.description` nos campos de título e corpo da notificação.

---

### Desafio 3: Supabase Quebrando App Quando Não Configurado

**Problema:** O cliente Supabase lançava exceção ao inicializar se as env vars não estivessem presentes (ex: em desenvolvimento local sem `.env`).

**Causa Raiz:** Inicialização eager do cliente Supabase no import do módulo.

**Solução:** Implementado lazy init com `isSupabaseConfigured()` — o cliente só é criado quando as env vars estão presentes, e todas as funções de sync retornam silenciosamente se não configurado.

---

### Desafio 4: RevenueCat API Key Exposta no Cliente

**Problema:** API key de teste estava hardcoded no código, causando erro "Wrong API Key" em produção.

**Causa Raiz:** Não usar env vars para secrets.

**Solução:** Migrar para `EXPO_PUBLIC_REVENUECAT_API_KEY` configurada via Secrets do Manus (não exposta no código-fonte).

---

### Desafio 5: Vitest Não Reconhecendo JSX e Alias @

**Problema:** Testes falhando com erro "Expression expected" ao importar componentes JSX e módulos com alias `@`.

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
| Tempo Total de Desenvolvimento | 10 semanas |
| Linhas de Código (Frontend) | ~9.500 |
| Linhas de Código (Backend) | ~2.500 |
| Linhas de Código (Supabase) | ~300 |
| Telas Implementadas | 8 principais + 5 modais |
| Componentes Reutilizáveis | 18+ |
| Testes Automatizados | 38 |
| TypeScript Errors (novos) | 0 |
| Checkpoints Salvos | 15 |

---

## Lições Aprendidas

**1. Documentar decisões arquiteturais imediatamente.** Decisões não documentadas são esquecidas. Este arquivo e o ARCHITECTURE.md devem ser atualizados a cada sprint.

**2. Testar em dispositivos reais cedo.** Emuladores não capturam problemas de notificações, SafeArea e WhatsApp deep links.

**3. Usar env vars para todos os secrets.** Nunca hardcode API keys, mesmo que sejam de teste. A migração posterior é custosa.

**4. Implementar fallbacks graceful para serviços externos.** O Supabase e o servidor principal devem falhar silenciosamente para não quebrar o app offline.

**5. Separar responsabilidades por plataforma.** O bugfix de notificações duplicadas mostrou a importância de tratar Android e iOS separadamente quando o comportamento nativo difere.

---

## Roadmap Futuro

### v2.0 (Q3 2026)

- [ ] Integração com wearables (Apple Watch, Wear OS)
- [ ] Notificações push personalizadas baseadas em métricas de saúde
- [ ] Suporte multilíngue (EN, ES, PT)
- [ ] Backup de dados de saúde (opt-in)

### v3.0 (Q1 2027)

- [ ] IA para recomendações de saúde personalizadas
- [ ] Integração com prontuário eletrônico
- [ ] Telemedicina (consultas com médicos)
- [ ] Integração com IoT (medidores de pressão, glicosímetro)

---

## Conclusão

O desenvolvimento do Vigora Saúde foi um processo iterativo de 10 sprints que evoluiu de um MVP básico para um app completo com monetização, dead man's switch e testes automatizados. As principais lições — documentar decisões, testar cedo, usar env vars e implementar fallbacks graceful — serão aplicadas em todos os desenvolvimentos futuros do projeto.
