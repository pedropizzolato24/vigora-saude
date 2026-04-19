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
