# Check-in UX Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign check-in UX to be gentle and discrete — in-app Modal popup with tap-anywhere confirmation, simple pastel confirmation screen, preset time buttons + native DateTimePicker in settings. Dead man's switch preserved.

**Architecture:** Seven surgical changes: install datetimepicker → suppress foreground banner → update notification text → replace confirmation screen → redesign CheckinInitializer with Modal popup → update cold-start handler → replace settings time UI.

**Tech Stack:** React Native `Modal`, `@react-native-community/datetimepicker`, `expo-notifications` listeners, `markCheckinResponded` from `lib/checkin-service.ts`.

---

### Task 1: Install @react-native-community/datetimepicker

**Files:**
- No code changes — only package install + commit

- [ ] **Step 1: Install the package**

```bash
npx expo install @react-native-community/datetimepicker
```

Expected output: package added to `package.json` and `node_modules`.

- [ ] **Step 2: Verify install**

```bash
node -e "require('@react-native-community/datetimepicker'); console.log('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat: install @react-native-community/datetimepicker for check-in settings"
```

---

### Task 2: Suppress checkin_prompt foreground banner in `lib/notifications-utils.ts`

**Files:**
- Modify: `lib/notifications-utils.ts:12-25`

**Why:** When the app is open and a `checkin_prompt` notification arrives, the in-app Modal popup will handle it. The system banner must be suppressed so both don't show simultaneously.

- [ ] **Step 1: Edit `setNotificationHandler` in `lib/notifications-utils.ts`**

Find the existing handler (lines 12–25):

```typescript
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const isAlarm = !!notification.request.content.data?.alarmId;
    const isCountdownUpdate = !!notification.request.content.data?.isCountdownUpdate;
    return {
      // Countdown updates: show in tray but no sound/badge
      shouldShowAlert: true,
      shouldPlaySound: isAlarm && !isCountdownUpdate,
      shouldSetBadge: !isCountdownUpdate,
      shouldShowBanner: true,
      shouldShowList: true,
    };
  },
});
```

Replace with:

```typescript
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const isAlarm = !!notification.request.content.data?.alarmId;
    const isCountdownUpdate = !!notification.request.content.data?.isCountdownUpdate;
    const isCheckinPrompt = notification.request.content.data?.type === 'checkin_prompt';
    return {
      // checkin_prompt: suppress system banner — in-app Modal handles it instead
      shouldShowAlert: !isCheckinPrompt,
      shouldShowBanner: !isCheckinPrompt,
      shouldPlaySound: isAlarm && !isCountdownUpdate && !isCheckinPrompt,
      shouldSetBadge: !isCountdownUpdate && !isCheckinPrompt,
      shouldShowList: true,
    };
  },
});
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: same errors as before (only the pre-existing `storageProxy.ts` error is allowed).

- [ ] **Step 3: Commit**

```bash
git add lib/notifications-utils.ts
git commit -m "feat(checkin): suppress system banner for checkin_prompt in foreground"
```

---

### Task 3: Update notification text in `lib/checkin-service.ts`

**Files:**
- Modify: `lib/checkin-service.ts:82-99` (inside `scheduleCheckin`)

**Why:** Notification copy needs to be friendlier and match the design spec.

- [ ] **Step 1: Update the prompt notification content**

Find the existing prompt content inside `scheduleCheckin` (approximately lines 82–99):

```typescript
    const promptId = await Notifications.scheduleNotificationAsync({
      content: {
        title: '💚 Check-in Vigora',
        body: 'Você está bem hoje? Toque para confirmar.',
        data: {
          type: 'checkin_prompt',
          url: '/checkin-response',
          checkinTime,
          windowMinutes,
        },
      },
```

Replace the `title` and `body` fields and add `color`:

```typescript
    const promptId = await Notifications.scheduleNotificationAsync({
      content: {
        title: '💚 Como você está?',
        body: 'Toque para confirmar que está tudo bem 🌿',
        color: '#2E7D32',
        data: {
          type: 'checkin_prompt',
          url: '/checkin-response',
          checkinTime,
          windowMinutes,
        },
      },
```

- [ ] **Step 2: Run tests to confirm nothing broke**

```bash
pnpm test -- tests/checkin-service.test.ts
```

Expected: all 6 tests pass (the pure functions `computeTimeoutDate` and `formatCountdown` are unchanged).

- [ ] **Step 3: Commit**

```bash
git add lib/checkin-service.ts
git commit -m "feat(checkin): update prompt notification to friendlier copy"
```

---

### Task 4: Redesign `app/checkin-response.tsx` — simple confirmation screen

**Files:**
- Modify: `app/checkin-response.tsx` (full replacement)

**Why:** The new design is a simple, calming screen (style C: green pastel). No countdown. No "Estou Bem" button. No escalation logic. `markCheckinResponded()` is called BEFORE navigating here, so this screen only shows the confirmation.

- [ ] **Step 1: Replace `app/checkin-response.tsx` entirely**

```typescript
/**
 * CheckinResponseScreen
 *
 * Tela de confirmação do check-in diário.
 * Aberta após o usuário responder ao check-in (via notificação ou popup in-app).
 *
 * IMPORTANTE: markCheckinResponded() já foi chamado antes de navegar até aqui.
 * Esta tela não executa nenhuma lógica de check-in — é apenas uma confirmação visual.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

export default function CheckinResponseScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.body}>

        {/* Espaço superior */}
        <View style={styles.top}>
          <Text style={styles.emoji}>🌿</Text>
        </View>

        {/* Mensagem central */}
        <View style={styles.middle}>
          <Text style={styles.title}>Ótimo! Que bom que{'\n'}você está bem.</Text>
          <Text style={styles.subtitle}>Recebemos seu check-in 💚</Text>
        </View>

        {/* Botão na base */}
        <View style={styles.bottom}>
          <Pressable
            onPress={() => router.replace('/(tabs)')}
            style={({ pressed }) => [styles.button, { opacity: pressed ? 0.85 : 1 }]}
            accessibilityLabel="Entendido, fechar tela de confirmação"
            accessibilityRole="button"
          >
            <Text style={styles.buttonText}>Entendido</Text>
          </Pressable>
        </View>

      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F1F8E9',
    borderWidth: 1.5,
    borderColor: '#C8E6C9',
  },
  body: {
    flex: 1,
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  top: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 24,
  },
  emoji: {
    fontSize: 64,
  },
  middle: {
    flex: 2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1B5E20',
    textAlign: 'center',
    lineHeight: 30,
  },
  subtitle: {
    fontSize: 15,
    color: '#388E3C',
    textAlign: 'center',
    lineHeight: 22,
  },
  bottom: {
    flex: 1,
    justifyContent: 'center',
  },
  button: {
    backgroundColor: '#2E7D32',
    borderRadius: 20,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: only the pre-existing `storageProxy.ts` error.

- [ ] **Step 3: Commit**

```bash
git add app/checkin-response.tsx
git commit -m "feat(checkin): redesign confirmation screen — simple pastel style C, no countdown"
```

---

### Task 5: Redesign `components/checkin-initializer.tsx` — Modal popup

**Files:**
- Modify: `components/checkin-initializer.tsx` (full replacement)

**Why:** Add Modal popup with two states (`asking` / `confirmed`), suppressed system banner, tap-anywhere confirmation, 2-second auto-dismiss. Also moves escalation logic here (was in `checkin-response.tsx`).

**Behavior rules:**
- `addNotificationReceivedListener` fires when app is in **foreground**: show in-app popup for `checkin_prompt`; auto-escalate for `checkin_timeout`
- `addNotificationResponseReceivedListener` fires when user **taps** notification from tray: call `markCheckinResponded` then navigate for `checkin_prompt`; escalate + navigate for `checkin_timeout`
- Popup tap (card or overlay): call `markCheckinResponded` → switch to `confirmed` state → auto-close after 2s

- [ ] **Step 1: Replace `components/checkin-initializer.tsx` entirely**

```typescript
/**
 * CheckinInitializer
 *
 * Componente sem UI que roda no startup e:
 * 1. Garante que o check-in está agendado corretamente se `checkinEnabled` for true.
 * 2. Exibe popup in-app (Modal) quando o check-in chega com o app em foreground.
 * 3. Navega para /checkin-response quando o usuário toca a notificação da bandeja.
 * 4. Escalona para contatos de emergência quando o check-in expira (checkin_timeout).
 *
 * O popup tem dois estados:
 * - 'asking': card verde pastel com "Você está bem?" — tap em qualquer lugar confirma
 * - 'confirmed': card com ✅ "Ótimo!" — some automaticamente após 2 segundos
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useAppContext } from '@/lib/app-context';
import { scheduleCheckin, cancelCheckin, markCheckinResponded } from '@/lib/checkin-service';
import { escalateAlarmToContacts } from '@/lib/alarm-escalation';

type PopupState = 'asking' | 'confirmed';

export function CheckinInitializer() {
  const { state } = useAppContext();
  const router = useRouter();
  const { checkinEnabled, checkinTime, checkinWindowMinutes, notificationsEnabled } = state.settings;

  // Popup state
  const [popupVisible, setPopupVisible] = useState(false);
  const [popupState, setPopupState] = useState<PopupState>('asking');
  const [popupCheckinTime, setPopupCheckinTime] = useState('');
  const [popupWindowMinutes, setPopupWindowMinutes] = useState(30);
  const autoCloseRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup auto-close timer on unmount
  useEffect(() => {
    return () => {
      if (autoCloseRef.current) clearTimeout(autoCloseRef.current);
    };
  }, []);

  // Re-agenda (ou cancela) o check-in sempre que as configurações mudarem
  useEffect(() => {
    if (state.isLoading) return;

    if (checkinEnabled && notificationsEnabled) {
      scheduleCheckin(checkinTime, checkinWindowMinutes).catch((err) =>
        console.error('[CheckinInitializer] Failed to schedule checkin:', err)
      );
    } else {
      cancelCheckin().catch((err) =>
        console.error('[CheckinInitializer] Failed to cancel checkin:', err)
      );
    }
  }, [state.isLoading, checkinEnabled, checkinTime, checkinWindowMinutes, notificationsEnabled]);

  // Tap no popup (overlay ou card) confirma o check-in
  const handleConfirm = useCallback(async () => {
    if (popupState !== 'asking') return; // já confirmado, ignora taps extras
    await markCheckinResponded(popupCheckinTime, popupWindowMinutes).catch(() => {});
    setPopupState('confirmed');
    if (autoCloseRef.current) clearTimeout(autoCloseRef.current);
    autoCloseRef.current = setTimeout(() => {
      setPopupVisible(false);
      setPopupState('asking'); // reseta para a próxima vez
    }, 2000);
  }, [popupState, popupCheckinTime, popupWindowMinutes]);

  // Listener foreground: app aberto quando a notificação chega
  useEffect(() => {
    if (Platform.OS === 'web') return;

    const subscription = Notifications.addNotificationReceivedListener((notification) => {
      const data = notification.request.content.data;

      if (data?.type === 'checkin_prompt') {
        // Exibe o popup in-app (banner do sistema já está suprimido em notifications-utils.ts)
        setPopupCheckinTime((data.checkinTime as string | undefined) ?? checkinTime);
        setPopupWindowMinutes((data.windowMinutes as number | undefined) ?? checkinWindowMinutes);
        setPopupState('asking');
        setPopupVisible(true);
      } else if (data?.type === 'checkin_timeout') {
        // Timeout enquanto app estava aberto: escalona imediatamente
        const checkinAsAlarm = {
          id: 'checkin-daily',
          time: checkinTime,
          description: 'Check-in diário sem resposta',
          enabled: true,
          repeat: 'daily' as const,
          customDays: [] as number[],
          sound: false,
          vibration: false,
        };
        escalateAlarmToContacts(checkinAsAlarm, state.emergencyContacts).catch(() => {});
        markCheckinResponded(checkinTime, checkinWindowMinutes).catch(() => {});
        router.push('/checkin-response');
      }
    });

    return () => subscription.remove();
  }, [router, checkinTime, checkinWindowMinutes, state.emergencyContacts]);

  // Listener de tap: usuário tocou na notificação da bandeja
  useEffect(() => {
    if (Platform.OS === 'web') return;

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;

      if (data?.type === 'checkin_prompt') {
        // Marca como respondido IMEDIATAMENTE, antes de navegar
        const ct = (data.checkinTime as string | undefined) ?? checkinTime;
        const wm = (data.windowMinutes as number | undefined) ?? checkinWindowMinutes;
        markCheckinResponded(ct, wm).catch(() => {});
        router.push('/checkin-response');
      } else if (data?.type === 'checkin_timeout') {
        // Timeout: usuário tocou na notificação após o prazo — escalona e navega
        const checkinAsAlarm = {
          id: 'checkin-daily',
          time: checkinTime,
          description: 'Check-in diário sem resposta',
          enabled: true,
          repeat: 'daily' as const,
          customDays: [] as number[],
          sound: false,
          vibration: false,
        };
        escalateAlarmToContacts(checkinAsAlarm, state.emergencyContacts).catch(() => {});
        markCheckinResponded(checkinTime, checkinWindowMinutes).catch(() => {});
        router.push('/checkin-response');
      }
    });

    return () => subscription.remove();
  }, [router, checkinTime, checkinWindowMinutes, state.emergencyContacts]);

  return (
    <Modal
      transparent
      animationType="fade"
      visible={popupVisible}
      onRequestClose={() => {}} // botão back do Android não dispensa — tap confirma
      statusBarTranslucent
    >
      {/* Pressable cobre toda a tela — tap fora do card também confirma */}
      <Pressable style={styles.overlay} onPress={handleConfirm}>
        <View style={[
          styles.card,
          popupState === 'confirmed' ? styles.cardConfirmed : styles.cardAsking,
        ]}>
          {popupState === 'asking' ? <AskingContent /> : <ConfirmedContent />}
        </View>
      </Pressable>
    </Modal>
  );
}

// --------------------------------------------------------------------------
// Estado "asking" — popup inicial
// --------------------------------------------------------------------------
function AskingContent() {
  return (
    <>
      <Text style={styles.cardEmoji}>🌿</Text>
      <Text style={styles.cardTitle}>Você está bem?</Text>
      <Text style={styles.cardBody}>
        Olá! Só passando para saber{'\n'}se está tudo bem com você 💚
      </Text>
      <View style={styles.tapHint}>
        <Text style={styles.tapHintText}>Toque em qualquer lugar para confirmar</Text>
      </View>
      <Text style={styles.cardHint}>Responda em até 30 minutos</Text>
    </>
  );
}

// --------------------------------------------------------------------------
// Estado "confirmed" — após tap, some em 2s
// --------------------------------------------------------------------------
function ConfirmedContent() {
  return (
    <>
      <View style={styles.checkCircle}>
        <Text style={styles.checkEmoji}>✅</Text>
      </View>
      <Text style={styles.confirmedTitle}>Ótimo! Que bom que{'\n'}você está bem.</Text>
      <Text style={styles.confirmedBody}>Recebemos seu check-in 🌿</Text>
      <Text style={styles.cardHint}>Fechando automaticamente...</Text>
    </>
  );
}

// --------------------------------------------------------------------------
// Estilos
// --------------------------------------------------------------------------
const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    width: '82%',
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 12,
    gap: 10,
  },
  cardAsking: {
    backgroundColor: '#F1F8E9',
    borderWidth: 1.5,
    borderColor: '#C8E6C9',
  },
  cardConfirmed: {
    backgroundColor: '#E8F5E9',
    borderWidth: 2,
    borderColor: '#66BB6A',
  },
  // Asking content
  cardEmoji: {
    fontSize: 48,
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: 21,
    fontWeight: '800',
    color: '#1B5E20',
    textAlign: 'center',
    lineHeight: 27,
  },
  cardBody: {
    fontSize: 14,
    color: '#388E3C',
    textAlign: 'center',
    lineHeight: 22,
  },
  tapHint: {
    backgroundColor: '#E8F5E9',
    borderWidth: 1.5,
    borderColor: '#A5D6A7',
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginTop: 4,
    width: '100%',
    alignItems: 'center',
  },
  tapHintText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2E7D32',
    textAlign: 'center',
  },
  cardHint: {
    fontSize: 11,
    color: '#81C784',
    textAlign: 'center',
    marginTop: 4,
  },
  // Confirmed content
  checkCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#2E7D32',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  checkEmoji: {
    fontSize: 36,
  },
  confirmedTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1B5E20',
    textAlign: 'center',
    lineHeight: 30,
  },
  confirmedBody: {
    fontSize: 14,
    color: '#388E3C',
    textAlign: 'center',
  },
});
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: only the pre-existing `storageProxy.ts` error.

- [ ] **Step 3: Commit**

```bash
git add components/checkin-initializer.tsx
git commit -m "feat(checkin): add in-app Modal popup with asking/confirmed states"
```

---

### Task 6: Update cold-start handler in `app/_layout.tsx`

**Files:**
- Modify: `app/_layout.tsx:148-153`

**Why:** When app is cold-started by tapping a `checkin_prompt` notification, `markCheckinResponded()` must be called BEFORE navigating — the new `checkin-response.tsx` no longer has this logic.

- [ ] **Step 1: Update the cold-start check-in handler in `_layout.tsx`**

Find the existing handler (around line 148):

```typescript
          // Check-in notification cold-start: navigate to response screen
          if (notifType === 'checkin_prompt' || notifType === 'checkin_timeout') {
            const { router: navRouter } = require('expo-router');
            navRouter.push('/checkin-response');
            Notifications.clearLastNotificationResponseAsync();
            return;
          }
```

Replace with:

```typescript
          // Check-in notification cold-start
          if (notifType === 'checkin_prompt') {
            // Marca como respondido imediatamente — checkin-response.tsx não executa essa lógica
            const { markCheckinResponded } = require('@/lib/checkin-service');
            const ct = data?.checkinTime as string | undefined;
            const wm = data?.windowMinutes as number | undefined;
            if (ct && wm) {
              markCheckinResponded(ct, wm).catch(() => {});
            }
            const { router: navRouter } = require('expo-router');
            navRouter.push('/checkin-response');
            Notifications.clearLastNotificationResponseAsync();
            return;
          }
          if (notifType === 'checkin_timeout') {
            // Timeout cold-start: escalona para contatos e navega para confirmação
            const { escalateAlarmToContacts } = require('@/lib/alarm-escalation');
            const { markCheckinResponded } = require('@/lib/checkin-service');
            const AsyncStorageMod = require('@react-native-async-storage/async-storage').default;
            try {
              const raw = await AsyncStorageMod.getItem('vigora_app_state');
              if (raw) {
                const parsed = JSON.parse(raw);
                const contacts = parsed?.emergencyContacts ?? [];
                const ct = data?.checkinTime as string | undefined ?? '09:00';
                const wm = data?.windowMinutes as number | undefined ?? 30;
                const checkinAsAlarm = {
                  id: 'checkin-daily',
                  time: ct,
                  description: 'Check-in diário sem resposta',
                  enabled: true,
                  repeat: 'daily',
                  customDays: [],
                  sound: false,
                  vibration: false,
                };
                escalateAlarmToContacts(checkinAsAlarm, contacts).catch(() => {});
                markCheckinResponded(ct, wm).catch(() => {});
              }
            } catch {}
            const { router: navRouter } = require('expo-router');
            navRouter.push('/checkin-response');
            Notifications.clearLastNotificationResponseAsync();
            return;
          }
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: only the pre-existing `storageProxy.ts` error.

- [ ] **Step 3: Commit**

```bash
git add app/_layout.tsx
git commit -m "feat(checkin): cold-start handler calls markCheckinResponded before navigating"
```

---

### Task 7: Replace time TextInput + window buttons with preset buttons + DateTimePicker in `app/(tabs)/settings.tsx`

**Files:**
- Modify: `app/(tabs)/settings.tsx:978-1106` (check-in section)

**Why:** Replace the raw `TextInput` (bad UX for elderly users) and the "Janela de resposta" buttons (window is now fixed at 30 min per spec) with:
1. Two large preset buttons: ☀️ Manhã — 09:00 and 🌆 Tarde — 17:00
2. A "Personalizar" button that opens native `DateTimePicker`

- [ ] **Step 1: Add `DateTimePicker` import and state at the top of the settings component**

At the top of `app/(tabs)/settings.tsx`, add the import after the last import line:

```typescript
import DateTimePicker from '@react-native-community/datetimepicker';
```

Inside the `SettingsScreen` component (near other `useState` declarations), add:

```typescript
const [showCheckinTimePicker, setShowCheckinTimePicker] = useState(false);
```

Also add these two helper functions inside the component (after the useState declarations):

```typescript
function parseTime(timeStr: string): Date {
  const [h, m] = timeStr.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

function formatHHMM(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
```

- [ ] **Step 2: Replace the check-in "Horário" row and "Janela de resposta" row**

Find the existing `{/* Horário do check-in */}` row and `{/* Janela de resposta */}` row inside the `settings.checkinEnabled && (...)` block (lines 1015–1096):

```tsx
              {/* Horário do check-in */}
              <View style={[styles.settingRow, { borderBottomColor: colors.border }]}>
                <View style={styles.settingTextBlock}>
                  <Text style={[styles.settingLabel, { color: colors.foreground, fontSize: fs.md }]}>
                    Horário
                  </Text>
                  <Text style={[styles.settingSubLabel, { color: colors.muted, fontSize: fs.sm }]}>
                    Quando você receberá a notificação
                  </Text>
                </View>
                <TextInput
                  value={settings.checkinTime}
                  onChangeText={(v) => {
                    const timeRegex = /^([01]?\d|2[0-3]):([0-5]\d)$/;
                    if (timeRegex.test(v)) {
                      updateSetting('checkinTime', v);
                      scheduleCheckin(v, settings.checkinWindowMinutes).catch(() => {});
                    }
                  }}
                  onEndEditing={(e) => {
                    const v = e.nativeEvent.text;
                    const timeRegex = /^([01]?\d|2[0-3]):([0-5]\d)$/;
                    if (timeRegex.test(v)) {
                      updateSetting('checkinTime', v);
                      scheduleCheckin(v, settings.checkinWindowMinutes).catch(() => {});
                    }
                  }}
                  keyboardType="numbers-and-punctuation"
                  maxLength={5}
                  placeholder="09:00"
                  placeholderTextColor={colors.muted}
                  style={{
                    color: colors.primary,
                    fontSize: fs.md,
                    fontWeight: '700',
                    textAlign: 'right',
                    minWidth: 60,
                  }}
                />
              </View>

              {/* Janela de resposta */}
              <View style={[styles.settingRow, { borderBottomColor: colors.border }]}>
                <View style={styles.settingTextBlock}>
                  <Text style={[styles.settingLabel, { color: colors.foreground, fontSize: fs.md }]}>
                    Janela de resposta
                  </Text>
                  <Text style={[styles.settingSubLabel, { color: colors.muted, fontSize: fs.sm }]}>
                    Tempo para responder antes de notificar contatos
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {([15, 30, 60] as const).map((mins) => (
                    <Pressable
                      key={mins}
                      onPress={async () => {
                        updateSetting('checkinWindowMinutes', mins);
                        await scheduleCheckin(settings.checkinTime, mins);
                      }}
                      style={({ pressed }) => [{
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                        borderRadius: 8,
                        borderWidth: 1,
                        backgroundColor:
                          settings.checkinWindowMinutes === mins ? '#2E7D32' : colors.surface,
                        borderColor:
                          settings.checkinWindowMinutes === mins ? '#2E7D32' : colors.border,
                        opacity: pressed ? 0.7 : 1,
                      }]}
                    >
                      <Text style={{
                        color: settings.checkinWindowMinutes === mins ? '#FFFFFF' : colors.foreground,
                        fontSize: fs.sm,
                        fontWeight: '600',
                      }}>
                        {mins}min
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
```

Replace with:

```tsx
              {/* Horário do check-in — preset buttons + Personalizar */}
              <View style={{ padding: 16, gap: 10 }}>
                <Text style={[styles.settingLabel, { color: colors.foreground, fontSize: fs.md, marginBottom: 2 }]}>
                  Horário
                </Text>
                <Text style={[styles.settingSubLabel, { color: colors.muted, fontSize: fs.sm }]}>
                  Quando você receberá a notificação diária
                </Text>

                {/* Botões de atalho */}
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
                  {(['09:00', '17:00'] as const).map((preset) => {
                    const label = preset === '09:00' ? '☀️ Manhã — 09:00' : '🌆 Tarde — 17:00';
                    const isSelected = settings.checkinTime === preset;
                    return (
                      <Pressable
                        key={preset}
                        onPress={async () => {
                          updateSetting('checkinTime', preset);
                          await scheduleCheckin(preset, settings.checkinWindowMinutes);
                        }}
                        style={({ pressed }) => [{
                          flex: 1,
                          paddingVertical: 14,
                          borderRadius: 12,
                          borderWidth: 1.5,
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: isSelected ? '#2E7D32' : colors.surface,
                          borderColor: isSelected ? '#2E7D32' : colors.border,
                          opacity: pressed ? 0.75 : 1,
                        }]}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isSelected }}
                      >
                        <Text style={{
                          color: isSelected ? '#FFFFFF' : colors.foreground,
                          fontSize: fs.sm,
                          fontWeight: '700',
                          textAlign: 'center',
                        }}>
                          {label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {/* Botão personalizar */}
                {(() => {
                  const isCustom = settings.checkinTime !== '09:00' && settings.checkinTime !== '17:00';
                  return (
                    <Pressable
                      onPress={() => setShowCheckinTimePicker(true)}
                      style={({ pressed }) => [{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                        paddingVertical: 12,
                        borderRadius: 12,
                        borderWidth: 1.5,
                        borderColor: isCustom ? '#2E7D32' : colors.border,
                        backgroundColor: isCustom ? '#E8F5E9' : colors.surface,
                        opacity: pressed ? 0.75 : 1,
                      }]}
                      accessibilityRole="button"
                      accessibilityLabel="Personalizar horário do check-in"
                    >
                      <MaterialIcons
                        name="schedule"
                        size={20}
                        color={isCustom ? '#2E7D32' : colors.muted}
                      />
                      <Text style={{
                        fontSize: fs.sm,
                        fontWeight: '600',
                        color: isCustom ? '#2E7D32' : colors.muted,
                      }}>
                        {isCustom ? `🕐 ${settings.checkinTime} — Personalizado` : 'Personalizar horário'}
                      </Text>
                    </Pressable>
                  );
                })()}

                {/* DateTimePicker nativo (exibido inline no iOS, dialog no Android) */}
                {showCheckinTimePicker && (
                  <DateTimePicker
                    value={parseTime(settings.checkinTime)}
                    mode="time"
                    is24Hour={true}
                    display={Platform.OS === 'android' ? 'spinner' : 'wheels'}
                    onChange={(event, date) => {
                      setShowCheckinTimePicker(false);
                      if (event.type === 'set' && date) {
                        const newTime = formatHHMM(date);
                        updateSetting('checkinTime', newTime);
                        scheduleCheckin(newTime, settings.checkinWindowMinutes).catch(() => {});
                      }
                    }}
                  />
                )}
              </View>
```

- [ ] **Step 3: Remove `TextInput` from the RN import if no longer used elsewhere**

Search the file for remaining `TextInput` uses:

```bash
grep -n "TextInput" app/(tabs)/settings.tsx
```

If the only remaining reference is the import line itself, remove `TextInput` from the destructured import:

```typescript
// Before:
import {
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

// After (if TextInput is unused):
import {
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
```

If `TextInput` is still used elsewhere in the file, leave the import as-is.

- [ ] **Step 4: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: only the pre-existing `storageProxy.ts` error.

- [ ] **Step 5: Run full test suite**

```bash
pnpm test
```

Expected: same pass/fail ratio as before this plan (9 check-in tests still pass).

- [ ] **Step 6: Commit**

```bash
git add app/(tabs)/settings.tsx
git commit -m "feat(checkin): replace TextInput time picker with preset buttons + native DateTimePicker"
```

---

## Self-Review

### Spec coverage

| Spec requirement | Task |
|---|---|
| Suprimir banner nativo para `checkin_prompt` foreground | Task 2 |
| Atualizar texto da notificação push | Task 3 |
| Tela de confirmação simples (style C, "Entendido") | Task 4 |
| Popup in-app com estado asking / confirmed | Task 5 |
| `markCheckinResponded` chamado imediatamente ao tap | Tasks 5 + 6 |
| Popup some após 2s — usuário permanece na tela atual | Task 5 |
| Tap fora do card também confirma | Task 5 (Pressable cobre overlay) |
| Escalação para contatos quando `checkin_timeout` | Task 5 + 6 |
| Cold-start: marca como respondido antes de navegar | Task 6 |
| Preset buttons 09:00 / 17:00 | Task 7 |
| DateTimePicker nativo via "Personalizar" | Task 7 |
| Remover "Janela de resposta" configurável (fixo em 30 min) | Task 7 |
| `@react-native-community/datetimepicker` instalado | Task 1 |

### Placeholder scan

Nenhum. Todos os steps têm código completo.

### Type consistency

- `markCheckinResponded(ct: string, wm: number)` — assinatura usada igual em Tasks 5 e 6.
- `escalateAlarmToContacts(alarm, contacts)` — estrutura `checkinAsAlarm` igual em Task 5 (foreground + tap listener) e Task 6.
- `PopupState = 'asking' | 'confirmed'` — definida uma vez em Task 5, usada consistentemente.
- `parseTime` e `formatHHMM` — definidas em Task 7, usadas somente em Task 7.
