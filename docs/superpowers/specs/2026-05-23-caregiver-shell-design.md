# Caregiver Shell — Design

**Status:** Approved by user, ready for implementation plan
**Author:** Pedro + Claude (brainstorming session 2026-05-23)
**Scope:** Build the caregiver-side UI shell (navigation, screens, link wizard) with placeholder data. Real sync between caregiver and monitored is explicitly out of scope.

---

## 1. Background and intent

The app today is built around the **monitored** user (the patient): alarms, health metrics, emergency contacts, anamnesis, SOS, location sharing. The registration flow (Part 1) introduced a `userType` of either `caregiver` or `monitored`, but the UI still treats both identically — caregivers currently see the patient-centric experience.

This iteration delivers the **caregiver workflow as a shell** — every screen and the linking concept exists, but with placeholder states because no real data flows from a monitored user yet. When the sync between caregiver and monitored accounts is built later, those placeholders will be filled in without restructuring the navigation.

The model agreed for subscriptions (recorded here for context, implemented later):

- Subscription belongs to the **monitored "umbrella"**. Either side can be the payer.
- Any caregiver linked to a Pro monitored automatically inherits Pro.
- If no caregiver and no monitored pays, the umbrella loses Pro and all linked caregivers lose Pro with it.
- Caregiver cap per monitored is **not** implemented now but is anticipated for the future (see §10).

## 2. Decisions taken during brainstorming

| Decision | Choice |
|---|---|
| What does the caregiver manage now? | Shell / skeleton with placeholders ("aguardando vínculo") |
| How many monitored per caregiver? | One at a time |
| Bottom-tab structure | Caregiver-specific tabs (not shared with monitored) |
| Linking methods supported | All three: invite code, email/phone, QR code |
| Post-registration flow | Mini-onboarding (slides) + choice "Vincular agora" / "Explorar primeiro" |
| Routing approach | Separate route group `(caregiver-tabs)` |
| Pessoa-tab structure | Single rich screen with sections; no sub-stack details yet |

## 3. Routing and navigation

### Route layout

```
app/
├── (tabs)/                  ← existing, monitored-side, untouched
├── (caregiver-tabs)/        ← new
│   ├── _layout.tsx
│   ├── index.tsx            ← Aba 1: Início
│   ├── alerts.tsx           ← Aba 2: Alertas
│   ├── person.tsx           ← Aba 3: Pessoa (centerpiece)
│   ├── settings.tsx         ← Aba 4: Config
│   └── link.tsx             ← Wizard (3 métodos)
└── caregiver-onboarding.tsx ← Pré-tabs, primeira execução
```

### Bottom tab bar

A new `<CaregiverTabBar>` mirrors `components/custom-tab-bar.tsx` (same tokens, accessibility, badge style) with 4 items: **Início / Alertas / Pessoa / Config**. No Menu button — there is no sidebar for caregivers; all destinations sit inside the 4 tabs.

### Routing decisions

`components/onboarding-gate.tsx` gains a branch on `userType`:

| User state | Destination |
|---|---|
| Not authenticated | `/login` or `/onboarding?firstLaunch=true` (current behavior) |
| Authenticated, `userType == null` | `/register` (current behavior) |
| Authenticated, `userType == 'monitored'` | `/(tabs)` (current behavior) |
| Authenticated, `userType == 'caregiver'`, onboarding flag absent | `/caregiver-onboarding` |
| Authenticated, `userType == 'caregiver'`, onboarding flag present | `/(caregiver-tabs)` |

`app/oauth/callback.tsx` applies the same rules immediately after login completes.

`app/_layout.tsx` Stack additions:

```tsx
<Stack.Screen name="(caregiver-tabs)" />
<Stack.Screen name="caregiver-onboarding" options={{ gestureEnabled: false }} />
```

### Route protection

`(caregiver-tabs)/_layout.tsx` checks `Auth.getUserInfo()` on mount and `router.replace('/(tabs)')` if `userType !== 'caregiver'`. Defense in depth against deep links — the routing layer is the primary guarantee.

## 4. Tab contents

Each tab has two visible states: **without link** (caregiver just arrived) and **with link** (local stub exists). The shell handles both.

### Tab 1 — Início

- *Without link:* hero empty state with icon, title "Vincule uma pessoa monitorada para começar", large CTA "Vincular agora" → opens the link wizard.
- *With link:* hero card of the linked person (avatar/initials, name, relationship), status badge ("Aguardando sincronização com o app de [nome]"), summary cards: Próxima medicação, Última métrica, Último heartbeat, Alertas recentes (link to the Alertas tab). Each card is a placeholder with a short copy explaining what will appear when sync is active.

### Tab 2 — Alertas

- *Without link:* empty state — "Sem vínculo ativo" + CTA "Vincular agora".
- *With link:* empty list with explanatory block about what will appear (medicação perdida, SOS acionado, dead man's switch). Header with visual filter chips (Todos / Críticos / Avisos) that are inactive in the shell.

### Tab 3 — Pessoa (centerpiece)

- *Without link:* large empty card "Nenhuma pessoa monitorada ainda" + CTA "Vincular agora".
- *With link:* a single scrollable screen composed of sections:
  - **Header:** avatar/initials, name, relationship, link status, kebab button (desvincular / editar parentesco)
  - **Detalhes do vínculo:** "Vinculado via código / email / QR em DD/MM/AAAA"
  - **Medicações** — placeholder card + "Ver detalhes" (inactive)
  - **Saúde (métricas)** — placeholder card + "Ver detalhes" (inactive)
  - **Anamnese** — placeholder card
  - **Contatos de emergência da pessoa** — placeholder card
  - **Última localização compartilhada** — placeholder card
- The "Ver detalhes" CTAs are visually present but inactive, with a sub-label "Disponível quando a sincronização estiver ativa". When sync is real we wire them to dedicated detail screens.

### Tab 4 — Config

Sections:

- **Perfil do Cuidador** — name, phone, date of birth, blood type. Reuses `auth.updateProfile` mutation (Part 1).
- **Pessoa monitorada** — shortcut to manage the link (vincular / desvincular / trocar).
- **Notificações** — preferences for caregiver alerts. UI visible, no effect in the shell.
- **Aparência** — theme, font size, accessibility mode. Reuses existing controls.
- **Vigora Pro** — subscription card. Reuses current RevenueCat plumbing.
- **Ajuda e FAQ**.
- **Sair da conta**.

### Reuse principle

New screens live in `(caregiver-tabs)`. Granular reusable components (theme toggle, accessibility controls, font-size selector, Pro card) are **imported, not duplicated**. We do not duplicate UI primitives.

## 5. Linking flow

### Entry points

From Início CTA, Pessoa CTA, Config ("Pessoa monitorada"), or directly from the post-registration mini-onboarding.

### Wizard screen

`app/(caregiver-tabs)/link.tsx`, presented as a single screen with 3 method cards stacked:

1. **Código de convite** — 6-digit input auto-formatted as `XXX-XXX`, button "Vincular".
2. **Email ou telefone** — single input with a toggle between the two, button "Enviar pedido de vínculo".
3. **Escanear QR code** — opens camera (placeholder: any QR read counts as a stub).

### Behavior in the shell (no real sync yet)

All three paths converge to the same handler: persist a **local stub** representing the link. The shell accepts any input — validation only happens once real sync exists. Visual confirmation "Vínculo criado com [identificador]" → returns to Pessoa.

A short follow-up screen collects optional info: **parentesco** (preset list mãe/pai/filho/avó/… + "Outro") and **apelido/nome de exibição** (the caregiver can choose a different display name than what came from the invite).

### Stub model

```ts
interface LinkedMonitored {
  id: string;                              // uuid local
  method: 'code' | 'email_phone' | 'qr';
  identifier: string;                      // raw value typed/scanned
  displayName: string;                     // editable by caregiver
  relationship?: string;
  linkedAt: number;                        // epoch ms
  status: 'pending';                       // always 'pending' in the shell
}
```

Persisted at AsyncStorage key **`vigora_caregiver_state`** (separate from `vigora_app_state`). When real sync arrives, the backend will resolve `identifier` to a real account, flip status to `active`, and attach the real `monitoredOpenId`.

### Unlink / switch person

- **Desvincular:** clears the local stub. Caregiver returns to the empty state.
- **Trocar:** destructive confirmation → clears stub → reopens wizard. One person at a time.

## 6. Caregiver onboarding

### When it runs

The first time a caregiver lands in the app after completing registration. Controlled by an AsyncStorage flag: **`vigora_caregiver_onboarding_completed`**.

### Route

`app/caregiver-onboarding.tsx` — a root Stack screen (not inside `(caregiver-tabs)` because it's a pre-tabs experience). Visual style matches the existing `app/onboarding.tsx` (horizontal swipe, page indicators, same timing).

### Slides (4)

1. **"Bem-vindo, cuidador"** — heart/shield icon, one-line role explanation: "Acompanhe a saúde de quem você ama, sem precisar estar do lado."
2. **"Vincule a pessoa que você cuida"** — link icon, mentions the 3 methods.
3. **"Receba alertas em tempo real"** — bell icon, short list: medicação perdida, SOS acionado, alertas de saúde.
4. **"Pronto?"** — two actions:
   - **Primary CTA:** "Vincular agora" → `/(caregiver-tabs)/link`
   - **Secondary text link:** "Explorar primeiro" → `/(caregiver-tabs)/`

Either choice writes `vigora_caregiver_onboarding_completed = 'true'`.

### Reuse decision

If the slide renderer in `app/onboarding.tsx` is trivially extractable, both flows share a small `<OnboardingSlideshow>` helper. Otherwise we replicate the pattern in `caregiver-onboarding.tsx` — decided during implementation, **without refactoring the existing monitored onboarding unless the cost is clearly low**.

## 7. Data model and persistence

### Principle

Caregiver-specific state is **local-only** in the shell. No schema migration, no new tables, no new tRPC routes, no changes to the cloud sync from Part 2.

### Schema

```ts
// lib/caregiver-state.ts (types) + lib/caregiver-context.tsx (provider)
interface CaregiverState {
  linkedMonitored: LinkedMonitored | null;
  notificationPrefs?: {
    missedMedication: boolean;
    sosTriggered: boolean;
    deadManSwitch: boolean;
  };
}
```

### Access pattern

A new `<CaregiverProvider>` lives in `lib/caregiver-context.tsx`, mounted in `app/_layout.tsx` alongside `<AppProvider>`. It exposes:

- `state: CaregiverState`
- `setLinkedMonitored(stub: LinkedMonitored)`
- `clearLinkedMonitored()`
- `updateNotificationPrefs(partial)`

The provider persists state changes to AsyncStorage (`vigora_caregiver_state`) automatically — same effect-on-change pattern as `AppProvider`.

### What does NOT sync to the cloud in the shell

- `LinkedMonitored` (the stub) — local only. Reinstalling = re-link required. Documented limitation.
- `notificationPrefs` — local only.

### Migration path when real sync arrives

The stub becomes a real server row (likely a `caregiver_links` table keyed by `(caregiverOpenId, monitoredOpenId)` with real status). `CaregiverProvider` then hydrates from the server instead of AsyncStorage. None of the shell UI structure needs to change.

### Existing data behavior

A caregiver who used the app before this iteration (when monitored UI was shown to everyone) may have alarms/contacts/anamnesis in their `AppContext`. That data:

- Will **not** be visible in the caregiver UI (we don't expose those tabs).
- Will remain untouched in `AppContext` / AsyncStorage / cloud backup.
- Is not actively migrated or cleared.

## 8. File map

### New files (10)

```
app/(caregiver-tabs)/_layout.tsx
app/(caregiver-tabs)/index.tsx
app/(caregiver-tabs)/alerts.tsx
app/(caregiver-tabs)/person.tsx
app/(caregiver-tabs)/settings.tsx
app/(caregiver-tabs)/link.tsx
app/caregiver-onboarding.tsx
components/caregiver-tab-bar.tsx
components/caregiver-empty-state.tsx
lib/caregiver-context.tsx
```

### Modified files (3)

- `app/_layout.tsx` — mount `<CaregiverProvider>`; register `<Stack.Screen name="(caregiver-tabs)" />` and `<Stack.Screen name="caregiver-onboarding" />`.
- `components/onboarding-gate.tsx` — caregiver branch (onboarding-flag-based redirect).
- `app/oauth/callback.tsx` — same caregiver branch on post-login routing.

### Out of scope explicitly (this iteration)

No backend changes. No new tRPC routes. No database migrations.

## 9. Out of scope

Listed explicitly so we don't accidentally drift:

1. Real synchronization between caregiver ↔ monitored (data flowing between accounts).
2. Monitored-side counterparts to the link wizard: generating invite code, displaying QR, accepting incoming link requests.
3. Real QR validation (scanner opens but accepts anything as a stub).
4. Real push notifications and alerts firing — the Alertas tab is UI shell only.
5. Backend tables/routes for linking (no `caregiver_links` table).
6. Cloud sync of caregiver state (stub is local-only).
7. Multiple monitored persons per caregiver.
8. Caregiver cap per monitored — see §10.
9. Pro umbrella propagation logic — depends on real sync.
10. Detail screens inside Pessoa (Medicações/Saúde/Anamnese/Contatos/Localização) — the cards exist in the shell with "Ver detalhes" inactive.

**Accepted risk:** the Alertas tab will look empty even *with* a link, because nothing emits alerts yet. Mitigated by explanatory copy in the empty state.

## 10. Future considerations

- **Cap on caregivers per monitored.** Anti-abuse for the umbrella subscription model. We do not enforce a cap now (no Pro propagation in the shell anyway). Revisit once real sync is live and we have usage data: if a meaningful fraction of families exceeds ~5 linked caregivers, that's a signal for abuse. Suggested cap when introduced: 6 (matches the Spotify Family convention).
- **Multiple monitored persons per caregiver.** Adds a person switcher to the caregiver navigation. Out of scope now, but the data model (`LinkedMonitored` → list) and routing accept the upgrade without restructuring.
- **Real linking handshake** (monitored confirms the request).
- **Pro umbrella propagation** in the backend (compute Pro status across both sides of an active link).
- **Detail screens inside Pessoa** when sync delivers real data.
- **Caregiver-specific notifications** (push for missed alarms, SOS triggered, dead-man's-switch warnings).

## 11. Open questions deferred to implementation

- Whether to extract a shared `<OnboardingSlideshow>` from `app/onboarding.tsx` or replicate the pattern in `caregiver-onboarding.tsx`. Decide during implementation based on the actual cost of extraction.
- Whether to add a `vigora_caregiver_onboarding_completed` flag to `Auth` module (alongside the existing `vigora_login_completed`) or keep it inline in the caregiver-onboarding screen. Minor.
