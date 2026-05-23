# Caregiver Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the caregiver-side UI shell (4 tabs, link wizard, onboarding) with placeholder data, routed via a separate Expo Router group.

**Architecture:** New `app/(caregiver-tabs)/` route group with its own tab bar and 4 screens (Início, Alertas, Pessoa, Config). Caregivers route to it from `OnboardingGate` and the OAuth callback based on `userType`. Caregiver-specific state (the linked-monitored stub) is local-only via a new `CaregiverProvider` + AsyncStorage key `vigora_caregiver_state`. No backend or schema changes.

**Tech Stack:** Expo Router 6, React Native 0.81, TypeScript, AsyncStorage, expo-crypto, expo-camera (for QR scan). Vitest for the reducer tests.

**Spec:** [`docs/superpowers/specs/2026-05-23-caregiver-shell-design.md`](../specs/2026-05-23-caregiver-shell-design.md)

---

### Task 1: Caregiver state types + reducer + tests

Pure state logic, fully testable. Establishes the foundation everything else depends on.

**Files:**
- Create: `lib/caregiver-state.ts`
- Test: `tests/caregiver-state.test.ts`

- [ ] **Step 1: Write the failing tests for the reducer**

Create `tests/caregiver-state.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  caregiverReducer,
  DEFAULT_CAREGIVER_STATE,
  type CaregiverState,
  type LinkedMonitored,
} from '@/lib/caregiver-state';

const link: LinkedMonitored = {
  id: 'uuid-1',
  method: 'code',
  identifier: '123456',
  displayName: 'Maria',
  relationship: 'mãe',
  linkedAt: 1_700_000_000_000,
  status: 'pending',
};

describe('caregiverReducer', () => {
  it('LOAD replaces the whole state', () => {
    const next = caregiverReducer(DEFAULT_CAREGIVER_STATE, {
      type: 'LOAD',
      payload: { ...DEFAULT_CAREGIVER_STATE, linkedMonitored: link },
    });
    expect(next.linkedMonitored).toEqual(link);
  });

  it('SET_LINK stores the stub', () => {
    const next = caregiverReducer(DEFAULT_CAREGIVER_STATE, { type: 'SET_LINK', payload: link });
    expect(next.linkedMonitored).toEqual(link);
  });

  it('CLEAR_LINK removes the stub', () => {
    const withLink: CaregiverState = { ...DEFAULT_CAREGIVER_STATE, linkedMonitored: link };
    const next = caregiverReducer(withLink, { type: 'CLEAR_LINK' });
    expect(next.linkedMonitored).toBeNull();
  });

  it('UPDATE_PREFS merges partial preferences', () => {
    const next = caregiverReducer(DEFAULT_CAREGIVER_STATE, {
      type: 'UPDATE_PREFS',
      payload: { missedMedication: false },
    });
    expect(next.notificationPrefs.missedMedication).toBe(false);
    expect(next.notificationPrefs.sosTriggered).toBe(DEFAULT_CAREGIVER_STATE.notificationPrefs.sosTriggered);
  });

  it('DEFAULT_CAREGIVER_STATE has all notification prefs on', () => {
    expect(DEFAULT_CAREGIVER_STATE.linkedMonitored).toBeNull();
    expect(DEFAULT_CAREGIVER_STATE.notificationPrefs).toEqual({
      missedMedication: true,
      sosTriggered: true,
      deadManSwitch: true,
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run tests/caregiver-state.test.ts`
Expected: FAIL with "Cannot find module '@/lib/caregiver-state'".

- [ ] **Step 3: Implement the types + reducer**

Create `lib/caregiver-state.ts`:

```ts
/**
 * caregiver-state.ts
 *
 * Pure types + reducer for the caregiver-side state. The state is wired to
 * a React provider in `lib/caregiver-context.tsx`; this file exists separately
 * so the reducer stays unit-testable and free of React/AsyncStorage imports.
 */

export type LinkMethod = 'code' | 'email_phone' | 'qr';

export interface LinkedMonitored {
  id: string;
  method: LinkMethod;
  identifier: string;
  displayName: string;
  relationship?: string;
  linkedAt: number;
  status: 'pending';
}

export interface CaregiverNotificationPrefs {
  missedMedication: boolean;
  sosTriggered: boolean;
  deadManSwitch: boolean;
}

export interface CaregiverState {
  linkedMonitored: LinkedMonitored | null;
  notificationPrefs: CaregiverNotificationPrefs;
}

export const DEFAULT_CAREGIVER_STATE: CaregiverState = {
  linkedMonitored: null,
  notificationPrefs: {
    missedMedication: true,
    sosTriggered: true,
    deadManSwitch: true,
  },
};

export type CaregiverAction =
  | { type: 'LOAD'; payload: CaregiverState }
  | { type: 'SET_LINK'; payload: LinkedMonitored }
  | { type: 'CLEAR_LINK' }
  | { type: 'UPDATE_PREFS'; payload: Partial<CaregiverNotificationPrefs> };

export function caregiverReducer(state: CaregiverState, action: CaregiverAction): CaregiverState {
  switch (action.type) {
    case 'LOAD':
      return action.payload;
    case 'SET_LINK':
      return { ...state, linkedMonitored: action.payload };
    case 'CLEAR_LINK':
      return { ...state, linkedMonitored: null };
    case 'UPDATE_PREFS':
      return {
        ...state,
        notificationPrefs: { ...state.notificationPrefs, ...action.payload },
      };
    default:
      return state;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run tests/caregiver-state.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/caregiver-state.ts tests/caregiver-state.test.ts
git commit -m "feat(caregiver): add caregiver state types and reducer"
```

---

### Task 2: CaregiverProvider (React context wrapping the reducer)

Wires the reducer to AsyncStorage and exposes mutation helpers. No tests — the reducer is already covered, and the provider is mostly persistence glue tested implicitly by use.

**Files:**
- Create: `lib/caregiver-context.tsx`

- [ ] **Step 1: Create the provider file**

Create `lib/caregiver-context.tsx`:

```tsx
/**
 * caregiver-context.tsx
 *
 * Provider around `caregiverReducer` that hydrates from / persists to
 * AsyncStorage under `vigora_caregiver_state`. Mounted in `app/_layout.tsx`
 * alongside `AppProvider`.
 *
 * Caregiver state is local-only in the shell — when real caregiver↔monitored
 * sync is built, this provider will hydrate from the server instead and the
 * `LinkedMonitored.status` will transition from 'pending' to 'active'.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import React, { createContext, useCallback, useContext, useEffect, useReducer, useState } from 'react';
import {
  DEFAULT_CAREGIVER_STATE,
  caregiverReducer,
  type CaregiverNotificationPrefs,
  type CaregiverState,
  type LinkMethod,
  type LinkedMonitored,
} from './caregiver-state';

const STORAGE_KEY = 'vigora_caregiver_state';

interface CaregiverContextValue {
  state: CaregiverState;
  setLinkedMonitored: (input: {
    method: LinkMethod;
    identifier: string;
    displayName: string;
    relationship?: string;
  }) => LinkedMonitored;
  clearLinkedMonitored: () => void;
  updateNotificationPrefs: (partial: Partial<CaregiverNotificationPrefs>) => void;
}

const CaregiverContext = createContext<CaregiverContextValue | null>(null);

export function CaregiverProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(caregiverReducer, DEFAULT_CAREGIVER_STATE);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<CaregiverState>;
          dispatch({
            type: 'LOAD',
            payload: {
              linkedMonitored: parsed.linkedMonitored ?? null,
              notificationPrefs: {
                ...DEFAULT_CAREGIVER_STATE.notificationPrefs,
                ...(parsed.notificationPrefs ?? {}),
              },
            },
          });
        }
      } catch {
        // ignore parse errors — start with defaults
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => {});
  }, [state, loaded]);

  const setLinkedMonitored = useCallback<CaregiverContextValue['setLinkedMonitored']>((input) => {
    const stub: LinkedMonitored = {
      id: Crypto.randomUUID(),
      method: input.method,
      identifier: input.identifier,
      displayName: input.displayName,
      relationship: input.relationship,
      linkedAt: Date.now(),
      status: 'pending',
    };
    dispatch({ type: 'SET_LINK', payload: stub });
    return stub;
  }, []);

  const clearLinkedMonitored = useCallback(() => dispatch({ type: 'CLEAR_LINK' }), []);
  const updateNotificationPrefs = useCallback<CaregiverContextValue['updateNotificationPrefs']>(
    (partial) => dispatch({ type: 'UPDATE_PREFS', payload: partial }),
    [],
  );

  return (
    <CaregiverContext.Provider
      value={{ state, setLinkedMonitored, clearLinkedMonitored, updateNotificationPrefs }}
    >
      {children}
    </CaregiverContext.Provider>
  );
}

export function useCaregiverContext(): CaregiverContextValue {
  const ctx = useContext(CaregiverContext);
  if (!ctx) throw new Error('useCaregiverContext must be used within CaregiverProvider');
  return ctx;
}
```

- [ ] **Step 2: Typecheck**

Run: `NODE_OPTIONS=--max-old-space-size=4096 pnpm check`
Expected: same pre-existing error in `tests/rate-limit.test.ts:106`, nothing new.

- [ ] **Step 3: Commit**

```bash
git add lib/caregiver-context.tsx
git commit -m "feat(caregiver): add CaregiverProvider with AsyncStorage persistence"
```

---

### Task 3: Mount CaregiverProvider + register Stack screens

Hooks the provider into the app tree and tells the router about the new screens. After this, nothing changes visually, but `useCaregiverContext()` is callable everywhere and the routes resolve.

**Files:**
- Modify: `app/_layout.tsx`

- [ ] **Step 1: Add the import for CaregiverProvider**

In `app/_layout.tsx`, add to the existing imports near the other `lib/*-context` imports:

```ts
import { CaregiverProvider } from '@/lib/caregiver-context';
```

- [ ] **Step 2: Wrap the existing provider tree with CaregiverProvider**

Find the `<AppProvider>` opening tag in the return statement and wrap it:

```tsx
<CaregiverProvider>
  <AppProvider>
    {/* existing children */}
  </AppProvider>
</CaregiverProvider>
```

Match the closing tag at the end of the AppProvider block.

- [ ] **Step 3: Register the two new Stack screens**

Inside the `<Stack screenOptions={{ headerShown: false }}>` block, after the existing `<Stack.Screen name="register" ... />` line, add:

```tsx
<Stack.Screen name="(caregiver-tabs)" />
<Stack.Screen name="caregiver-onboarding" options={{ gestureEnabled: false }} />
```

- [ ] **Step 4: Typecheck**

Run: `NODE_OPTIONS=--max-old-space-size=4096 pnpm check`
Expected: same pre-existing error only.

- [ ] **Step 5: Commit**

```bash
git add app/_layout.tsx
git commit -m "feat(caregiver): mount CaregiverProvider and register caregiver routes"
```

---

### Task 4: CaregiverEmptyState + CaregiverTabBar components

Two small shared components used by multiple screens.

**Files:**
- Create: `components/caregiver-empty-state.tsx`
- Create: `components/caregiver-tab-bar.tsx`

- [ ] **Step 1: Create CaregiverEmptyState**

Create `components/caregiver-empty-state.tsx`:

```tsx
/**
 * caregiver-empty-state.tsx
 *
 * Reusable "aguardando vínculo" empty state shown on caregiver tabs when
 * no monitored person is linked yet. Optionally renders a primary CTA.
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/use-colors';

interface Props {
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  title: string;
  description?: string;
  ctaLabel?: string;
  onCtaPress?: () => void;
}

export function CaregiverEmptyState({ icon, title, description, ctaLabel, onCtaPress }: Props) {
  const colors = useColors();
  return (
    <View style={styles.container}>
      <View style={[styles.iconCircle, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <MaterialIcons name={icon} size={56} color={colors.primary} />
      </View>
      <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
      {description ? (
        <Text style={[styles.description, { color: colors.muted }]}>{description}</Text>
      ) : null}
      {ctaLabel && onCtaPress ? (
        <Pressable
          onPress={onCtaPress}
          style={({ pressed }) => [
            styles.cta,
            { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <Text style={styles.ctaText}>{ctaLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 14 },
  iconCircle: {
    width: 112, height: 112, borderRadius: 56,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, marginBottom: 8,
  },
  title: { fontSize: 22, fontWeight: '800', textAlign: 'center' },
  description: { fontSize: 15, textAlign: 'center', lineHeight: 22, maxWidth: 320 },
  cta: {
    marginTop: 12, paddingVertical: 14, paddingHorizontal: 28,
    borderRadius: 14, minWidth: 200, alignItems: 'center',
  },
  ctaText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
```

- [ ] **Step 2: Create CaregiverTabBar**

Create `components/caregiver-tab-bar.tsx`. Mirror the visual approach of `components/custom-tab-bar.tsx` but with 4 items and no menu button:

```tsx
/**
 * caregiver-tab-bar.tsx
 *
 * Bottom tab bar for the (caregiver-tabs) group. 4 items: Início / Alertas /
 * Pessoa / Config. Style mirrors components/custom-tab-bar.tsx (same tokens,
 * accessibility behavior). No menu button — caregivers don't use the sidebar.
 */
import * as Haptics from 'expo-haptics';
import { usePathname, useRouter } from 'expo-router';
import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useColors } from '@/hooks/use-colors';
import { useAccessibility } from '@/lib/accessibility-context';

interface TabItem {
  label: string;
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  route: string;
}

const TABS: TabItem[] = [
  { label: 'Início', icon: 'home', route: '/(caregiver-tabs)/' },
  { label: 'Alertas', icon: 'notifications', route: '/(caregiver-tabs)/alerts' },
  { label: 'Pessoa', icon: 'person', route: '/(caregiver-tabs)/person' },
  { label: 'Config', icon: 'settings', route: '/(caregiver-tabs)/settings' },
];

export function CaregiverTabBar() {
  const colors = useColors();
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { isAccessibilityMode, a11yColors: ac } = useAccessibility();

  const bottomPadding = Platform.OS === 'web' ? 12 : Math.max(insets.bottom, 8);
  const tabBarHeight = isAccessibilityMode ? 80 + bottomPadding : 60 + bottomPadding;

  const isActive = (route: string) => {
    if (route === '/(caregiver-tabs)/') {
      return pathname === '/' || pathname === '/index' || pathname.endsWith('(caregiver-tabs)');
    }
    return pathname.includes(route.replace('/(caregiver-tabs)', ''));
  };

  const handlePress = async (tab: TabItem) => {
    if (Platform.OS !== 'web') {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    router.push(tab.route as any);
  };

  return (
    <View
      style={[
        styles.container,
        {
          height: tabBarHeight,
          paddingBottom: bottomPadding,
          backgroundColor: isAccessibilityMode ? ac.background : colors.background,
          borderTopColor: isAccessibilityMode ? ac.border : colors.border,
          borderTopWidth: isAccessibilityMode ? 2 : 0.5,
        },
      ]}
    >
      {TABS.map((tab) => {
        const active = isActive(tab.route);
        const tint = isAccessibilityMode
          ? (active ? ac.primary : ac.muted)
          : (active ? colors.primary : colors.muted);
        const iconSize = isAccessibilityMode ? 32 : 24;
        const labelSize = isAccessibilityMode ? 13 : 11;
        return (
          <Pressable
            key={tab.label}
            onPress={() => handlePress(tab)}
            accessibilityLabel={tab.label}
            accessibilityRole="button"
            style={({ pressed }) => [styles.tab, pressed && { opacity: 0.7 }]}
          >
            <View
              style={[
                styles.iconBackground,
                isAccessibilityMode
                  ? { width: 56, height: 40, borderRadius: 14, borderWidth: active ? 2 : 0, borderColor: ac.primary }
                  : { width: 48, height: 34, borderRadius: 12 },
                { backgroundColor: active ? tint + '20' : 'transparent' },
              ]}
            >
              <MaterialIcons name={tab.icon} size={iconSize} color={tint} />
            </View>
            <Text style={[styles.label, { color: tint, fontSize: labelSize }, active && styles.labelActive]}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', paddingTop: 6, alignItems: 'flex-start' },
  tab: { flex: 1, alignItems: 'center', gap: 3 },
  iconBackground: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  label: { fontSize: 11, fontWeight: '500', textAlign: 'center' },
  labelActive: { fontWeight: '700' },
});
```

- [ ] **Step 3: Typecheck**

Run: `NODE_OPTIONS=--max-old-space-size=4096 pnpm check`
Expected: same pre-existing error only.

- [ ] **Step 4: Commit**

```bash
git add components/caregiver-empty-state.tsx components/caregiver-tab-bar.tsx
git commit -m "feat(caregiver): add empty-state and tab bar components"
```

---

### Task 5: `(caregiver-tabs)/_layout.tsx` with route protection

Sets up the Tabs container, registers the 4 screens, and guards the route against non-caregiver users.

**Files:**
- Create: `app/(caregiver-tabs)/_layout.tsx`

- [ ] **Step 1: Create the layout file**

Create `app/(caregiver-tabs)/_layout.tsx`:

```tsx
import { Tabs, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CaregiverTabBar } from '@/components/caregiver-tab-bar';
import { useColors } from '@/hooks/use-colors';
import * as Auth from '@/lib/_core/auth';

export default function CaregiverTabLayout() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  // Defense in depth: a monitored user that somehow lands on a caregiver-tabs
  // deep link is redirected. The primary guarantee is OnboardingGate / OAuth
  // callback, but this avoids surprising state if something else routes here.
  useEffect(() => {
    (async () => {
      const user = await Auth.getUserInfo();
      if (user?.userType && user.userType !== 'caregiver') {
        router.replace('/(tabs)');
        return;
      }
      setChecked(true);
    })();
  }, [router]);

  if (!checked) return null;

  const bottomPadding = Platform.OS === 'web' ? 12 : Math.max(insets.bottom, 8);
  const tabBarHeight = 56 + bottomPadding;

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        tabBar={() => <CaregiverTabBar />}
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            height: tabBarHeight,
            backgroundColor: colors.background,
            borderTopColor: colors.border,
            borderTopWidth: 0.5,
          },
        }}
      >
        <Tabs.Screen name="index" options={{ title: 'Início' }} />
        <Tabs.Screen name="alerts" options={{ title: 'Alertas' }} />
        <Tabs.Screen name="person" options={{ title: 'Pessoa' }} />
        <Tabs.Screen name="settings" options={{ title: 'Configurações' }} />
      </Tabs>
    </View>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `NODE_OPTIONS=--max-old-space-size=4096 pnpm check`
Expected: same pre-existing error only.

- [ ] **Step 3: Commit**

```bash
git add app/(caregiver-tabs)/_layout.tsx
git commit -m "feat(caregiver): add tabs layout with route protection"
```

---

### Task 6: Four tab screens — empty (no-link) state only

Lands all 4 tabs as render-able files, each showing the appropriate empty state. The "with link" content for Início, Alertas, and Pessoa is added in later tasks. Settings gets its real content in Task 12 — for this task it just shows a placeholder so the tab is reachable.

**Files:**
- Create: `app/(caregiver-tabs)/index.tsx`
- Create: `app/(caregiver-tabs)/alerts.tsx`
- Create: `app/(caregiver-tabs)/person.tsx`
- Create: `app/(caregiver-tabs)/settings.tsx`

- [ ] **Step 1: Create Início (`index.tsx`)**

```tsx
import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { CaregiverEmptyState } from '@/components/caregiver-empty-state';
import { ScreenContainer } from '@/components/screen-container';
import { useCaregiverContext } from '@/lib/caregiver-context';

export default function CaregiverHomeScreen() {
  const router = useRouter();
  const { state } = useCaregiverContext();
  const linked = state.linkedMonitored;

  if (!linked) {
    return (
      <ScreenContainer>
        <CaregiverEmptyState
          icon="link"
          title="Vincule uma pessoa monitorada para começar"
          description="Você vai acompanhar a saúde dessa pessoa e receber alertas importantes."
          ctaLabel="Vincular agora"
          onCtaPress={() => router.push('/(caregiver-tabs)/link')}
        />
      </ScreenContainer>
    );
  }

  // Linked state implemented in Task 11.
  return <ScreenContainer><View /></ScreenContainer>;
}
```

- [ ] **Step 2: Create Alertas (`alerts.tsx`)**

```tsx
import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { CaregiverEmptyState } from '@/components/caregiver-empty-state';
import { ScreenContainer } from '@/components/screen-container';
import { useCaregiverContext } from '@/lib/caregiver-context';

export default function CaregiverAlertsScreen() {
  const router = useRouter();
  const { state } = useCaregiverContext();
  const linked = state.linkedMonitored;

  if (!linked) {
    return (
      <ScreenContainer>
        <CaregiverEmptyState
          icon="notifications-none"
          title="Sem vínculo ativo"
          description="Vincule uma pessoa monitorada para receber alertas."
          ctaLabel="Vincular agora"
          onCtaPress={() => router.push('/(caregiver-tabs)/link')}
        />
      </ScreenContainer>
    );
  }

  // Linked state implemented in Task 11.
  return <ScreenContainer><View /></ScreenContainer>;
}
```

- [ ] **Step 3: Create Pessoa (`person.tsx`)**

```tsx
import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { CaregiverEmptyState } from '@/components/caregiver-empty-state';
import { ScreenContainer } from '@/components/screen-container';
import { useCaregiverContext } from '@/lib/caregiver-context';

export default function CaregiverPersonScreen() {
  const router = useRouter();
  const { state } = useCaregiverContext();
  const linked = state.linkedMonitored;

  if (!linked) {
    return (
      <ScreenContainer>
        <CaregiverEmptyState
          icon="person-add"
          title="Nenhuma pessoa monitorada ainda"
          description="Adicione a pessoa que você cuida para começar a acompanhar."
          ctaLabel="Vincular agora"
          onCtaPress={() => router.push('/(caregiver-tabs)/link')}
        />
      </ScreenContainer>
    );
  }

  // Linked state implemented in Task 10.
  return <ScreenContainer><View /></ScreenContainer>;
}
```

- [ ] **Step 4: Create Configurações (`settings.tsx`) placeholder**

```tsx
import { Text, View } from 'react-native';
import { ScreenContainer } from '@/components/screen-container';
import { useColors } from '@/hooks/use-colors';

export default function CaregiverSettingsScreen() {
  const colors = useColors();
  return (
    <ScreenContainer>
      <View style={{ flex: 1, padding: 20 }}>
        <Text style={{ color: colors.foreground, fontSize: 24, fontWeight: '800' }}>
          Configurações
        </Text>
        <Text style={{ color: colors.muted, marginTop: 8 }}>
          Em construção — conteúdo completo na Task 12.
        </Text>
      </View>
    </ScreenContainer>
  );
}
```

- [ ] **Step 5: Typecheck**

Run: `NODE_OPTIONS=--max-old-space-size=4096 pnpm check`
Expected: same pre-existing error only.

- [ ] **Step 6: Commit**

```bash
git add app/(caregiver-tabs)/
git commit -m "feat(caregiver): add four tab screens with empty states"
```

---

### Task 7: Caregiver onboarding screen

4-slide intro shown the first time after registration. Same visual pattern as `app/onboarding.tsx`. Decision point: if extracting a shared slideshow from `app/onboarding.tsx` is trivial, do it. Otherwise replicate the pattern inline. Use replication unless the existing onboarding's slide rendering is already split into a clean reusable component — quick way to check: open `app/onboarding.tsx`, look for a self-contained slide-renderer; if it spans 50+ lines tangled with onboarding-specific logic, replicate.

**Files:**
- Create: `app/caregiver-onboarding.tsx`
- (Optional, only if extraction is cheap) Modify: `app/onboarding.tsx`

- [ ] **Step 1: Open `app/onboarding.tsx` and decide**

Open the file. If you find a focused slide renderer (e.g., a small component that just takes a list of `{title, description, icon}`), extract it to `components/onboarding-slideshow.tsx` and reuse. Otherwise — and this is the default — write `caregiver-onboarding.tsx` standalone, mirroring the pattern.

- [ ] **Step 2: Create `app/caregiver-onboarding.tsx`**

```tsx
/**
 * caregiver-onboarding.tsx
 *
 * One-time slideshow shown the first time a caregiver lands in the app after
 * completing registration. Sets `vigora_caregiver_onboarding_completed` on
 * exit so it never reappears.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import {
  Dimensions,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/use-colors';

const CAREGIVER_ONBOARDING_KEY = 'vigora_caregiver_onboarding_completed';
const { width } = Dimensions.get('window');

interface Slide {
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  title: string;
  description: string;
}

const SLIDES: Slide[] = [
  {
    icon: 'favorite',
    title: 'Bem-vindo, cuidador',
    description: 'Acompanhe a saúde de quem você ama, sem precisar estar do lado.',
  },
  {
    icon: 'link',
    title: 'Vincule a pessoa que você cuida',
    description: 'Por código de convite, email ou telefone, ou escaneando um QR code.',
  },
  {
    icon: 'notifications-active',
    title: 'Receba alertas em tempo real',
    description: 'Medicação perdida, SOS acionado e outros sinais importantes.',
  },
  {
    icon: 'check-circle',
    title: 'Pronto?',
    description: 'Vincule agora ou explore o app primeiro — você decide.',
  },
];

export default function CaregiverOnboardingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);

  const finish = async (destination: '/(caregiver-tabs)/link' | '/(caregiver-tabs)/') => {
    await AsyncStorage.setItem(CAREGIVER_ONBOARDING_KEY, 'true');
    router.replace(destination);
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const newIndex = Math.round(e.nativeEvent.contentOffset.x / width);
    if (newIndex !== index) setIndex(newIndex);
  };

  const goNext = () => {
    if (index < SLIDES.length - 1) {
      scrollRef.current?.scrollTo({ x: (index + 1) * width, animated: true });
    }
  };

  const isLast = index === SLIDES.length - 1;

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        style={{ flex: 1 }}
      >
        {SLIDES.map((slide) => (
          <View key={slide.title} style={[styles.slide, { width }]}>
            <View style={[styles.iconCircle, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <MaterialIcons name={slide.icon} size={72} color={colors.primary} />
            </View>
            <Text style={[styles.title, { color: colors.foreground }]}>{slide.title}</Text>
            <Text style={[styles.description, { color: colors.muted }]}>{slide.description}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={styles.indicators}>
        {SLIDES.map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              {
                backgroundColor: i === index ? colors.primary : colors.border,
                width: i === index ? 24 : 8,
              },
            ]}
          />
        ))}
      </View>

      <View style={[styles.actions, { paddingBottom: Math.max(insets.bottom, 16) + 12 }]}>
        {isLast ? (
          <>
            <Pressable
              onPress={() => finish('/(caregiver-tabs)/link')}
              style={({ pressed }) => [styles.primary, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}
            >
              <Text style={styles.primaryText}>Vincular agora</Text>
            </Pressable>
            <Pressable onPress={() => finish('/(caregiver-tabs)/')} hitSlop={8}>
              <Text style={[styles.secondary, { color: colors.muted }]}>Explorar primeiro</Text>
            </Pressable>
          </>
        ) : (
          <Pressable
            onPress={goNext}
            style={({ pressed }) => [styles.primary, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}
          >
            <Text style={styles.primaryText}>Continuar</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  slide: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 18 },
  iconCircle: {
    width: 144, height: 144, borderRadius: 72,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, marginBottom: 12,
  },
  title: { fontSize: 26, fontWeight: '800', textAlign: 'center' },
  description: { fontSize: 16, textAlign: 'center', lineHeight: 24, maxWidth: 320 },
  indicators: { flexDirection: 'row', justifyContent: 'center', gap: 6, paddingVertical: 16 },
  dot: { height: 8, borderRadius: 4 },
  actions: { paddingHorizontal: 24, gap: 14, alignItems: 'center' },
  primary: { width: '100%', paddingVertical: 16, borderRadius: 14, alignItems: 'center' },
  primaryText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  secondary: { fontSize: 14, fontWeight: '600', padding: 8 },
});
```

- [ ] **Step 3: Typecheck**

Run: `NODE_OPTIONS=--max-old-space-size=4096 pnpm check`
Expected: same pre-existing error only.

- [ ] **Step 4: Commit**

```bash
git add app/caregiver-onboarding.tsx
git commit -m "feat(caregiver): add post-registration onboarding slideshow"
```

---

### Task 8: Route caregivers through OnboardingGate + OAuth callback

Wires the routing decisions so caregivers actually land in the new shell.

**Files:**
- Modify: `components/onboarding-gate.tsx`
- Modify: `app/oauth/callback.tsx`

- [ ] **Step 1: Update `components/onboarding-gate.tsx`**

Add the constant at the top of the file (right after `LOGIN_COMPLETED_KEY`):

```ts
const CAREGIVER_ONBOARDING_KEY = 'vigora_caregiver_onboarding_completed';
```

Then replace the existing `if (!user.userType) { ... }` block (which lacks an early `return`) with a chain that handles all three userType cases. Find this block:

```ts
        if (!user.userType) {
          // Logged in but never finished the registration form
          router.replace('/register');
        }
```

Replace it with:

```ts
        if (!user.userType) {
          // Logged in but never finished the registration form
          router.replace('/register');
          return;
        }

        if (user.userType === 'caregiver') {
          const caregiverOnboardingDone = await AsyncStorage.getItem(CAREGIVER_ONBOARDING_KEY);
          router.replace(caregiverOnboardingDone ? '/(caregiver-tabs)' : '/caregiver-onboarding');
          return;
        }

        // userType === 'monitored' falls through: stays on /(tabs) (the gate
        // is mounted there, so no replace needed).
```

Update the function's JSDoc decision table to include the caregiver branch.

- [ ] **Step 2: Update `app/oauth/callback.tsx`**

Find the existing route-decision line near the end of `handleCallback`:

```ts
const nextRoute = result.user.userType ? "/(tabs)" : "/register";
```

Replace it with:

```ts
const CAREGIVER_ONBOARDING_KEY = 'vigora_caregiver_onboarding_completed';
let nextRoute: string;
if (!result.user.userType) {
  nextRoute = '/register';
} else if (result.user.userType === 'caregiver') {
  const flag = await AsyncStorage.getItem(CAREGIVER_ONBOARDING_KEY);
  nextRoute = flag ? '/(caregiver-tabs)' : '/caregiver-onboarding';
} else {
  nextRoute = '/(tabs)';
}
```

Move the `CAREGIVER_ONBOARDING_KEY` constant to module scope (above the component) if you prefer — both work.

- [ ] **Step 3: Typecheck**

Run: `NODE_OPTIONS=--max-old-space-size=4096 pnpm check`
Expected: same pre-existing error only.

- [ ] **Step 4: Manual smoke check**

Build a dev APK or run on web (`pnpm dev:metro`). Log in as a `userType: 'caregiver'` user (you may need to temporarily flip your test user's `userType` in the MySQL — `UPDATE users SET userType='caregiver' WHERE openId='...'`). You should land on `/caregiver-onboarding`, swipe through, and end up on either `/(caregiver-tabs)/link` or `/(caregiver-tabs)/` with the empty states visible.

- [ ] **Step 5: Commit**

```bash
git add components/onboarding-gate.tsx app/oauth/callback.tsx
git commit -m "feat(caregiver): route caregivers through onboarding and tabs"
```

---

### Task 9: Link wizard (3 methods + stub creation)

Single screen with the three method cards. QR uses `expo-camera` if available; otherwise show a "câmera não disponível" message and keep the other two methods functional.

**Files:**
- Create: `app/(caregiver-tabs)/link.tsx`

- [ ] **Step 1: Check whether `expo-camera` is installed**

Run: `pnpm list expo-camera 2>&1 | head -5`

If not installed, install it: `pnpm add expo-camera`. The QR scanner uses `CameraView` from this package.

- [ ] **Step 2: Create `app/(caregiver-tabs)/link.tsx`**

```tsx
/**
 * link.tsx — caregiver-side wizard for linking a monitored person.
 *
 * Three methods (code, email/phone, QR). In the shell, all three converge to
 * `setLinkedMonitored` with whatever the user entered/scanned — no validation
 * against a real server. Replaced by a real handshake when sync is built.
 */
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/use-colors';
import { useCaregiverContext } from '@/lib/caregiver-context';
import type { LinkMethod } from '@/lib/caregiver-state';

type Mode = 'code' | 'email_phone' | 'qr';

const RELATIONSHIP_OPTIONS = ['Mãe', 'Pai', 'Filho(a)', 'Avô(ó)', 'Esposo(a)', 'Outro'];

export default function LinkScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { setLinkedMonitored } = useCaregiverContext();

  const [mode, setMode] = useState<Mode | null>(null);
  const [identifier, setIdentifier] = useState('');
  const [emailPhone, setEmailPhone] = useState<'email' | 'phone'>('phone');
  const [displayName, setDisplayName] = useState('');
  const [relationship, setRelationship] = useState<string | null>(null);
  const [step, setStep] = useState<'method' | 'details'>('method');
  const [permission, requestPermission] = useCameraPermissions();

  const submitMethod = (method: LinkMethod, value: string) => {
    if (!value.trim()) return;
    setMode(method);
    setIdentifier(value.trim());
    setStep('details');
  };

  const confirm = () => {
    if (!mode) return;
    const finalName = displayName.trim() || identifier;
    setLinkedMonitored({
      method: mode,
      identifier,
      displayName: finalName,
      relationship: relationship ?? undefined,
    });
    router.replace('/(caregiver-tabs)/person');
  };

  if (step === 'details') {
    return (
      <KeyboardAvoidingView
        style={[styles.container, { backgroundColor: colors.background }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 },
          ]}
        >
          <Text style={[styles.title, { color: colors.foreground }]}>Falta pouco</Text>
          <Text style={[styles.subtitle, { color: colors.muted }]}>
            Como você quer chamar essa pessoa no app?
          </Text>

          <Text style={[styles.label, { color: colors.foreground }]}>Nome de exibição</Text>
          <TextInput
            value={displayName}
            onChangeText={setDisplayName}
            placeholder={identifier}
            placeholderTextColor={colors.muted}
            style={[styles.input, { color: colors.foreground, backgroundColor: colors.surface, borderColor: colors.border }]}
          />

          <Text style={[styles.label, { color: colors.foreground, marginTop: 16 }]}>Parentesco (opcional)</Text>
          <View style={styles.chipRow}>
            {RELATIONSHIP_OPTIONS.map((r) => {
              const selected = relationship === r;
              return (
                <Pressable
                  key={r}
                  onPress={() => setRelationship(selected ? null : r)}
                  style={({ pressed }) => [
                    styles.chip,
                    {
                      backgroundColor: selected ? colors.primary : colors.surface,
                      borderColor: selected ? colors.primary : colors.border,
                      opacity: pressed ? 0.85 : 1,
                    },
                  ]}
                >
                  <Text style={[styles.chipText, { color: selected ? '#FFFFFF' : colors.foreground }]}>{r}</Text>
                </Pressable>
              );
            })}
          </View>

          <Pressable
            onPress={confirm}
            style={({ pressed }) => [styles.primary, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}
          >
            <Text style={styles.primaryText}>Concluir vínculo</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 },
      ]}
    >
      <Text style={[styles.title, { color: colors.foreground }]}>Vincular pessoa monitorada</Text>
      <Text style={[styles.subtitle, { color: colors.muted }]}>
        Escolha como você quer vincular agora. Você sempre pode trocar o método nas configurações.
      </Text>

      <MethodCard
        icon="dialpad"
        title="Código de convite"
        description="A pessoa monitorada gera um código de 6 dígitos no app dela."
        onSubmit={(v) => submitMethod('code', v)}
        placeholder="123-456"
        keyboard="number-pad"
      />

      <MethodCard
        icon="alternate-email"
        title="Email ou telefone"
        description="Envie um pedido de vínculo para o email ou telefone cadastrado."
        onSubmit={(v) => submitMethod('email_phone', v)}
        placeholder={emailPhone === 'email' ? 'email@exemplo.com' : '(11) 99999-9999'}
        keyboard={emailPhone === 'email' ? 'email-address' : 'phone-pad'}
        toggle={{
          options: [
            { label: 'Telefone', value: 'phone' },
            { label: 'Email', value: 'email' },
          ],
          selected: emailPhone,
          onSelect: (v) => setEmailPhone(v as 'email' | 'phone'),
        }}
      />

      <View style={[styles.methodCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.methodHeader}>
          <MaterialIcons name="qr-code-scanner" size={26} color={colors.primary} />
          <Text style={[styles.methodTitle, { color: colors.foreground }]}>Escanear QR code</Text>
        </View>
        <Text style={[styles.methodDesc, { color: colors.muted }]}>
          A pessoa monitorada mostra um QR no app dela; aponte a câmera.
        </Text>

        {permission?.granted ? (
          <View style={styles.cameraBox}>
            <CameraView
              style={{ flex: 1 }}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={({ data }) => submitMethod('qr', data)}
            />
          </View>
        ) : (
          <Pressable
            onPress={requestPermission}
            style={({ pressed }) => [styles.secondary, { borderColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}
          >
            <Text style={[styles.secondaryText, { color: colors.primary }]}>Liberar câmera</Text>
          </Pressable>
        )}
      </View>
    </ScrollView>
  );
}

interface MethodCardProps {
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  title: string;
  description: string;
  placeholder: string;
  keyboard?: 'default' | 'email-address' | 'phone-pad' | 'number-pad';
  onSubmit: (value: string) => void;
  toggle?: {
    options: { label: string; value: string }[];
    selected: string;
    onSelect: (value: string) => void;
  };
}

function MethodCard({ icon, title, description, placeholder, keyboard, onSubmit, toggle }: MethodCardProps) {
  const colors = useColors();
  const [value, setValue] = useState('');
  return (
    <View style={[styles.methodCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.methodHeader}>
        <MaterialIcons name={icon} size={26} color={colors.primary} />
        <Text style={[styles.methodTitle, { color: colors.foreground }]}>{title}</Text>
      </View>
      <Text style={[styles.methodDesc, { color: colors.muted }]}>{description}</Text>

      {toggle ? (
        <View style={styles.toggleRow}>
          {toggle.options.map((opt) => {
            const selected = toggle.selected === opt.value;
            return (
              <Pressable
                key={opt.value}
                onPress={() => toggle.onSelect(opt.value)}
                style={[
                  styles.toggleBtn,
                  {
                    backgroundColor: selected ? colors.primary : 'transparent',
                    borderColor: selected ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text style={{ color: selected ? '#FFFFFF' : colors.foreground, fontWeight: '600', fontSize: 13 }}>
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <TextInput
        value={value}
        onChangeText={setValue}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        keyboardType={keyboard ?? 'default'}
        style={[styles.input, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]}
      />

      <Pressable
        onPress={() => onSubmit(value)}
        disabled={!value.trim()}
        style={({ pressed }) => [
          styles.primary,
          {
            backgroundColor: colors.primary,
            opacity: !value.trim() ? 0.5 : pressed ? 0.85 : 1,
          },
        ]}
      >
        <Text style={styles.primaryText}>Vincular</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, gap: 14 },
  title: { fontSize: 24, fontWeight: '800' },
  subtitle: { fontSize: 14, lineHeight: 20, marginBottom: 10 },
  label: { fontSize: 14, fontWeight: '600' },
  input: {
    paddingHorizontal: 14, paddingVertical: 12,
    borderRadius: 12, borderWidth: 1, fontSize: 16,
  },
  methodCard: { padding: 16, borderRadius: 16, borderWidth: 1, gap: 10 },
  methodHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  methodTitle: { fontSize: 17, fontWeight: '700' },
  methodDesc: { fontSize: 13, lineHeight: 18 },
  toggleRow: { flexDirection: 'row', gap: 8 },
  toggleBtn: {
    paddingVertical: 8, paddingHorizontal: 14,
    borderRadius: 10, borderWidth: 1,
  },
  primary: { paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginTop: 6 },
  primaryText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  secondary: { paddingVertical: 12, borderRadius: 12, alignItems: 'center', borderWidth: 1 },
  secondaryText: { fontSize: 14, fontWeight: '700' },
  cameraBox: { height: 220, borderRadius: 12, overflow: 'hidden' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1 },
  chipText: { fontSize: 14, fontWeight: '600' },
});
```

- [ ] **Step 3: Typecheck**

Run: `NODE_OPTIONS=--max-old-space-size=4096 pnpm check`
Expected: same pre-existing error only.

- [ ] **Step 4: Commit**

```bash
git add app/(caregiver-tabs)/link.tsx package.json pnpm-lock.yaml
git commit -m "feat(caregiver): add link wizard with three methods"
```

---

### Task 10: Pessoa tab — "with link" state (sections)

Adds the scrollable detail view with header, link details, and 5 placeholder section cards. The "Ver detalhes" CTAs are inactive in the shell.

**Files:**
- Modify: `app/(caregiver-tabs)/person.tsx`

- [ ] **Step 1: Replace the placeholder linked-state return**

In `app/(caregiver-tabs)/person.tsx`, replace `return <ScreenContainer><View /></ScreenContainer>;` (the linked branch) with a full implementation. Here's the complete file:

```tsx
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppDialog, useAppDialog } from '@/components/app-dialog';
import { CaregiverEmptyState } from '@/components/caregiver-empty-state';
import { ScreenContainer } from '@/components/screen-container';
import { useColors } from '@/hooks/use-colors';
import { useCaregiverContext } from '@/lib/caregiver-context';
import type { LinkMethod } from '@/lib/caregiver-state';

const METHOD_LABEL: Record<LinkMethod, string> = {
  code: 'código de convite',
  email_phone: 'email/telefone',
  qr: 'QR code',
};

function formatDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/).filter(Boolean).slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? '').join('') || '?';
}

export default function CaregiverPersonScreen() {
  const colors = useColors();
  const router = useRouter();
  const { state, clearLinkedMonitored } = useCaregiverContext();
  const linked = state.linkedMonitored;
  const { dialogProps, showDialog } = useAppDialog();
  const [menuOpen, setMenuOpen] = useState(false);

  if (!linked) {
    return (
      <ScreenContainer>
        <CaregiverEmptyState
          icon="person-add"
          title="Nenhuma pessoa monitorada ainda"
          description="Adicione a pessoa que você cuida para começar a acompanhar."
          ctaLabel="Vincular agora"
          onCtaPress={() => router.push('/(caregiver-tabs)/link')}
        />
      </ScreenContainer>
    );
  }

  const confirmUnlink = () => {
    setMenuOpen(false);
    showDialog({
      title: 'Desvincular pessoa',
      message: `Você quer mesmo desvincular ${linked.displayName}? Você poderá vincular de novo a qualquer momento.`,
      variant: 'confirm',
      buttons: [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Desvincular', style: 'destructive', onPress: () => clearLinkedMonitored() },
      ],
    });
  };

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={[styles.header, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
            <Text style={styles.avatarText}>{initialsOf(linked.displayName)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.name, { color: colors.foreground }]}>{linked.displayName}</Text>
            {linked.relationship ? (
              <Text style={[styles.relationship, { color: colors.muted }]}>{linked.relationship}</Text>
            ) : null}
            <View style={styles.statusRow}>
              <View style={[styles.statusDot, { backgroundColor: '#F59E0B' }]} />
              <Text style={[styles.statusText, { color: colors.muted }]}>
                Aguardando sincronização
              </Text>
            </View>
          </View>
          <Pressable
            onPress={() => setMenuOpen((v) => !v)}
            hitSlop={8}
            style={({ pressed }) => [{ padding: 8, opacity: pressed ? 0.6 : 1 }]}
          >
            <MaterialIcons name="more-vert" size={24} color={colors.foreground} />
          </Pressable>
        </View>

        {menuOpen ? (
          <View style={[styles.menu, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Pressable onPress={confirmUnlink} style={styles.menuItem}>
              <MaterialIcons name="link-off" size={20} color="#DC2626" />
              <Text style={[styles.menuItemText, { color: '#DC2626' }]}>Desvincular</Text>
            </Pressable>
          </View>
        ) : null}

        <Text style={[styles.linkInfo, { color: colors.muted }]}>
          Vinculado via {METHOD_LABEL[linked.method]} em {formatDate(linked.linkedAt)}
        </Text>

        <SectionCard icon="medication" title="Medicações" />
        <SectionCard icon="favorite" title="Saúde (métricas)" />
        <SectionCard icon="description" title="Anamnese" />
        <SectionCard icon="people" title="Contatos de emergência da pessoa" />
        <SectionCard icon="location-on" title="Última localização compartilhada" />
      </ScrollView>
      <AppDialog {...dialogProps} />
    </ScreenContainer>
  );
}

function SectionCard({ icon, title }: { icon: React.ComponentProps<typeof MaterialIcons>['name']; title: string }) {
  const colors = useColors();
  return (
    <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.sectionHeader}>
        <MaterialIcons name={icon} size={22} color={colors.primary} />
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{title}</Text>
      </View>
      <Text style={[styles.sectionBody, { color: colors.muted }]}>
        Aguardando sincronização com o app da pessoa monitorada.
      </Text>
      <View style={[styles.disabledCta, { borderColor: colors.border }]}>
        <Text style={[styles.disabledCtaText, { color: colors.muted }]}>
          Ver detalhes — disponível quando a sincronização estiver ativa
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    padding: 14, borderRadius: 16, borderWidth: 1,
  },
  avatar: {
    width: 64, height: 64, borderRadius: 32,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: '#FFFFFF', fontSize: 22, fontWeight: '800' },
  name: { fontSize: 19, fontWeight: '800' },
  relationship: { fontSize: 14, marginTop: 2 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 12 },
  menu: { borderRadius: 12, borderWidth: 1, padding: 4 },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10 },
  menuItemText: { fontSize: 15, fontWeight: '600' },
  linkInfo: { fontSize: 12, paddingHorizontal: 4 },
  section: { padding: 14, borderRadius: 14, borderWidth: 1, gap: 8 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '700' },
  sectionBody: { fontSize: 13, lineHeight: 18 },
  disabledCta: {
    paddingVertical: 10, paddingHorizontal: 12,
    borderRadius: 10, borderWidth: 1, alignItems: 'center', marginTop: 4,
  },
  disabledCtaText: { fontSize: 12, fontWeight: '600', textAlign: 'center' },
});
```

- [ ] **Step 2: Typecheck**

Run: `NODE_OPTIONS=--max-old-space-size=4096 pnpm check`
Expected: same pre-existing error only.

- [ ] **Step 3: Commit**

```bash
git add app/(caregiver-tabs)/person.tsx
git commit -m "feat(caregiver): add Pessoa tab linked-state with sections"
```

---

### Task 11: Início + Alertas — "with link" states

Hero card + summary cards on Início; explanatory empty list on Alertas.

**Files:**
- Modify: `app/(caregiver-tabs)/index.tsx`
- Modify: `app/(caregiver-tabs)/alerts.tsx`

- [ ] **Step 1: Replace `app/(caregiver-tabs)/index.tsx` with the full implementation**

```tsx
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CaregiverEmptyState } from '@/components/caregiver-empty-state';
import { ScreenContainer } from '@/components/screen-container';
import { useColors } from '@/hooks/use-colors';
import { useCaregiverContext } from '@/lib/caregiver-context';

function initialsOf(name: string): string {
  return name
    .split(/\s+/).filter(Boolean).slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? '').join('') || '?';
}

export default function CaregiverHomeScreen() {
  const colors = useColors();
  const router = useRouter();
  const { state } = useCaregiverContext();
  const linked = state.linkedMonitored;

  if (!linked) {
    return (
      <ScreenContainer>
        <CaregiverEmptyState
          icon="link"
          title="Vincule uma pessoa monitorada para começar"
          description="Você vai acompanhar a saúde dessa pessoa e receber alertas importantes."
          ctaLabel="Vincular agora"
          onCtaPress={() => router.push('/(caregiver-tabs)/link')}
        />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.hero, { backgroundColor: colors.primary }]}>
          <View style={styles.heroAvatar}>
            <Text style={styles.heroAvatarText}>{initialsOf(linked.displayName)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroName}>{linked.displayName}</Text>
            {linked.relationship ? (
              <Text style={styles.heroRel}>{linked.relationship}</Text>
            ) : null}
            <Text style={styles.heroStatus}>Aguardando sincronização com o app</Text>
          </View>
        </View>

        <SummaryCard icon="medication" title="Próxima medicação" body="Sem dados ainda." />
        <SummaryCard icon="favorite" title="Última métrica" body="Sem dados ainda." />
        <SummaryCard icon="wifi" title="Último heartbeat" body="Sem dados ainda." />

        <Pressable
          onPress={() => router.push('/(caregiver-tabs)/alerts')}
          style={({ pressed }) => [
            styles.alertsLink,
            { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <MaterialIcons name="notifications" size={22} color={colors.primary} />
          <Text style={[styles.alertsLinkText, { color: colors.foreground }]}>Alertas recentes</Text>
          <MaterialIcons name="chevron-right" size={22} color={colors.muted} />
        </Pressable>
      </ScrollView>
    </ScreenContainer>
  );
}

function SummaryCard({
  icon, title, body,
}: { icon: React.ComponentProps<typeof MaterialIcons>['name']; title: string; body: string }) {
  const colors = useColors();
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.cardHeader}>
        <MaterialIcons name={icon} size={22} color={colors.primary} />
        <Text style={[styles.cardTitle, { color: colors.foreground }]}>{title}</Text>
      </View>
      <Text style={[styles.cardBody, { color: colors.muted }]}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  hero: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    padding: 16, borderRadius: 18,
  },
  heroAvatar: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  heroAvatarText: { color: '#FFFFFF', fontSize: 20, fontWeight: '800' },
  heroName: { color: '#FFFFFF', fontSize: 19, fontWeight: '800' },
  heroRel: { color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: 2 },
  heroStatus: { color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 6 },
  card: { padding: 14, borderRadius: 14, borderWidth: 1, gap: 6 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { fontSize: 16, fontWeight: '700' },
  cardBody: { fontSize: 13, lineHeight: 18 },
  alertsLink: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 14, borderRadius: 14, borderWidth: 1,
  },
  alertsLinkText: { flex: 1, fontSize: 15, fontWeight: '700' },
});
```

- [ ] **Step 2: Replace `app/(caregiver-tabs)/alerts.tsx`**

```tsx
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CaregiverEmptyState } from '@/components/caregiver-empty-state';
import { ScreenContainer } from '@/components/screen-container';
import { useColors } from '@/hooks/use-colors';
import { useCaregiverContext } from '@/lib/caregiver-context';

type Filter = 'all' | 'critical' | 'warning';

export default function CaregiverAlertsScreen() {
  const colors = useColors();
  const router = useRouter();
  const { state } = useCaregiverContext();
  const linked = state.linkedMonitored;
  const [filter, setFilter] = useState<Filter>('all');

  if (!linked) {
    return (
      <ScreenContainer>
        <CaregiverEmptyState
          icon="notifications-none"
          title="Sem vínculo ativo"
          description="Vincule uma pessoa monitorada para receber alertas."
          ctaLabel="Vincular agora"
          onCtaPress={() => router.push('/(caregiver-tabs)/link')}
        />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <View style={styles.filters}>
        {(['all', 'critical', 'warning'] as Filter[]).map((f) => {
          const selected = filter === f;
          const label = f === 'all' ? 'Todos' : f === 'critical' ? 'Críticos' : 'Avisos';
          return (
            <Pressable
              key={f}
              onPress={() => setFilter(f)}
              style={({ pressed }) => [
                styles.filter,
                {
                  backgroundColor: selected ? colors.primary : colors.surface,
                  borderColor: selected ? colors.primary : colors.border,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <Text style={[styles.filterText, { color: selected ? '#FFFFFF' : colors.foreground }]}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={[styles.explainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <MaterialIcons name="info-outline" size={28} color={colors.primary} />
          <Text style={[styles.explainerTitle, { color: colors.foreground }]}>
            Aguardando dados do monitorado
          </Text>
          <Text style={[styles.explainerBody, { color: colors.muted }]}>
            Aqui vão aparecer alertas como medicação perdida, SOS acionado e avisos do dead man's switch.
            A lista fica vazia até a sincronização entre os dois apps estar ativa.
          </Text>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  filters: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 12 },
  filter: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1 },
  filterText: { fontSize: 13, fontWeight: '600' },
  body: { padding: 16, gap: 12 },
  explainer: { padding: 18, borderRadius: 14, borderWidth: 1, alignItems: 'center', gap: 10 },
  explainerTitle: { fontSize: 17, fontWeight: '700', textAlign: 'center' },
  explainerBody: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
});
```

- [ ] **Step 3: Typecheck**

Run: `NODE_OPTIONS=--max-old-space-size=4096 pnpm check`
Expected: same pre-existing error only.

- [ ] **Step 4: Commit**

```bash
git add app/(caregiver-tabs)/index.tsx app/(caregiver-tabs)/alerts.tsx
git commit -m "feat(caregiver): add linked-state for Início and Alertas tabs"
```

---

### Task 12: Settings tab — full content

Composes the caregiver's settings: profile (with `auth.updateProfile`), link management, notification prefs, appearance, Pro card, help, logout.

**Files:**
- Modify: `app/(caregiver-tabs)/settings.tsx`

- [ ] **Step 1: Replace the placeholder with the full screen**

The screen reuses smaller behavior from the existing monitored `app/(tabs)/settings.tsx` (theme toggle, font size, accessibility, Pro card). Open that file as a reference for the exact components/hooks already in the codebase (`useThemeContext`, `useFontSize`, `useAccessibility`, `usePurchases`, `useProUpsell`). The caregiver version is leaner — fewer sections, no monitoring panel.

```tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View,
} from 'react-native';
import { AppDialog, useAppDialog } from '@/components/app-dialog';
import { ScreenContainer } from '@/components/screen-container';
import { useColors } from '@/hooks/use-colors';
import { useAuth } from '@/hooks/use-auth';
import * as Auth from '@/lib/_core/auth';
import { useCaregiverContext } from '@/lib/caregiver-context';
import { trpc } from '@/lib/trpc';

export default function CaregiverSettingsScreen() {
  const colors = useColors();
  const router = useRouter();
  const { logout } = useAuth();
  const { state, clearLinkedMonitored, updateNotificationPrefs } = useCaregiverContext();
  const { dialogProps, showDialog } = useAppDialog();

  const updateProfile = trpc.auth.updateProfile.useMutation();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Auth.getUserInfo().then((u) => {
      setName(u?.name ?? '');
      setPhone(u?.phone ?? '');
    });
  }, []);

  const saveProfile = async () => {
    setSaving(true);
    try {
      const updated = await updateProfile.mutateAsync({
        name: name.trim() || undefined,
        phone: phone.replace(/\D/g, '') || undefined,
      });
      const existing = await Auth.getUserInfo();
      if (existing) {
        await Auth.setUserInfo({
          ...existing,
          name: updated.name,
          phone: updated.phone,
        });
      }
      setEditing(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao salvar.';
      showDialog({ title: 'Erro', message, variant: 'warning', buttons: [{ text: 'OK' }] });
    } finally {
      setSaving(false);
    }
  };

  const confirmUnlink = () => {
    if (!state.linkedMonitored) return;
    showDialog({
      title: 'Desvincular pessoa',
      message: `Desvincular ${state.linkedMonitored.displayName}?`,
      variant: 'confirm',
      buttons: [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Desvincular', style: 'destructive', onPress: () => clearLinkedMonitored() },
      ],
    });
  };

  const confirmLogout = () => {
    showDialog({
      title: 'Sair da conta',
      message: 'Você terá que entrar de novo para usar o app.',
      variant: 'confirm',
      buttons: [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sair',
          style: 'destructive',
          onPress: async () => {
            await logout();
            // Clear caregiver-scoped local data so a different caregiver
            // signing in on the same device starts fresh (sees the
            // onboarding slideshow and has no leftover link stub).
            await AsyncStorage.multiRemove([
              'vigora_caregiver_state',
              'vigora_caregiver_onboarding_completed',
            ]);
            router.replace('/login');
          },
        },
      ],
    });
  };

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Perfil do Cuidador */}
        <Section title="Perfil do Cuidador">
          {editing ? (
            <View style={{ gap: 10 }}>
              <Text style={[styles.label, { color: colors.muted }]}>Nome</Text>
              <TextInput
                value={name} onChangeText={setName}
                style={[styles.input, { color: colors.foreground, backgroundColor: colors.surface, borderColor: colors.border }]}
              />
              <Text style={[styles.label, { color: colors.muted }]}>Telefone</Text>
              <TextInput
                value={phone} onChangeText={setPhone} keyboardType="phone-pad"
                style={[styles.input, { color: colors.foreground, backgroundColor: colors.surface, borderColor: colors.border }]}
              />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Pressable
                  onPress={() => setEditing(false)}
                  style={({ pressed }) => [styles.secondaryBtn, { borderColor: colors.border, opacity: pressed ? 0.85 : 1 }]}
                >
                  <Text style={{ color: colors.foreground, fontWeight: '600' }}>Cancelar</Text>
                </Pressable>
                <Pressable
                  onPress={saveProfile} disabled={saving}
                  style={({ pressed }) => [styles.primaryBtn, { backgroundColor: colors.primary, opacity: saving ? 0.6 : pressed ? 0.85 : 1 }]}
                >
                  {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryBtnText}>Salvar</Text>}
                </Pressable>
              </View>
            </View>
          ) : (
            <View>
              <Text style={[styles.kv, { color: colors.foreground }]}>{name || '—'}</Text>
              <Text style={[styles.kvSub, { color: colors.muted }]}>{phone || 'Sem telefone'}</Text>
              <Pressable onPress={() => setEditing(true)} hitSlop={6}>
                <Text style={[styles.editLink, { color: colors.primary }]}>Editar</Text>
              </Pressable>
            </View>
          )}
        </Section>

        {/* Pessoa monitorada */}
        <Section title="Pessoa monitorada">
          {state.linkedMonitored ? (
            <View style={{ gap: 8 }}>
              <Text style={[styles.kv, { color: colors.foreground }]}>{state.linkedMonitored.displayName}</Text>
              <Text style={[styles.kvSub, { color: colors.muted }]}>
                {state.linkedMonitored.relationship ?? 'Sem parentesco'}
              </Text>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                <Pressable onPress={confirmUnlink}>
                  <Text style={[styles.editLink, { color: '#DC2626' }]}>Desvincular</Text>
                </Pressable>
                <Pressable onPress={() => router.push('/(caregiver-tabs)/link')}>
                  <Text style={[styles.editLink, { color: colors.primary }]}>Trocar</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable
              onPress={() => router.push('/(caregiver-tabs)/link')}
              style={({ pressed }) => [styles.primaryBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}
            >
              <Text style={styles.primaryBtnText}>Vincular agora</Text>
            </Pressable>
          )}
        </Section>

        {/* Notificações */}
        <Section title="Notificações">
          <ToggleRow
            label="Medicação perdida"
            value={state.notificationPrefs.missedMedication}
            onChange={(v) => updateNotificationPrefs({ missedMedication: v })}
          />
          <ToggleRow
            label="SOS acionado"
            value={state.notificationPrefs.sosTriggered}
            onChange={(v) => updateNotificationPrefs({ sosTriggered: v })}
          />
          <ToggleRow
            label="Dead man's switch"
            value={state.notificationPrefs.deadManSwitch}
            onChange={(v) => updateNotificationPrefs({ deadManSwitch: v })}
          />
          <Text style={[styles.note, { color: colors.muted }]}>
            As notificações começarão a chegar quando a sincronização estiver ativa.
          </Text>
        </Section>

        {/* Aparência — link to monitored settings deep links would be ideal, but
            those controls live in app/(tabs)/settings.tsx and are tightly coupled
            there. For the shell, show a hint and a Pressable that takes them to
            the monitored settings tab (still accessible via deep link). */}
        <Section title="Aparência e acessibilidade">
          <Text style={[styles.note, { color: colors.muted }]}>
            Tema, tamanho de fonte e modo acessibilidade são configurados no app
            todo. Toque abaixo para abrir os controles existentes.
          </Text>
          <Pressable
            onPress={() => router.push('/(tabs)/settings')}
            style={({ pressed }) => [styles.secondaryBtn, { borderColor: colors.border, opacity: pressed ? 0.85 : 1 }]}
          >
            <Text style={{ color: colors.foreground, fontWeight: '600' }}>Abrir configurações de aparência</Text>
          </Pressable>
        </Section>

        {/* Vigora Pro — link to existing paywall */}
        <Section title="Vigora Pro">
          <Pressable
            onPress={() => router.push('/(modal)/paywall')}
            style={({ pressed }) => [styles.primaryBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}
          >
            <Text style={styles.primaryBtnText}>Ver planos</Text>
          </Pressable>
        </Section>

        {/* Ajuda */}
        <Section title="Ajuda e FAQ">
          <Pressable
            onPress={() => router.push('/(tabs)/help')}
            style={({ pressed }) => [styles.secondaryBtn, { borderColor: colors.border, opacity: pressed ? 0.85 : 1 }]}
          >
            <Text style={{ color: colors.foreground, fontWeight: '600' }}>Abrir ajuda</Text>
          </Pressable>
        </Section>

        {/* Logout */}
        <Pressable
          onPress={confirmLogout}
          style={({ pressed }) => [styles.logoutBtn, { borderColor: '#DC2626', opacity: pressed ? 0.85 : 1 }]}
        >
          <MaterialIcons name="logout" size={20} color="#DC2626" />
          <Text style={styles.logoutText}>Sair da conta</Text>
        </Pressable>
      </ScrollView>
      <AppDialog {...dialogProps} />
    </ScreenContainer>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const colors = useColors();
  return (
    <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{title}</Text>
      {children}
    </View>
  );
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  const colors = useColors();
  return (
    <View style={styles.toggleRow}>
      <Text style={{ color: colors.foreground, fontSize: 15, flex: 1 }}>{label}</Text>
      <Switch value={value} onValueChange={onChange} />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  section: { padding: 14, borderRadius: 14, borderWidth: 1, gap: 10 },
  sectionTitle: { fontSize: 16, fontWeight: '700' },
  kv: { fontSize: 16, fontWeight: '600' },
  kvSub: { fontSize: 13, marginTop: 2 },
  editLink: { fontSize: 14, fontWeight: '700', marginTop: 6 },
  label: { fontSize: 13, fontWeight: '600' },
  input: { paddingHorizontal: 14, paddingVertical: 12, borderRadius: 10, borderWidth: 1, fontSize: 15 },
  primaryBtn: { paddingVertical: 12, borderRadius: 12, alignItems: 'center', flex: 1 },
  primaryBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  secondaryBtn: { paddingVertical: 12, borderRadius: 12, alignItems: 'center', borderWidth: 1, flex: 1 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  note: { fontSize: 12, lineHeight: 18 },
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, padding: 14, borderRadius: 12, borderWidth: 1, marginTop: 12,
  },
  logoutText: { color: '#DC2626', fontSize: 15, fontWeight: '700' },
});
```

- [ ] **Step 2: Typecheck**

Run: `NODE_OPTIONS=--max-old-space-size=4096 pnpm check`
Expected: same pre-existing error only.

- [ ] **Step 3: Commit**

```bash
git add app/(caregiver-tabs)/settings.tsx
git commit -m "feat(caregiver): add full Config tab content"
```

---

### Task 13: Final verification

End-to-end manual smoke + full test run + typecheck. No code changes.

- [ ] **Step 1: Run the full test suite**

Run: `pnpm test`
Expected: all previous tests still pass; new `caregiver-state.test.ts` passes (5 tests). The pre-existing `tests/rate-limit.test.ts:106` typecheck error does not affect Vitest.

- [ ] **Step 2: Run typecheck**

Run: `NODE_OPTIONS=--max-old-space-size=4096 pnpm check`
Expected: only the pre-existing `tests/rate-limit.test.ts:106` error.

- [ ] **Step 3: Manual smoke checklist**

Build an APK (`Build Android APK` GitHub Actions workflow → debug → claude/review-codebase-5HU6v branch) and install it. Use a test Google account whose user row in MySQL is set to `userType='caregiver'` (or register a fresh account and choose Cuidador). Walk through:

- [ ] Login → caregiver onboarding slideshow appears
- [ ] Swipe through all 4 slides, indicators update
- [ ] Tap "Explorar primeiro" → lands on Início with empty state
- [ ] Restart app → no longer sees onboarding; lands directly on Início
- [ ] CaregiverTabBar shows 4 tabs (Início / Alertas / Pessoa / Config)
- [ ] Each tab shows its empty state with appropriate copy
- [ ] Tap "Vincular agora" on any empty state → opens link wizard
- [ ] Test method "Código de convite": digit any string → "Vincular" → details step → confirm
- [ ] After confirm, Pessoa tab shows header with name/initials/relationship and 5 section cards
- [ ] Início tab now shows hero card + summary placeholders
- [ ] Alertas tab now shows filter chips + explanatory empty list
- [ ] Config → Pessoa monitorada → "Desvincular" → all tabs revert to empty states
- [ ] Vincular again via "Email ou telefone" path; confirm displayName falls back to identifier when empty
- [ ] (Optional) Vincular via QR code — grant camera, scan any QR
- [ ] Config → "Editar" do perfil → muda nome → Salvar → veja persistir após fechar/abrir app
- [ ] Config → "Abrir configurações de aparência" → abre tela monitored de Config; volte com gesture/back
- [ ] Config → "Sair da conta" → confirma → vai pro login. Reentre como o mesmo cuidador → cai na Início (não no onboarding, porque a flag persistiu) e o vínculo continua zerado (porque limpamos `vigora_caregiver_state` no logout)
- [ ] Mudar `userType` do mesmo user para `'monitored'` no MySQL → próximo login deve cair em `/(tabs)` (sem regressão no app do monitorado)

- [ ] **Step 4: If everything passes, ship**

Open a PR from `claude/review-codebase-5HU6v` to `main`, mergeie, e dispare um novo build de APK pra os usuários terem o novo fluxo.

```bash
gh pr create --base main --head claude/review-codebase-5HU6v \
  --title "feat: caregiver shell (4 tabs, link wizard, onboarding)" \
  --body "Implements docs/superpowers/specs/2026-05-23-caregiver-shell-design.md."
```

---

## Files summary

**Created (10):**
- `lib/caregiver-state.ts`
- `lib/caregiver-context.tsx`
- `components/caregiver-empty-state.tsx`
- `components/caregiver-tab-bar.tsx`
- `app/(caregiver-tabs)/_layout.tsx`
- `app/(caregiver-tabs)/index.tsx`
- `app/(caregiver-tabs)/alerts.tsx`
- `app/(caregiver-tabs)/person.tsx`
- `app/(caregiver-tabs)/settings.tsx`
- `app/(caregiver-tabs)/link.tsx`
- `app/caregiver-onboarding.tsx`
- `tests/caregiver-state.test.ts`

**Modified (3):**
- `app/_layout.tsx`
- `components/onboarding-gate.tsx`
- `app/oauth/callback.tsx`

**Potentially added dependency:** `expo-camera` (if not already present), for the QR scanner in `link.tsx`.
