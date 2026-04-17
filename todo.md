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
