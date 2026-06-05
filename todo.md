# Vigora Saúde — TODO

## Setup & Configuration

- [x] Update theme.config.js with Vigora Saúde brand colors
- [x] Install expo-location dependency
- [x] Create lib/app-context.tsx (global state + AsyncStorage)
- [x] Create lib/notifications-context.tsx
- [x] Create lib/menu-context.tsx
- [x] Update app/_layout.tsx with all providers

## Navigation & Layout

- [x] Update app/(tabs)/_layout.tsx with custom tab bar (5 tabs)
- [x] Create components/custom-tab-bar.tsx
- [x] Create components/sidebar-menu.tsx
- [x] Add all icon mappings to icon-symbol.tsx

## Shared Components

- [x] Create components/alarm-card.tsx
- [x] Create components/contact-card.tsx

## Screens

- [x] Dashboard (app/(tabs)/index.tsx) — SOS button, status cards, quick actions
- [x] Alarmes (app/(tabs)/alarms.tsx) — CRUD alarmes
- [x] Saúde (app/(tabs)/health.tsx) — métricas de saúde
- [x] Configurações (app/(tabs)/settings.tsx) — preferências
- [x] Contatos (app/(tabs)/contacts.tsx) — contatos de emergência
- [x] Anamnese (app/(tabs)/anamnesis.tsx) — ficha médica
- [x] Ambulância (app/(tabs)/ambulance.tsx) — chamar ambulância
- [x] Localização (app/(tabs)/location.tsx) — compartilhar GPS

## Branding

- [x] Generate app logo (heart + ECG line on blue gradient)
- [x] Update app.config.ts with app name and logo
- [x] Copy logo to all required asset locations

## Final

- [x] Test all screens and flows
- [x] Fix TypeScript errors (only pre-existing server template error remains)
- [x] Add expo-location plugin to app.config.ts
- [x] Create checkpoint

## Post-Launch Features

- [x] Set app to light mode by default with dark mode toggle in Settings
- [x] Replace all hardcoded colors with theme tokens for full dark/light mode support

## Theme Consistency Audit

- [x] Review all hardcoded colors and replace with theme tokens
- [x] Verify all buttons use theme colors
- [x] Verify all icons use theme colors
- [x] Verify all text uses theme colors
- [x] Verify all backgrounds use theme colors
- [x] Test dark mode on all screens
- [x] Test light mode on all screens

## UI/UX Adjustments

- [x] Reorder tabs: Alarmes (left), Início (center), Saúde, Config
- [x] Add rounded borders to tab bar icon containers

## New Features in Development

- [ ] Implement alarm notifications with expo-notifications scheduling
- [ ] Add PDF export for Anamnesis medical form

## Completed Features

- [x] Alarm notifications with expo-notifications scheduling (daily, weekdays, weekends, one-time)
- [x] PDF export for Anamnesis medical form with sharing capability

## Current Work

- [x] Integrate alarm notifications with saved alarms (auto-schedule on add/update, cancel on delete)
- [x] Add notification ID tracking to Alarm type and AppState
- [x] Test alarm notifications fire at correct times

## In Progress

- [x] Sync alarms on app startup to reschedule lost notifications
- [x] Create AlarmSyncInitializer component to check and reschedule alarms
- [x] Handle edge cases (disabled alarms, past times, etc.)

## Feature Verification & Implementation

- [x] 1. Alarm escalation: Send notifications to emergency contacts if alarm not dismissed (with WhatsApp integration) — CREATED escalation utility
- [x] 2. Location sharing: Send real-time GPS location via Google Maps link in notifications — LOCATION SCREEN EXISTS
- [x] 3. Ambulance button: Pre-configured with SUS and health plan numbers — ALREADY IMPLEMENTED
- [x] 4. Ad banners: Monetization banners for commercial partners — CREATED COMPONENT & INTEGRATED

## Alarm Timeout Escalation Feature

- [x] Create alarm timeout manager utility
- [x] Add timeout tracking to Alarm interface
- [x] Implement auto-escalation after 2-3 minutes of no response
- [x] Add dismiss/snooze buttons to alarm notifications
- [x] Track escalation history in AppState

## Build Error Fixes

- [x] Remove pdfbox-android dependency causing build failure
- [x] Replace PDF generation with Expo-compatible solution (using expo-print + expo-sharing)
- [ ] Test APK build again

## UI/UX Improvements

- [x] Add ambulance call button next to/below SOS button on Dashboard

## Bug Fixes

- [x] Fix status bar overlap on all screens (added useSafeAreaInsets to all 8 screens, removed top edge from ScreenContainer)

## New Features - Contacts & WhatsApp Escalation

- [x] Integrate device contacts picker to import emergency contacts from phone agenda
- [x] Add configurable missed alarm threshold in Settings (1-10, with +/- controls)
- [x] Track consecutive missed alarms per user (with counter display)
- [x] Auto-send WhatsApp messages to emergency contacts when missed alarm threshold is reached
- [x] Include GPS location in WhatsApp escalation messages
- [x] Add missed alarm counter reset when user responds to alarm

## Onboarding Tutorial

- [x] Create onboarding screen with 5 animated slides explaining key features
- [x] Add first-launch detection with AsyncStorage
- [x] Integrate onboarding into app navigation flow (OnboardingGate component)
- [x] Add skip, next, and start buttons with animated dot progress indicators

## UI/UX Adjustments v2

- [x] 1. Standardize top padding across all screens (insets.top + 12, paddingHorizontal: 20, paddingVertical: 16)
- [x] 2. Fix tab bar icon rounding with consistent borderRadius: 12 on all states
- [x] 3. Improve contacts screen buttons (larger 44px touch targets, more spacing, row layout)
- [x] 4. Enhance dashboard quick action cards with 1.5px borders, chevron indicators, and tap hints
- [x] 5. Redesign Settings screen with 6 collapsible sections, new options (vibration, SOS confirmation, auto-location, font size, emergency message)

## User Profile & Animations

- [x] Create user profile screen with photo, name, blood type, and basic info
- [x] Add profile data to AppState and AppContext (UserProfile interface)
- [x] Integrate profile into sidebar menu (avatar + name at top, tap to edit)
- [x] Add image picker for profile photo (camera + gallery)
- [x] Add smooth transition animations (FadeInView, ScaleInView, StaggeredItem)
- [x] Add SOS button pulse animation (PulseView component)
- [x] Add card press animations with scale feedback (PressScale component)
- [x] Add fade-in animations on screen mount (header, cards, quick actions)

## Help/FAQ Screen

- [x] Create Help/FAQ screen with 8 sections and expandable questions
- [x] Add FAQ to sidebar menu navigation
- [x] Include sections: SOS, Alarmes, Contatos, Anamnese, Ambulância, Localização, Configurações, Perfil
- [x] Design for elderly users with large text (15-18px), clear icons, and high contrast

## Bug Fixes v2

- [x] Fix dashboard status cards layout (too narrow, text truncated, grid broken)
- [x] Move "Sobre e Legal" section from Settings dropdown to fixed footer at bottom of page

## UI Fixes v3

- [x] Move X (close) button on sidebar menu to be inline with profile block (remove empty space at top)
- [x] Fix white line gap between blue profile header and white menu body in sidebar
- [x] Improve alarm time picker: auto-insert colon between hours and minutes (no manual typing of ":")

## Alarm UX Improvements

- [x] Add +/- increment/decrement buttons to alarm time picker (hour and minute fields)
- [x] Show confirmation notification/toast when alarm is saved (with next occurrence info)

## Bug Fixes & Improvements v3

- [x] Fix SOS button pulse animation loop (cuts at wrong moment, visually jarring)
- [x] Improve FAQ text contrast for better readability against background
- [x] Implement working font size setting (small/medium/large) with persistence via AsyncStorage, default medium — applied to Dashboard, Alarmes, Configurações, FAQ; remaining screens pending

## Feature Expansion v4

- [x] Expand font size system to all remaining screens (Contacts, Health, Ambulance, Anamnesis, Location, Profile)
- [x] Add live font size preview in Settings font size section
- [x] Implement weekday selector (Mon-Sun checkboxes) for custom alarm repeat mode

## Alarm UX Improvements v2

- [x] Show selected custom days in alarm list card (e.g., "Seg, Qua, Sex")
- [x] Add full day name labels below weekday buttons in alarm modal

## Alarm UX Improvements v3

- [x] Add delete confirmation dialog for alarms (prevent accidental deletion)
- [x] Auto-sort alarms by time (ascending) after add/edit
- [x] Add active alarm badge counter on tab bar icon

## UI & Alarm System v4

- [x] Fix top safe area padding on all screens (standardize with status bar)
- [x] Fix badge overflow/clipping in tab bar (badge being cut off)
- [x] Improve alarm card edit/delete buttons (larger, more visible, spaced apart)
- [x] Implement full-screen alarm experience: sound (30s+), full-screen overlay, pulsing icon, name/description, countdown timer, dismiss button
- [x] Countdown timer on alarm screen: when reaches 0, auto-send WhatsApp message to all emergency contacts

## Alarm Test Feature

- [x] Add test button to each alarm card to simulate alarm firing (navigate to alarm-ring screen)

## Bug Fixes v5

- [x] Fix modal screens (Novo Alarme, Nova Métrica) showing behind status bar - add proper top padding
- [x] Fix tab bar active indicator losing border radius after switching tabs
- [x] Fix ambulance button misalignment on home screen
- [x] Fix SOS and alarm ring pulse animation loops - remove micro-pauses between cycles

## Health Metrics UX

- [x] Add green check confirmation animation when saving a new health metric

## Animation Refinements

- [x] Fix pulse animation loop: add min-to-1 transition to eliminate jump/cut at loop restart

## Alarm Card UX Improvements

- [x] Reorganize alarm card: move edit/delete buttons to bottom row (larger, distinct), increase sound/vibration buttons size

## Alarm Card & Tab Bar Fixes

- [x] Remove toggle from alarm card, make edit/delete buttons full-width at bottom of card
- [x] Fix tab bar active indicator border radius (not rounding after tab change)

## Alarmes Reais & WhatsApp Integration

- [x] Alarmes reais: canal Android MAX importance que sobrescreve modo silencioso/DND
- [x] Alarmes reais: som customizado (alarm-notification.wav) empacotado no build
- [x] Alarmes reais: permissões SCHEDULE_EXACT_ALARM, USE_FULL_SCREEN_INTENT, WAKE_LOCK
- [x] Alarmes reais: navegação automática para alarm-ring em foreground
- [x] Alarmes reais: navegação via getLastNotificationResponseAsync para cold start
- [x] Alarmes reais: navegação via addNotificationResponseReceivedListener para background
- [x] WhatsApp: integração híbrida implementada (deep link pessoal + fallback Business API)

## WhatsApp Hybrid Integration

- [x] Criar módulo server/whatsapp.ts para envio via WhatsApp Business API (Meta Cloud API)
- [x] Criar rota tRPC whatsapp.isConfigured e whatsapp.sendEmergencyAlert no servidor
- [x] Implementar lógica híbrida no cliente: deep link primeiro, fallback para API do servidor
- [x] Reescrever alarm-escalation.ts com sistema híbrido completo
- [x] Atualizar alarm-notification-handler.tsx para usar escalação híbrida
- [ ] Configurar secrets WHATSAPP_API_TOKEN e WHATSAPP_PHONE_NUMBER_ID (quando disponíveis)
- [ ] Testar fluxo completo com Business API ativa

## AlarmManager Nativo (expo-alarm-module)

- [x] Instalar expo-alarm-module e adicionar plugin ao app.config.ts
- [x] Criar lib/native-alarm-manager.ts com wrapper para scheduleAlarm/cancelAlarm/stopAlarm
- [x] Adicionar campo nativeAlarmUids à interface Alarm no app-context.tsx
- [x] Reescrever alarm-sync.ts com agendamento dual (AlarmManager + Notification)
- [x] Atualizar alarms.tsx para usar scheduleFullAlarm/cancelFullAlarm
- [x] Atualizar alarm-ring.tsx para chamar stopNativeAlarm ao dispensar

## Correção do Ícone Android

- [x] Corrigir zoom excessivo do ícone adaptativo Android (adicionar padding de zona segura ao foreground: artwork em 65% do canvas, 179px de margem em cada lado)
- [x] Atualizar backgroundColor do ícone adaptativo para #0033CC (combina com fundo azul do ícone)

## Leitura em Voz Alta (expo-speech)

- [x] Instalar expo-speech
- [x] Integrar Speech.speak() na tela alarm-ring para ler nome e descrição do alarme ao disparar
- [x] Adicionar botão "Ouvir novamente" para reler o alarme em voz alta
- [x] Parar speech ao dispensar o alarme (Speech.stop())
- [x] Implementar versão acessível com botão maior e texto mais claro
- [x] Usar idioma pt-BR (language: 'pt-BR') para voz em português

## Configurações de Voz (expo-speech)

- [x] Adicionar campos speechRate (0.5/0.75/1.0/1.25) e speechVolume (0.0–1.0) ao AppState/Settings
- [x] Adicionar seção "Voz do Alarme" na tela de Configurações com seletor de velocidade e slider de volume
- [x] Implementar modo acessível para a seção de configurações de voz
- [x] Atualizar alarm-ring.tsx para usar speechRate e speechVolume das configurações
- [x] Baixar volume do alarme durante a fala (ducking) para garantir que a voz seja audível
- [x] Restaurar volume do alarme após a fala terminar

## Timer Sincronizado e Notificação com Contagem Regressiva

- [x] Adicionar timerDuration (15/30/45/60s) ao AppSettings com padrão de 30s
- [x] Adicionar configuração de duração do timer no grupo Notificações e Alarmes do settings.tsx
- [x] Gravar timestamp de início do alarme no AsyncStorage ao disparar
- [x] Calcular tempo restante ao abrir alarm-ring.tsx (sincronização app ↔ notificação)
- [x] Implementar notificação com contagem regressiva atualizada a cada segundo
- [x] Cancelar notificações de contagem ao dispensar o alarme
- [x] Implementar modo acessível para a configuração de duração do timer

## Bug Fixes - Notificações v6

- [x] Remover notificação duplicada do alarme (aparece 2 notificações ao mesmo tempo)
- [x] Corrigir timer na notificação (contagem regressiva não está aparecendo)
- [x] Restaurar redirecionamento ao clicar na notificação (não abre a tela de alarme)

## Bug Fixes - Notificações v7

- [ ] Eliminar notificação duplicada do AlarmManager nativo (segunda notificação com botões Dispensar/Soneca)
- [ ] Implementar countdown funcional na notificação (texto com tempo restante)
- [ ] Corrigir redirecionamento ao clicar na notificação (abrir tela de alarme)

## Bug Fixes - Notificações v8 (2026-04-20)

- [x] Corrigir countdown em branco na notificação (updateAlarm não funciona em tempo real)
- [x] Corrigir sincronização do timer: ao entrar no app via notificação, countdown começa do zero
- [x] Remover botão Soneca da notificação nativa do alarme

## Permissão de Localização (2026-04-20)

- [x] Solicitar permissão de localização (foreground) no onboarding na abertura do app
- [x] Solicitar permissão de localização em background com guia passo a passo
- [x] Adicionar tela/modal de guia para ativar "Permitir o tempo todo" nas configurações do Android
- [x] Configurar ACCESS_BACKGROUND_LOCATION no app.config.ts
- [x] Instalar expo-location se não estiver instalado

## Status de Localização nas Configurações e Bug de Volume (2026-04-20)

- [ ] Adicionar status de permissão de localização (foreground/background/negada) na tela de Configurações
- [ ] Botão para abrir Configurações do sistema a partir da tela de Configurações do app
- [ ] Corrigir bug: volume do alarme não está sendo aplicado (alarme toca mesmo com volume em zero)

## Bug Fixes - Onboarding e Notificações v9 (2026-04-20)

- [x] Remover botão "Pular" do onboarding na primeira abertura (firstLaunch=true via URL param)
- [x] Corrigir countdown na notificação: canal separado vigora-countdown, dismissNotificationAsync antes de criar nova, remover supressão isCountdownUpdate no setNotificationHandler
- [x] Corrigir dessincronização do timer: passar expiresAt como URL param na navegação para alarm-ring (elimina race condition com AsyncStorage)
- [x] Adicionar status de permissão de localização nas Configurações (seção Segurança e Emergência)
- [x] Corrigir volume do alarme: stopNativeAlarm() no mount, volume definido 100ms após play()

## Widgets Android

- [x] Instalar react-native-android-widget
- [x] Configurar plugin no app.config.ts (NextAlarm e Sos)
- [x] Criar componente NextAlarmWidget (próximo alarme + medicamento)
- [x] Criar componente SosWidget (botão de emergência)
- [x] Criar widget-task-handler.tsx (WIDGET_ADDED, WIDGET_UPDATE, WIDGET_RESIZED, WIDGET_DELETED, WIDGET_CLICK)
- [x] Criar index.ts como entry point com registerWidgetTaskHandler
- [x] Criar update-widgets.ts para atualizar widgets quando alarmes mudarem
- [x] Integrar updateAllWidgets no AppProvider (useEffect em state.alarms)

## Widgets Android — Melhorias

- [x] Atualização do widget NextAlarm em tempo real quando alarme dispara (updateAlarmWidgetOnFire)
- [x] Restauração do widget NextAlarm após dispensar alarme (updateAlarmWidgetOnDismiss)
- [x] Novo widget Health com métricas de saúde (FC, PA, Glicemia) e indicadores de status
- [x] Widget Health integrado no widget-task-handler, app.config.ts e update-widgets

## Relatório de Saúde em PDF

- [x] Gerador de HTML com gráficos SVG inline (health-report-generator.ts)
- [x] Gráficos de evolução para FC, Pressão Arterial e Glicemia com faixa normal destacada
- [x] Tabela de leituras recentes por métrica com indicadores de status
- [x] Tabela de alarmes configurados com status
- [x] Cabeçalho com dados do paciente e período do relatório
- [x] Componente HealthReportButton com geração via expo-print e compartilhamento via expo-sharing
- [x] Botão compacto integrado no header da tela de Saúde

## Bug Fixes - Timer e Notificação (Revisão Definitiva)

- [x] Corrigir timer desync: ler timerDuration diretamente do AsyncStorage no alarm-notification-handler (evita stale closure)
- [x] Corrigir timer desync: ler timerDuration do AsyncStorage no alarm-ring como fallback
- [x] Corrigir cold start: criar timer no _layout.tsx antes de navegar para alarm-ring quando não há timer salvo
- [x] Remover dependências de state.alarms/state.settings do AppState listener no alarm-notification-handler (evita stale closure)
- [x] Documentar limitação: countdown na notificação nativa do expo-alarm-module não é tecnicamente viável sem código nativo customizado

## Módulo Nativo expo-alarm-countdown

- [x] Criar estrutura do módulo local (modules/expo-alarm-countdown)
- [x] Implementar módulo Android (Kotlin): ExpoAlarmCountdownModule.kt + ExpoAlarmCountdownPackage.kt
- [x] Implementar módulo iOS (Swift): ExpoAlarmCountdown.swift + ExpoAlarmCountdown.mm
- [x] Criar podspec iOS e build.gradle Android
- [x] Criar app.plugin.js para registrar o módulo no build (settings.gradle + app/build.gradle)
- [x] Reescrever alarm-countdown-notifier.ts para usar o módulo nativo
- [x] Integrar startCountdownNotification no alarm-notification-handler.tsx
- [x] Integrar stopCountdownNotification com alarmTitle no alarm-ring.tsx
- [x] Adicionar botão "Testar Countdown na Notificação" na tela de Configurações (modo normal + acessibilidade)
- [x] Botão mostra countdown de 10s com barra de progresso e estado ativo/cancelar

## AppDialog — Substituição de Alert.alert()

- [x] Criar components/app-dialog.tsx com hook useAppDialog, variantes info/warning/error/confirm, suporte a tema claro/escuro e modo acessível
- [x] Substituir Alert.alert() em app/(tabs)/profile.tsx
- [x] Substituir Alert.alert() em app/(tabs)/anamnesis.tsx (+ corrigir TS2657 com Fragment)
- [x] Substituir Alert.alert() em app/(tabs)/ambulance.tsx (+ corrigir TS2657 com Fragment)
- [x] Substituir Alert.alert() em app/(tabs)/health.tsx
- [x] Substituir Alert.alert() em app/(tabs)/settings.tsx
- [x] Substituir Alert.alert() em app/(tabs)/alarms.tsx
- [x] Substituir Alert.alert() em app/(tabs)/contacts.tsx
- [x] Substituir Alert.alert() em app/(tabs)/location.tsx
- [x] Substituir Alert.alert() em app/(tabs)/index.tsx (Dashboard/SOS)
- [x] Verificar TypeScript: zero erros novos (apenas pré-existente do storageProxy.ts)

## UX Improvements v5 — Dialog & Toast

- [x] Adicionar ícone animado (checkmark/warning/error) ao AppDialog para cada variante
- [x] Criar componente AppToast (snackbar) para confirmações rápidas sem modal
- [x] Integrar AppToast nas telas: contatos importados, alarme salvo, métrica salva, etc.
- [x] Criar variante SOS especial no AppDialog: fundo vermelho, ícone sirene pulsante
- [x] Atualizar diálogo SOS no index.tsx para usar variante 'sos'

## UX Improvements v6 — Haptic Toast & SOS Countdown

- [x] Adicionar haptic feedback no AppToast (success=Success, error=Error, warning=Medium, info=Light)
- [x] Criar SOSCountdownDialog com contador regressivo 3→2→1→0 e animação circular
- [x] Botão de cancelar durante a contagem regressiva do SOS
- [x] Integrar SOSCountdownDialog no index.tsx substituindo o AppDialog de confirmação SOS

## Bug: Countdown na notificação do alarme real (Android)

- [x] Investigar por que startCountdownNotification não é chamado quando o alarme nativo dispara
- [x] Corrigir o fluxo para que a notificação do alarme real mostre o countdown igual ao teste

## Otimização: Polling condicional do alarme nativo

- [x] Ativar polling apenas quando um alarme está próximo de disparar (janela de ~60s)
- [x] Parar polling automaticamente após alarme ser tratado ou dispensado

## Tela pós-SOS

- [x] Criar componente SOSActiveScreen (modal full-screen) com instruções de emergência
- [x] Exibir status de envio de mensagens para contatos de emergência
- [x] Botão para desativar o estado de emergência
- [x] Integrar no fluxo do index.tsx após confirmação do SOS

## Sistema de Monitoramento via Servidor

- [x] Schema DB: tabelas app_users, synced_alarms, device_heartbeat, alarm_events, warning_log
- [x] tRPC: registrar usuário do app (deviceId + contatos)
- [x] tRPC: sincronizar alarmes com o servidor
- [x] tRPC: registrar heartbeat periódico do dispositivo
- [x] tRPC: confirmar alarme (respondido/não respondido/não enviado)
- [x] Job servidor: verificar alarmes vencidos sem confirmação a cada 5min
- [x] Job servidor: detectar celular inativo (sem heartbeat) e marcar alarmes como "não enviado"
- [x] Job servidor: enviar mensagens progressivas (24h=aviso, 48h=preocupação, 72h+=alerta sério)
- [x] Cliente: serviço de heartbeat periódico (a cada 5min quando app ativo)
- [x] Cliente: sincronizar alarmes ao criar/editar/deletar
- [x] Cliente: confirmar alarme no alarm-ring (respondido/não respondido)
- [x] Cliente: detectar alarme não enviado ao religar e registrar como "não enviado"
- [x] Histórico de eventos: AlarmHistorySheet com botão na tela de alarmes
- [x] Banco de dados: tabelas criadas no TiDB via SQL direto

## Bug Fix: Safe Area em Modais/Sheets

- [x] Corrigir AlarmHistorySheet: título sobrepõe barra de notificação (falta insets.top no header)
- [x] Verificar outros modais/sheets com o mesmo problema (demais já têm insets.top correto)

## Notificação de Alarmes Offline

- [x] Detectar alarmes não enviados ao religar e exibir toast/dialog informativo
- [x] Mostrar quantidade de alarmes perdidos e se avisos foram enviados aos contatos

## Painel de Status do Monitoramento (Configurações)

- [x] Criar componente MonitoringStatusPanel com linguagem simples
- [x] Integrar na tela de Configurações (modo normal e acessível)

## Sistema de Fallback SOS (WhatsApp → Email → SMS)

- [x] Adicionar campo `email` opcional na interface EmergencyContact
- [x] Adicionar campo de email no formulário de criar/editar contato (contacts.tsx)
- [x] Criar serviço de email no servidor (Resend API) — server/email.ts
- [x] Criar serviço de SMS no servidor (Twilio) — server/sms.ts
- [x] Atualizar monitoring-job para tentar WhatsApp → Email → SMS em cascata
- [x] Atualizar schema do banco: adicionar email na interface EmergencyContactRecord (JSON column)
- [x] Atualizar sincronização de contatos para incluir email (monitoring-initializer + monitoring-service)
- [x] Adicionar variáveis de ambiente para email e SMS nas configurações do servidor (env.ts)
- [x] Atualizar schema Zod no router de monitoramento para aceitar email nos contatos

## Bug Fix: Conexão com servidor (superjson wrapper)

- [x] Corrigir trpcQuery e trpcMutation para extrair result.data.json (superjson wrapper)
- [x] O servidor usa superjson transformer: resposta era {result:{data:{json:{...}}}} mas código lia result.data em vez de result.data.json

## UX: Posição do painel de Monitoramento nas Configurações

- [x] Mover MonitoringStatusPanel para logo abaixo do toggle de Acessibilidade (modo normal)
- [x] Remover MonitoringStatusPanel da posição antiga (entre Segurança e Aparência)

## UX: Melhorias de Monitoramento v2

- [x] Mover MonitoringStatusPanel para logo abaixo do toggle de acessibilidade no modo acessível (settings.tsx)
- [x] Adicionar indicador visual de status do monitoramento no header do Dashboard (index.tsx)
- [x] Criar hook useMonitoringStatus reutilizável (hooks/use-monitoring-status.ts)
- [x] Criar componente MonitoringStatusBadge para o header (components/monitoring-status-badge.tsx)
- [x] Refatorar MonitoringStatusPanel para usar o hook useMonitoringStatus

## Bug Fix: Conexão com servidor (diagnóstico aprofundado - 2026-04-25)

- [x] Identificar causa raiz 1: EXPO_PUBLIC_API_BASE_URL aponta para URL temporária do sandbox (muda a cada restart)
- [x] Corrigir constants/oauth.ts: adicionar PRODUCTION_API_URL (vigoraapp-2ncfsgrj.manus.space) como fallback permanente para app nativo
- [x] Identificar causa raiz 2: ECONNRESET por timeout de conexão MySQL inativa (~8h sem keepAlive)
- [x] Corrigir server/db.ts: usar mysql2.createPool com enableKeepAlive e keepAliveInitialDelay em vez de drizzle(url)

## Integrações de Serviços de Mensagens (2026-04-25)

- [x] Validar chave Resend API (re_hs8dYCef_...) — 7/7 testes passaram
- [x] Validar credenciais Twilio (conta Trial ativa, número +15705590772 com SMS)
- [x] Configurar TWILIO_FROM_NUMBER=+15705590772 nas variáveis de ambiente
- [x] Melhorar server/email.ts: template HTML profissional com cores por severidade (info/warning/alert)
- [x] Melhorar server/sms.ts: tratamento de erro específico para conta Trial (código 21608), normalização E.164 melhorada
- [x] Criar tests/integration-services.test.ts para validar credenciais automaticamente

## Bug Fix: Notificações em branco (exceto teste)

- [x] Investigar causa raiz: expo-alarm-module pode falhar ao recuperar alarme do Storage (ZonedDateTime parse)
- [x] Corrigir: adicionado backup de notificação via expo-notifications no alarm-sync.ts (Android também agenda notificação como fallback)

## Bug Fix: Conexão persistente com o servidor

- [x] Remover credentials: "include" do fetch (causa problemas no React Native nativo)
- [x] Adicionar retry automático com backoff exponencial (até 2 tentativas) no trpcQuery e trpcMutation
- [x] Adicionar timeout de 15s com AbortController para evitar fetch pendente infinito
- [x] Adicionar logging detalhado ([Monitoring] URL, status, erro) para diagnóstico
- [x] Adicionar botão "Testar conexão" no MonitoringStatusPanel para diagnóstico no dispositivo

## RevenueCat SDK Integration

- [x] Instalar react-native-purchases e react-native-purchases-ui via pnpm
- [x] Adicionar permissão BILLING ao Android no app.config.ts
- [x] Criar lib/purchases.ts — serviço de compras com inicialização do SDK
- [x] Criar hooks/use-purchases.ts — hook para customerInfo, entitlements, compras
- [x] Criar context/purchases-context.tsx — contexto global de assinatura
- [x] Criar app/(modal)/paywall.tsx — tela modal de paywall com RevenueCatUI
- [x] Criar app/(modal)/customer-center.tsx — rota modal para Customer Center
- [x] Integrar inicialização do SDK no app/_layout.tsx
- [x] Adicionar PurchasesProvider no _layout.tsx
- [x] Adicionar rotas (modal)/paywall e (modal)/customer-center no Stack
- [x] Adicionar card "Vigora Pro" nas Configurações (com botão Assinar/Gerenciar)
- [x] Adicionar badge "PRO" no Dashboard quando assinante
- [x] Verificar TypeScript após integração — sem erros novos

## RevenueCat — Melhorias v2

### Opção 1: Guia de configuração do painel RevenueCat

- [x] Criar docs/REVENUECAT_SETUP.md com passo a passo completo (App Store Connect, Google Play, painel RC)

### Opção 2: Build EAS para desenvolvimento

- [x] Criar eas.json com profiles: development, simulator, preview, production
- [x] Adicionar scripts eas:build:* ao package.json
- [x] Instalar expo-dev-client e adicionar plugin no app.config.ts

### Opção 3: Restrição de recursos premium com isPro

- [x] Criar components/pro-gate.tsx com ProGate, ProBanner, ProLimitBadge, useProFeature, FREE_LIMITS
- [x] Contatos de emergência: limitar a 3 no plano gratuito (checkLimit + ProLimitBadge)
- [x] Exportação PDF de Anamnese: bloquear no plano gratuito (requirePro + ícone star no botão)
- [x] Monitoramento contínuo: ProGate com ProBanner fallback nas Configurações
- [x] Alarmes: limitar a 5 no plano gratuito (checkLimit + ProLimitBadge)

## RevenueCat — Melhorias v3

### Opção 2: Configurar Entitlement no painel RevenueCat

- [ ] Fazer login no painel RevenueCat com a chave sk_fK...
- [ ] Criar Entitlement "Vigora Saúde Pro"
- [ ] Criar produtos lifetime, yearly, monthly
- [ ] Criar Offering "default" com os 3 pacotes
- [ ] Vincular produtos ao Entitlement

### Opção 3: Testes automatizados do fluxo de compra

- [ ] Criar mock do react-native-purchases para testes
- [ ] Testar initializePurchases
- [ ] Testar checkProEntitlement (ativo/inativo)
- [ ] Testar purchasePackage (sucesso/erro)
- [ ] Testar restorePurchases
- [ ] Testar getOfferings

## RevenueCat — Melhorias v3.5

- [x] Configurar Entitlement "Vigora Saúde Pro" no painel RevenueCat
- [x] Verificar Offering default com 3 pacotes (lifetime, yearly, monthly)
- [x] Criar e publicar Paywall visual no painel RevenueCat (template Health)
- [x] Criar tests/purchases_isolated.test.ts com 35 testes automatizados
- [x] Criar vitest.config.ts com alias @, suporte JSX e define __DEV__

## RevenueCat — Upsell Contextual v4

- [ ] Criar components/pro-upsell-modal.tsx — modal de upsell contextual reutilizável
- [ ] Atualizar useProFeature para aceitar configuração de upsell contextual
- [ ] Integrar upsell contextual em contatos (4º contato bloqueado)
- [ ] Integrar upsell contextual em alarmes (6º alarme bloqueado)
- [ ] Integrar upsell contextual em exportação PDF da anamnese
- [ ] Integrar upsell contextual no monitoramento contínuo (Settings)

## RevenueCat — Upsell Contextual

- [x] Criar components/pro-upsell-modal.tsx com hook useProUpsell e componente UpsellModal
- [x] Integrar upsell contextual em contacts.tsx (limite de contatos)
- [x] Integrar upsell contextual em alarms.tsx (limite de alarmes)
- [x] Integrar upsell contextual em anamnesis.tsx (exportação PDF)
- [x] Integrar upsell contextual em settings.tsx (monitoramento contínuo)
- [x] Verificar TypeScript — sem erros novos (apenas pré-existente no storageProxy)
- [x] 35 testes automatizados passando

## Parte 1 — Bugfix: Notificações Duplicadas e em Branco

- [x] Remover agendamento de expo-notifications do alarm-sync.ts (manter apenas AlarmManager nativo)
- [x] Adicionar texto estático descritivo no native-alarm-manager.ts
- [x] Corrigir alarm-countdown-notifier.ts para não exibir countdown em foreground (AppState.active)

## Parte 2 — Migração para Supabase (Dead Man's Switch)

- [x] Instalar @supabase/supabase-js
- [x] Criar lib/supabase.ts com client e tipos
- [x] Criar lib/supabase-sync.ts com syncUser, syncAlarms, syncContacts, sendHeartbeat, createAlarmEvent, respondToAlarmEvent
- [x] Criar supabase/schema.sql com tabelas, RLS, índices e pg_cron
- [x] Criar supabase/functions/check-missed-alarms/index.ts (Edge Function)
- [x] Integrar supabase-sync no lib/app-context.tsx
- [x] Criar .env.example
- [x] Solicitar EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_ANON_KEY via secrets

## Parte 3 — RevenueCat com Trial de 7 Dias

- [x] Atualizar lib/purchases.ts com lógica de trial de 7 dias (firstLaunchDate)
- [x] Criar components/trial-banner.tsx com TrialBanner e ExpiredBanner
- [x] Integrar TrialBanner/ExpiredBanner no Dashboard (index.tsx)
- [x] Atualizar botão "Ver Planos" nas Configurações para mostrar dias restantes do trial

## GitHub Actions & Supabase Setup

- [x] Criar .github/workflows/test.yml com CI para rodar pnpm test a cada push
- [x] Executar supabase/schema.sql no painel Supabase (criar tabelas do dead man's switch) 

## Curadoria do Grafo de Conhecimento (Graphify)

> Resultado da análise de 45 grupos isolados via pipeline de 3 subagentes (remove-advocate → keep-advocate → analyzer).
> Ordem de execução: REPENSAR primeiro (decisões desbloqueiam trabalho downstream), depois REMOVER e MANTER em paralelo.

### REPENSAR — Decisões arquiteturais pendentes (executar primeiro)

- [x] REPENSAR: Decidir camada de tooling — drizzle.config.ts e drizzle/ ficam na raiz (convenção Drizzle Kit); mover quebraria imports em server/db.ts, server/db-monitoring.ts e server/_core/context.ts. DECISÃO: MANTER NA RAIZ.
- [x] REPENSAR: drizzle.config.ts não aparece como importado no grafo pois é lido pelo CLI drizzle-kit, não por módulos TS. Comportamento esperado — exceção de tooling CLI.
- [x] REPENSAR: theme.config.d.ts é arquivo de declaração ativo — lib/_core/theme.ts importa @/theme.config e usa themeColors. Graphify não rastreia .d.ts como importação explícita (lido pelo compilador TypeScript). Exceção documentada — sem ação.
- [x] REPENSAR: Screen Nodes A (HealthMonitoringScreen, WeeklyHealthReport etc.) — nenhum desses arquivos existe no codebase (grep retornou zero). São nós semânticos fantasma criados pelo extrator. Sem implementação real para reconectar — ignorar.
- [x] REPENSAR: sos-active-screen.tsx EXISTS e está ATIVO (components/sos-active-screen.tsx, importado 2x em app/(tabs)/index.tsx). emergency-contact-screen.tsx NÃO EXISTE — nó fantasma no grafo. Ambos sem ação de código necessária.
- [x] REPENSAR: eas.json existe mas é JSON puro — o extrator AST do graphify opera em TS/JS, não rastreia .json como módulo. Exceção documentada de configuração.
- [x] REPENSAR: HelloWave, ThemedText, ThemedView, ParallaxScrollView — nenhum arquivo encontrado no codebase. Removidos anteriormente. Nós fantasma no grafo — sem ação.
- [x] REPENSAR: Nó hooks isolado — hooks/ tem 6 arquivos individuais mas não tem index.ts (barrel export). O nó hooks no grafo é o diretório sem entry point — não é módulo real. Sem ação necessária.
- [x] REPENSAR: Assets Android (.xml, .png em android/) — extrator AST opera em TS/JS apenas. Recursos nativos não serão rastreados. Exceção de plataforma nativa documentada.
- [x] REPENSAR: notifications/index.ts — arquivo NÃO EXISTE (pasta notifications/ inexistente). Imports de notificação usam expo-notifications (lib externa) e lib/notifications-utils.ts. Nó fantasma no grafo.

### REMOVER — Nós/arquivos a deletar (podem ser executados em paralelo após REPENSAR)

- [x] REMOVER: `fix_colors.py` — DELETADO. Script com path hardcoded `/home/ubuntu/vigora-saude` do ambiente remoto destruído.
- [x] REMOVER: `.remember/tmp/last-ndc.ts` — DELETADO. Artefato temporário de sessão sem valor.
- [x] REMOVER: Nó "Brand Identity" standalone — nó semântico do graphify sem arquivo real correspondente. Sem ação de código.
- [x] REMOVER: `HelloWave`, `ThemedText`, `ThemedView`, `ParallaxScrollView` — confirmado: nenhum desses arquivos existe no codebase. Nós fantasma no grafo. Sem ação.
- [x] REMOVER: `simple.test.ts` — DELETADO. Teste placeholder de 9 linhas que só testa `obj.name === "test"`, sem cobertura real.
- [x] REMOVER: `locationSrc` e `monitorInitSrc` — variáveis em `tests/location-privacy.test.ts` que leem arquivos via readFileSync para validar strings de privacidade. Padrão legítimo de teste — MANTER. Graphify os interpretou erroneamente como nós standalone.
- [x] REMOVER: Nós `numbers`, `data`, `credentials` — variáveis locais em arquivos de teste, não módulos independentes. Nós do grafo sem arquivo real. Sem ação.
- [x] REMOVER: `.remember/` artefatos — diretório gerenciado pelo sistema de memória do Claude Code. NÃO TOCAR. Apenas `.remember/tmp/last-ndc.ts` deletado (item acima).
- [x] REMOVER: Artefatos de worktrees — gerenciados automaticamente pelo sistema de subagentes em `.claude/worktrees/`. NÃO TOCAR manualmente.
- [x] REMOVER: Auto-referência do Graphify — `graph.json`, `GRAPH_REPORT.md`, `wiki/index.md` são outputs do graphify que aparecem como nós no próprio grafo. Solução: adicionar ao `.graphifyignore` na próxima rodada de `graphify update`.
- [x] REMOVER: Nós semânticos duplicados (`HealthMonitoringConcept`, `VigoraSaudeBrandIdentity`) — confirmado: nenhum arquivo real. Nós fantasma do extrator. Sem ação.
- [x] REMOVER: Metadados de migração Drizzle (`_journal.json`, `dialect`, `version`, `entries`) — são arquivos internos do Drizzle Kit em `drizzle/meta/` e DEVEM ser mantidos (rastreiam quais migrations foram aplicadas). Nós isolados no grafo mas críticos para o pipeline. Sem ação.

### MANTER — Confirmar e reconectar ao grafo principal (após decisões REPENSAR)

- [ ] MANTER: Feature Concepts (B6) — `sos-countdown-dialog.tsx`, `sos-active-screen.tsx`, `app-dialog.tsx`, expo-speech em `alarm-ring.tsx` (7 call-sites), arquivos de widget; todos são código real e ativo
- [ ] MANTER: Declarações de tipo (B2) — `theme.config.d.ts` e tipos NativeWind; reconectar ao grafo adicionando edge de declaração para os consumidores
- [ ] MANTER: Scripts utilitários (B3) — `last-ndc.ts` (se for script válido após verificação) e outros scripts de manutenção com valor operacional confirmado
- [ ] MANTER: Testes críticos (B9) — testes de integração e unitários com cobertura real; reconectar apontando edges para os módulos que testam
- [ ] MANTER: Teste de integração (B10) — testa Resend email + Twilio SMS (não RevenueCat/Railway como assumido inicialmente); manter e reconectar ao módulo de notificações
- [ ] MANTER: Meta dev tools (B11) — `settings.local.json` no contexto do projeto principal (não worktrees), `eas.json`, arquivos de config de build; reconectar como nós de configuração
