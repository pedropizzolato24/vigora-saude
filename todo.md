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
