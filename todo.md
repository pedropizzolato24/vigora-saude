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
