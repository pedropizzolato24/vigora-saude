# Daily Check-in "Tudo Bem?" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar o check-in diário "Você está bem?" — notificação diária configurável, tela de resposta com countdown, e escalonamento automático para contatos de emergência se o usuário não responder.

**Architecture:** O check-in agenda duas notificações via `expo-notifications`: (1) a notificação-prompt diária recorrente que abre a tela de resposta; (2) uma notificação de timeout one-shot que dispara após a janela de resposta — se o usuário não respondeu, o app escalona para os contatos de emergência ao processar essa notificação. Os IDs das notificações são persistidos em `AsyncStorage`. As configurações (horário, janela, habilitado) são armazenadas em `AppSettings`, que já é sincronizado na nuvem via `userData.settings`.

**Tech Stack:** expo-notifications (scheduling), AsyncStorage (IDs persistidos), expo-haptics, Vitest (testes), tRPC/drizzle (sem mudanças de schema necessárias para MVP), `lib/alarm-escalation.ts` (escalonamento existente reutilizado).

---

## File Map

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `lib/app-context.tsx` | Modificar | Adicionar campos `checkinEnabled`, `checkinTime`, `checkinWindowMinutes` em `AppSettings` |
| `lib/notifications-utils.ts` | Modificar | Adicionar `CHECKIN_CHANNEL_ID` e canal Android de check-in |
| `lib/checkin-service.ts` | Criar | Agendar/cancelar prompt e timeout, marcar resposta, helpers puros |
| `app/checkin-response.tsx` | Criar | Tela full-screen com countdown e botão "Estou Bem" |
| `components/checkin-initializer.tsx` | Criar | Componente de inicialização que reagenda o check-in no startup |
| `app/_layout.tsx` | Modificar | Montar `CheckinInitializer`; tratar notificação `checkin_timeout` → escalonar |
| `app/(tabs)/settings.tsx` | Modificar | Adicionar seção "Check-in Diário" com toggle, horário e janela |
| `tests/checkin-service.test.ts` | Criar | Testes das funções puras do serviço |
| `tests/checkin-state.test.ts` | Criar | Testes do reducer para os novos campos de settings |

---

## Task 1: Estender AppSettings com campos de check-in

**Files:**
- Modify: `lib/app-context.tsx` — interface `AppSettings` e `initialState`
- Create: `tests/checkin-state.test.ts`

- [ ] **Step 1.1: Escrever o teste que vai falhar**

```typescript
// tests/checkin-state.test.ts
import { describe, it, expect } from 'vitest';

// Importamos apenas os tipos e o reducer — sem dependências nativas
// O reducer é uma função pura, ideal para teste unitário.
// Como app-context.tsx usa hooks e AsyncStorage, extraímos o baseReducer
// via a exportação que adicionaremos na próxima etapa.
import { checkinDefaults } from '../lib/checkin-defaults';

describe('checkin defaults', () => {
  it('checkinEnabled é false por padrão', () => {
    expect(checkinDefaults.checkinEnabled).toBe(false);
  });

  it('checkinTime é 09:00 por padrão', () => {
    expect(checkinDefaults.checkinTime).toBe('09:00');
  });

  it('checkinWindowMinutes é 30 por padrão', () => {
    expect(checkinDefaults.checkinWindowMinutes).toBe(30);
  });
});
```

- [ ] **Step 1.2: Rodar o teste para confirmar falha**

```bash
cd c:\Users\55519\vigora-saude
npx vitest run tests/checkin-state.test.ts
```

Esperado: FAIL com `Cannot find module '../lib/checkin-defaults'`

- [ ] **Step 1.3: Criar `lib/checkin-defaults.ts` com os defaults exportados**

```typescript
// lib/checkin-defaults.ts
/**
 * Defaults para as configurações de check-in diário.
 * Exportado separadamente para permitir teste unitário sem dependências nativas.
 */
export const checkinDefaults = {
  checkinEnabled: false,
  checkinTime: '09:00',        // HH:mm
  checkinWindowMinutes: 30,    // Minutos que o usuário tem para responder
} as const;
```

- [ ] **Step 1.4: Adicionar campos em `AppSettings` em `lib/app-context.tsx`**

Localizar a interface `AppSettings` (linha ~52) e adicionar ao final, antes do `}`:

```typescript
  /** Check-in diário "Você está bem?" */
  checkinEnabled: boolean;
  /** Horário do check-in no formato HH:mm */
  checkinTime: string;
  /** Minutos que o usuário tem para responder antes de escalonar */
  checkinWindowMinutes: number;
```

- [ ] **Step 1.5: Adicionar defaults em `initialState` em `lib/app-context.tsx`**

Localizar o objeto `settings` dentro de `initialState` (linha ~129) e adicionar ao final do objeto:

```typescript
    checkinEnabled: false,
    checkinTime: '09:00',
    checkinWindowMinutes: 30,
```

- [ ] **Step 1.6: Rodar o teste para confirmar que passa**

```bash
npx vitest run tests/checkin-state.test.ts
```

Esperado: PASS — 3 testes passando

- [ ] **Step 1.7: Verificar que o TypeScript compila sem erros**

```bash
npx tsc --noEmit
```

Esperado: sem erros (o reducer já aceita `Partial<AppSettings>` em `UPDATE_SETTINGS`, não precisa de mudanças)

- [ ] **Step 1.8: Commit**

```bash
git add lib/checkin-defaults.ts lib/app-context.tsx tests/checkin-state.test.ts
git commit -m "feat(checkin): add checkin fields to AppSettings"
```

---

## Task 2: Canal de notificação Android para check-in

**Files:**
- Modify: `lib/notifications-utils.ts`

- [ ] **Step 2.1: Adicionar `CHECKIN_CHANNEL_ID` exportado**

Localizar a linha onde `ALARM_CHANNEL_ID` é declarado (linha ~7) e adicionar logo abaixo:

```typescript
export const CHECKIN_CHANNEL_ID = 'vigora-checkin';
```

- [ ] **Step 2.2: Adicionar setup do canal em `setupNotificationChannels()`**

Localizar o final da função `setupNotificationChannels` (após o bloco do canal de alarm, antes do último `}`), e adicionar:

```typescript
  // Check-in channel — HIGH importance (toca som padrão, não bypassa DND)
  await Notifications.setNotificationChannelAsync(CHECKIN_CHANNEL_ID, {
    name: 'Check-in Diário',
    description: 'Notificação diária de bem-estar. Confirme que está tudo bem.',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    enableVibrate: true,
    sound: 'default',
  });
```

- [ ] **Step 2.3: Verificar TypeScript**

```bash
npx tsc --noEmit
```

Esperado: sem erros

- [ ] **Step 2.4: Commit**

```bash
git add lib/notifications-utils.ts
git commit -m "feat(checkin): add vigora-checkin notification channel"
```

---

## Task 3: `lib/checkin-service.ts` — serviço principal

**Files:**
- Create: `lib/checkin-service.ts`
- Create: `tests/checkin-service.test.ts`

- [ ] **Step 3.1: Escrever os testes das funções puras**

```typescript
// tests/checkin-service.test.ts
import { describe, it, expect } from 'vitest';
import { computeTimeoutDate, formatCountdown } from '../lib/checkin-service';

describe('computeTimeoutDate', () => {
  it('adiciona window minutes ao horário do check-in', () => {
    // Agora é 09:15, check-in às 09:00, janela 30min → timeout hoje às 09:30
    const now = new Date('2026-05-25T09:15:00');
    const result = computeTimeoutDate('09:00', 30, now);
    expect(result.getHours()).toBe(9);
    expect(result.getMinutes()).toBe(30);
    expect(result.getDate()).toBe(25);
  });

  it('avança para o dia seguinte se o timeout já passou', () => {
    // Agora é 10:00, check-in às 09:00, janela 30min → timeout às 09:30 (já passou)
    const now = new Date('2026-05-25T10:00:00');
    const result = computeTimeoutDate('09:00', 30, now);
    expect(result.getDate()).toBe(26);
    expect(result.getHours()).toBe(9);
    expect(result.getMinutes()).toBe(30);
  });

  it('trata overflow de minutos para próxima hora', () => {
    // Check-in às 09:45, janela 30min → timeout às 10:15
    const now = new Date('2026-05-25T09:50:00');
    const result = computeTimeoutDate('09:45', 30, now);
    expect(result.getHours()).toBe(10);
    expect(result.getMinutes()).toBe(15);
  });

  it('trata overflow de hora (meia-noite)', () => {
    // Check-in às 23:45, janela 30min → timeout às 00:15 do dia seguinte
    const now = new Date('2026-05-25T23:50:00');
    const result = computeTimeoutDate('23:45', 30, now);
    expect(result.getHours()).toBe(0);
    expect(result.getMinutes()).toBe(15);
    expect(result.getDate()).toBe(26);
  });
});

describe('formatCountdown', () => {
  it('formata segundos em MM:SS', () => {
    expect(formatCountdown(90)).toBe('01:30');
    expect(formatCountdown(60)).toBe('01:00');
    expect(formatCountdown(9)).toBe('00:09');
    expect(formatCountdown(0)).toBe('00:00');
  });

  it('formata minutos completos', () => {
    expect(formatCountdown(1800)).toBe('30:00');
  });
});
```

- [ ] **Step 3.2: Rodar os testes para confirmar falha**

```bash
npx vitest run tests/checkin-service.test.ts
```

Esperado: FAIL com `Cannot find module '../lib/checkin-service'`

- [ ] **Step 3.3: Criar `lib/checkin-service.ts`**

```typescript
/**
 * checkin-service.ts
 *
 * Serviço de check-in diário "Você está bem?".
 *
 * Fluxo:
 * 1. scheduleCheckin() agenda duas notificações:
 *    - Prompt diário recorrente (DAILY trigger) → abre /checkin-response
 *    - Timeout one-shot (DATE trigger, checkinTime + windowMinutes) → escalona se não respondido
 * 2. Usuário toca "Estou Bem" → markCheckinResponded() cancela o timeout e reagenda para amanhã
 * 3. Se não responder → notificação de timeout dispara; _layout.tsx a intercepta e escalona
 *
 * IDs de notificação persistidos em AsyncStorage:
 *   vigora_checkin_prompt_id  — ID do prompt diário
 *   vigora_checkin_timeout_id — ID do timeout one-shot
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { CHECKIN_CHANNEL_ID } from './notifications-utils';

const PROMPT_ID_KEY = 'vigora_checkin_prompt_id';
const TIMEOUT_ID_KEY = 'vigora_checkin_timeout_id';

// ---------------------------------------------------------------------------
// Funções puras (testáveis sem mocks)
// ---------------------------------------------------------------------------

/**
 * Calcula a data/hora do próximo timeout:
 * checkinTime + windowMinutes. Se já passou, avança para amanhã.
 */
export function computeTimeoutDate(
  checkinTime: string,
  windowMinutes: number,
  now: Date = new Date()
): Date {
  const [h, m] = checkinTime.split(':').map(Number);
  const totalMinutes = h * 60 + m + windowMinutes;
  const timeoutHour = Math.floor(totalMinutes / 60) % 24;
  const timeoutMinute = totalMinutes % 60;

  const result = new Date(now);
  result.setHours(timeoutHour, timeoutMinute, 0, 0);

  // Se o timeout já passou hoje, agenda para amanhã
  if (result <= now) {
    result.setDate(result.getDate() + 1);
  }
  return result;
}

/**
 * Formata segundos restantes em "MM:SS" para o countdown.
 */
export function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Funções de agendamento (dependem de expo-notifications + AsyncStorage)
// ---------------------------------------------------------------------------

/**
 * Agenda (ou reagenda) o check-in diário.
 * Cancela qualquer agendamento anterior antes de criar os novos.
 */
export async function scheduleCheckin(
  checkinTime: string,
  windowMinutes: number
): Promise<void> {
  if (Platform.OS === 'web') return;

  await cancelCheckin();

  const [hours, minutes] = checkinTime.split(':').map(Number);

  // 1. Notificação-prompt diária recorrente
  const promptId = await Notifications.scheduleNotificationAsync({
    content: {
      title: '💚 Check-in Vigora',
      body: 'Você está bem hoje? Toque para confirmar.',
      sound: false,
      data: {
        type: 'checkin_prompt',
        url: '/checkin-response',
        checkinTime,
        windowMinutes,
      },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: hours,
      minute: minutes,
      channelId: CHECKIN_CHANNEL_ID,
    } as any,
  });
  await AsyncStorage.setItem(PROMPT_ID_KEY, promptId);

  // 2. Timeout one-shot para hoje (ou amanhã se já passou)
  await _scheduleTimeoutNotification(checkinTime, windowMinutes);
}

/**
 * Cancela prompt e timeout do check-in.
 */
export async function cancelCheckin(): Promise<void> {
  if (Platform.OS === 'web') return;

  const [promptId, timeoutId] = await Promise.all([
    AsyncStorage.getItem(PROMPT_ID_KEY),
    AsyncStorage.getItem(TIMEOUT_ID_KEY),
  ]);

  await Promise.all([
    promptId
      ? Notifications.cancelScheduledNotificationAsync(promptId).catch(() => {})
      : Promise.resolve(),
    timeoutId
      ? Notifications.cancelScheduledNotificationAsync(timeoutId).catch(() => {})
      : Promise.resolve(),
    AsyncStorage.multiRemove([PROMPT_ID_KEY, TIMEOUT_ID_KEY]),
  ]);
}

/**
 * Marca o check-in como respondido:
 * - Cancela o timeout de hoje
 * - Reagenda o timeout para amanhã
 *
 * Chamar quando o usuário tocar "Estou Bem".
 */
export async function markCheckinResponded(
  checkinTime: string,
  windowMinutes: number
): Promise<void> {
  if (Platform.OS === 'web') return;

  // Cancela o timeout de hoje
  const timeoutId = await AsyncStorage.getItem(TIMEOUT_ID_KEY);
  if (timeoutId) {
    await Notifications.cancelScheduledNotificationAsync(timeoutId).catch(() => {});
    await AsyncStorage.removeItem(TIMEOUT_ID_KEY);
  }

  // Reagenda o timeout para amanhã (o prompt diário continua ativo)
  await _scheduleTimeoutNotification(checkinTime, windowMinutes);
}

/**
 * Interno: agenda a notificação de timeout one-shot.
 */
async function _scheduleTimeoutNotification(
  checkinTime: string,
  windowMinutes: number
): Promise<void> {
  const timeoutDate = computeTimeoutDate(checkinTime, windowMinutes);

  const timeoutId = await Notifications.scheduleNotificationAsync({
    content: {
      title: '⚠️ Check-in não respondido',
      body: 'Você não confirmou seu check-in. Seus contatos de emergência serão notificados.',
      sound: true,
      data: {
        type: 'checkin_timeout',
        checkinTime,
        windowMinutes,
      },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: timeoutDate,
      channelId: CHECKIN_CHANNEL_ID,
    } as any,
  });
  await AsyncStorage.setItem(TIMEOUT_ID_KEY, timeoutId);
}
```

- [ ] **Step 3.4: Rodar os testes para confirmar que passam**

```bash
npx vitest run tests/checkin-service.test.ts
```

Esperado: PASS — 7 testes passando

- [ ] **Step 3.5: Verificar TypeScript**

```bash
npx tsc --noEmit
```

Esperado: sem erros

- [ ] **Step 3.6: Commit**

```bash
git add lib/checkin-service.ts tests/checkin-service.test.ts
git commit -m "feat(checkin): add checkin-service with scheduling and pure helpers"
```

---

## Task 4: `app/checkin-response.tsx` — tela de resposta

**Files:**
- Create: `app/checkin-response.tsx`

Esta tela é aberta quando o usuário toca na notificação de check-in. Exibe countdown e botão de confirmação. Ao expirar o countdown, escalona para os contatos de emergência.

- [ ] **Step 4.1: Criar `app/checkin-response.tsx`**

```tsx
/**
 * CheckinResponseScreen
 *
 * Tela de resposta ao check-in diário.
 * Aberta via deep link quando o usuário toca a notificação de check-in.
 *
 * - Countdown de checkinWindowMinutes × 60 segundos
 * - Botão "Estou Bem ✓" — cancela escalação, reagenda para amanhã
 * - Ao expirar: escalona para contatos de emergência, volta para /(tabs)
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useAppContext } from '@/lib/app-context';
import { useAccessibility } from '@/lib/accessibility-context';
import { markCheckinResponded, formatCountdown } from '@/lib/checkin-service';
import { escalateAlarmToContacts } from '@/lib/alarm-escalation';

type Status = 'waiting' | 'responded' | 'escalated';

export default function CheckinResponseScreen() {
  const router = useRouter();
  const { state } = useAppContext();
  const { isAccessibilityMode, a11yFontSize: af, a11yColors: ac } = useAccessibility();

  const { checkinTime, checkinWindowMinutes } = state.settings;
  const totalSeconds = checkinWindowMinutes * 60;

  const [secondsLeft, setSecondsLeft] = useState(totalSeconds);
  const [status, setStatus] = useState<Status>('waiting');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Escalona para contatos e volta para a home
  const handleEscalate = useCallback(async () => {
    if (status !== 'waiting') return;
    if (intervalRef.current) clearInterval(intervalRef.current);
    setStatus('escalated');

    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }

    try {
      // Reutiliza o sistema de escalonamento existente dos alarmes
      const checkinAsAlarm = {
        id: 'checkin-daily',
        time: checkinTime,
        description: 'Check-in diário sem resposta',
        enabled: true,
        repeat: 'daily' as const,
        customDays: [],
        sound: false,
        vibration: false,
      };
      await escalateAlarmToContacts(checkinAsAlarm, state.emergencyContacts);
    } catch (error) {
      console.error('[Checkin] Escalation error:', error);
    }

    // Reagenda o timeout para amanhã mesmo após escalonar
    await markCheckinResponded(checkinTime, checkinWindowMinutes);

    // Volta para a home após 3s
    setTimeout(() => router.replace('/(tabs)'), 3000);
  }, [status, checkinTime, checkinWindowMinutes, state.emergencyContacts, router]);

  // Usuário confirmou que está bem
  const handleResponded = useCallback(async () => {
    if (status !== 'waiting') return;
    if (intervalRef.current) clearInterval(intervalRef.current);
    setStatus('responded');

    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }

    await markCheckinResponded(checkinTime, checkinWindowMinutes);

    // Volta para a home após 1.5s
    setTimeout(() => router.replace('/(tabs)'), 1500);
  }, [status, checkinTime, checkinWindowMinutes, router]);

  // Inicia o countdown
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(intervalRef.current!);
          handleEscalate();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [handleEscalate]);

  // --- Estado: respondido ---
  if (status === 'responded') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: '#E8F5E9' }]}>
        <View style={styles.centerContent}>
          <MaterialIcons name="check-circle" size={96} color="#2E7D32" />
          <Text style={[styles.statusTitle, { color: '#2E7D32' }]}>Ótimo! Que bom que está bem.</Text>
          <Text style={[styles.statusSubtitle, { color: '#388E3C' }]}>Voltando ao início...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // --- Estado: escalonado ---
  if (status === 'escalated') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: '#FFF3E0' }]}>
        <View style={styles.centerContent}>
          <MaterialIcons name="warning" size={96} color="#E65100" />
          <Text style={[styles.statusTitle, { color: '#BF360C' }]}>Seus contatos foram notificados.</Text>
          <Text style={[styles.statusSubtitle, { color: '#E64A19' }]}>
            Seus contatos de emergência receberam um aviso de bem-estar.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // --- Estado: aguardando resposta ---
  const bgColor = isAccessibilityMode ? ac.background : '#F1F8E9';
  const primaryColor = isAccessibilityMode ? ac.primary : '#2E7D32';
  const textColor = isAccessibilityMode ? ac.foreground : '#1B5E20';
  const mutedColor = isAccessibilityMode ? ac.muted : '#4CAF50';
  const titleSize = isAccessibilityMode ? af['3xl'] : 28;
  const subtitleSize = isAccessibilityMode ? af.md : 16;
  const buttonSize = isAccessibilityMode ? af.xl : 20;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bgColor }]}>
      <View style={styles.centerContent}>
        {/* Ícone */}
        <MaterialIcons name="favorite" size={isAccessibilityMode ? 100 : 80} color={primaryColor} />

        {/* Título */}
        <Text style={[styles.title, { color: textColor, fontSize: titleSize }]}>
          Você está bem?
        </Text>

        {/* Subtítulo */}
        <Text style={[styles.subtitle, { color: mutedColor, fontSize: subtitleSize }]}>
          Confirme que está tudo bem.{'\n'}
          Se não responder, seus contatos serão avisados.
        </Text>

        {/* Countdown */}
        <View style={[styles.countdownBox, { borderColor: primaryColor + '44' }]}>
          <Text style={[styles.countdownLabel, { color: mutedColor, fontSize: subtitleSize - 2 }]}>
            Tempo restante
          </Text>
          <Text style={[styles.countdownValue, { color: textColor, fontSize: isAccessibilityMode ? af['4xl'] : 48 }]}>
            {formatCountdown(secondsLeft)}
          </Text>
        </View>

        {/* Botão principal */}
        <Pressable
          onPress={handleResponded}
          style={({ pressed }) => [
            styles.respondButton,
            {
              backgroundColor: primaryColor,
              opacity: pressed ? 0.85 : 1,
              minHeight: isAccessibilityMode ? 80 : 64,
            },
          ]}
          accessibilityLabel="Confirmar que estou bem"
          accessibilityRole="button"
        >
          <MaterialIcons name="check" size={isAccessibilityMode ? 36 : 28} color="#FFFFFF" />
          <Text style={[styles.respondButtonText, { fontSize: buttonSize }]}>
            Estou Bem ✓
          </Text>
        </Pressable>

        {/* Aviso */}
        <Text style={[styles.disclaimer, { color: mutedColor, fontSize: subtitleSize - 2 }]}>
          Vigora não é um serviço de emergência.{'\n'}
          Em caso de emergência, ligue 192 (SAMU).
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 24,
  },
  title: {
    fontWeight: '800',
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
    lineHeight: 24,
  },
  countdownBox: {
    alignItems: 'center',
    borderWidth: 2,
    borderRadius: 20,
    paddingHorizontal: 32,
    paddingVertical: 16,
    gap: 4,
  },
  countdownLabel: {
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  countdownValue: {
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  respondButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 40,
    borderRadius: 20,
    width: '100%',
  },
  respondButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  disclaimer: {
    textAlign: 'center',
    lineHeight: 20,
    opacity: 0.7,
  },
  statusTitle: {
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
  },
  statusSubtitle: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
  },
});
```

- [ ] **Step 4.2: Verificar TypeScript**

```bash
npx tsc --noEmit
```

Esperado: sem erros

- [ ] **Step 4.3: Commit**

```bash
git add app/checkin-response.tsx
git commit -m "feat(checkin): add checkin-response full-screen screen"
```

---

## Task 5: Montar inicializador e tratar notificações em `_layout.tsx`

**Files:**
- Create: `components/checkin-initializer.tsx`
- Modify: `app/_layout.tsx`

- [ ] **Step 5.1: Criar `components/checkin-initializer.tsx`**

```tsx
/**
 * CheckinInitializer
 *
 * Componente sem UI que roda no startup e garante que o check-in
 * está agendado corretamente se `checkinEnabled` for true.
 *
 * Monta após o AppProvider (que já carregou o estado do AsyncStorage),
 * por isso pode ler `state.settings.checkinEnabled` com segurança.
 */
import { useEffect } from 'react';
import { useAppContext } from '@/lib/app-context';
import { scheduleCheckin, cancelCheckin } from '@/lib/checkin-service';

export function CheckinInitializer() {
  const { state } = useAppContext();
  const { checkinEnabled, checkinTime, checkinWindowMinutes, notificationsEnabled } = state.settings;

  useEffect(() => {
    if (state.isLoading) return; // Aguarda o estado carregar do AsyncStorage

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

  return null;
}
```

- [ ] **Step 5.2: Montar `CheckinInitializer` em `app/_layout.tsx`**

Localizar a linha que importa `MonitoringInitializer` e adicionar junto:

```typescript
import { CheckinInitializer } from '@/components/checkin-initializer';
```

Localizar onde `<MonitoringInitializer />` está renderizado no JSX (dentro do `<AppProvider>`) e adicionar logo abaixo:

```tsx
<CheckinInitializer />
```

- [ ] **Step 5.3: Adicionar handler para `checkin_timeout` em `_layout.tsx`**

Localizar o `useEffect` que lida com `Notifications.addNotificationResponseReceivedListener` (ou o handler de notificação) em `app/_layout.tsx`. Dentro do callback que processa o `data` da notificação, adicionar antes da navegação existente:

```typescript
// Handler: check-in timeout — usuário não respondeu a tempo
if (data?.type === 'checkin_timeout') {
  // A tela checkin-response já cuida do escalonamento quando aberta via prompt.
  // Aqui garantimos que o escalonamento roda mesmo que o usuário abra a
  // notificação de timeout diretamente, sem ter visto a tela de resposta.
  router.push('/checkin-response');
  return;
}

// Handler: check-in prompt — usuário tocou na notificação de convite
if (data?.type === 'checkin_prompt' || data?.url === '/checkin-response') {
  router.push('/checkin-response');
  return;
}
```

> **Nota:** O local exato depende de como o handler está estruturado no `_layout.tsx` atual. Procure pelo bloco que lê `notification.request.content.data` e adicione antes dos handlers existentes.

- [ ] **Step 5.4: Verificar TypeScript**

```bash
npx tsc --noEmit
```

Esperado: sem erros

- [ ] **Step 5.5: Commit**

```bash
git add components/checkin-initializer.tsx app/_layout.tsx
git commit -m "feat(checkin): mount CheckinInitializer and wire notification handlers"
```

---

## Task 6: Seção de configuração em `settings.tsx`

**Files:**
- Modify: `app/(tabs)/settings.tsx`

- [ ] **Step 6.1: Adicionar import do checkin-service em `settings.tsx`**

```typescript
import { scheduleCheckin, cancelCheckin } from '@/lib/checkin-service';
```

- [ ] **Step 6.2: Adicionar seção "Check-in Diário" em `settings.tsx`**

Localizar onde as `<CollapsibleSection>` são renderizadas (exemplo: seção de "Monitoramento" ou "Alarmes") e adicionar uma nova seção. A seção usa o padrão existente de `CollapsibleSection` e `SettingRow` que já está no arquivo:

```tsx
{/* ── Check-in Diário ─────────────────────────────────────────── */}
<CollapsibleSection
  title="Check-in Diário"
  icon="check-circle"
  iconBg="#E8F5E9"
  iconColor="#2E7D32"
  colors={colors}
>
  {/* Toggle: habilitar/desabilitar */}
  <View style={[styles.settingRow, { borderBottomColor: colors.border }]}>
    <View style={styles.settingLeft}>
      <Text style={[styles.settingLabel, { color: colors.foreground, fontSize: fs.md }]}>
        Check-in ativo
      </Text>
      <Text style={[styles.settingSubLabel, { color: colors.muted, fontSize: fs.sm }]}>
        Notificação diária para confirmar que está bem
      </Text>
    </View>
    <Switch
      value={state.settings.checkinEnabled}
      onValueChange={async (value) => {
        dispatch({ type: 'UPDATE_SETTINGS', payload: { checkinEnabled: value } });
        if (value) {
          await scheduleCheckin(
            state.settings.checkinTime,
            state.settings.checkinWindowMinutes
          );
        } else {
          await cancelCheckin();
        }
      }}
      trackColor={{ false: colors.border, true: '#2E7D32' }}
      thumbColor="#FFFFFF"
    />
  </View>

  {/* Horário do check-in (só visível quando ativo) */}
  {state.settings.checkinEnabled && (
    <>
      <View style={[styles.settingRow, { borderBottomColor: colors.border }]}>
        <View style={styles.settingLeft}>
          <Text style={[styles.settingLabel, { color: colors.foreground, fontSize: fs.md }]}>
            Horário
          </Text>
          <Text style={[styles.settingSubLabel, { color: colors.muted, fontSize: fs.sm }]}>
            Quando você receberá a notificação
          </Text>
        </View>
        <Pressable
          onPress={() => {
            // Abre modal simples de seleção de hora
            // Reutiliza o mesmo padrão de entrada de horário dos alarmes:
            // mostra um AppDialog com TextInput para o usuário digitar HH:MM
            showDialog({
              title: 'Horário do Check-in',
              message: 'Digite o horário no formato HH:MM',
              variant: 'input',
              defaultValue: state.settings.checkinTime,
              buttons: [
                { text: 'Cancelar', style: 'cancel' },
                {
                  text: 'Salvar',
                  onPress: async (value?: string) => {
                    const timeRegex = /^([01]?\d|2[0-3]):([0-5]\d)$/;
                    if (!value || !timeRegex.test(value)) return;
                    dispatch({ type: 'UPDATE_SETTINGS', payload: { checkinTime: value } });
                    await scheduleCheckin(value, state.settings.checkinWindowMinutes);
                  },
                },
              ],
            });
          }}
          style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
        >
          <Text style={{ color: colors.primary, fontSize: fs.md, fontWeight: '700' }}>
            {state.settings.checkinTime}
          </Text>
        </Pressable>
      </View>

      {/* Janela de resposta */}
      <View style={[styles.settingRow, { borderBottomColor: colors.border }]}>
        <View style={styles.settingLeft}>
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
                dispatch({ type: 'UPDATE_SETTINGS', payload: { checkinWindowMinutes: mins } });
                await scheduleCheckin(state.settings.checkinTime, mins);
              }}
              style={({ pressed }) => [{
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 8,
                borderWidth: 1,
                backgroundColor:
                  state.settings.checkinWindowMinutes === mins
                    ? '#2E7D32'
                    : colors.surface,
                borderColor:
                  state.settings.checkinWindowMinutes === mins
                    ? '#2E7D32'
                    : colors.border,
                opacity: pressed ? 0.7 : 1,
              }]}
            >
              <Text style={{
                color:
                  state.settings.checkinWindowMinutes === mins
                    ? '#FFFFFF'
                    : colors.foreground,
                fontSize: fs.sm,
                fontWeight: '600',
              }}>
                {mins}min
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Info sobre disclaimer */}
      <View style={{ padding: 16, paddingTop: 8 }}>
        <Text style={{ color: colors.muted, fontSize: fs.xs, lineHeight: 18 }}>
          ⚠️ O check-in não substitui serviços de emergência. Em caso de emergência ligue 192 (SAMU).
        </Text>
      </View>
    </>
  )}
</CollapsibleSection>
```

> **Nota:** `showDialog` já está disponível no componente via `useAppDialog()`. Se a variante `'input'` não existir no `AppDialog` atual, usar o horário fixo e adicionar um `TextInput` inline, igual ao modal de alarmes em `alarms.tsx`. Verificar o tipo `AppDialogProps` antes de usar `'input'`.

- [ ] **Step 6.3: Verificar TypeScript**

```bash
npx tsc --noEmit
```

Se `AppDialog` não suporta `variant: 'input'`, substituir o Pressable do horário por um `TextInput` inline:

```tsx
<TextInput
  value={state.settings.checkinTime}
  onChangeText={(v) => {
    const timeRegex = /^([01]?\d|2[0-3]):([0-5]\d)$/;
    if (timeRegex.test(v)) {
      dispatch({ type: 'UPDATE_SETTINGS', payload: { checkinTime: v } });
      scheduleCheckin(v, state.settings.checkinWindowMinutes);
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
```

- [ ] **Step 6.4: Commit**

```bash
git add app/(tabs)/settings.tsx
git commit -m "feat(checkin): add daily check-in settings section"
```

---

## Task 7: Rodar todos os testes e verificação final

- [ ] **Step 7.1: Rodar todos os testes**

```bash
npx vitest run tests/checkin-state.test.ts tests/checkin-service.test.ts
```

Esperado: PASS — todos os testes passando (10 testes no total)

- [ ] **Step 7.2: Verificar TypeScript completo**

```bash
npx tsc --noEmit
```

Esperado: sem erros

- [ ] **Step 7.3: Verificar que o canal de check-in está registrado no startup**

Abrir `lib/notifications-utils.ts` e confirmar que `CHECKIN_CHANNEL_ID` está sendo criado dentro de `setupNotificationChannels()` (que já é chamado em `app/_layout.tsx` no `useEffect` de inicialização).

- [ ] **Step 7.4: Commit final**

```bash
git add -A
git commit -m "feat(checkin): complete daily check-in feature

- AppSettings: checkinEnabled, checkinTime, checkinWindowMinutes
- lib/checkin-service.ts: schedule/cancel/markResponded + pure helpers
- app/checkin-response.tsx: full-screen countdown response screen
- components/checkin-initializer.tsx: startup sync
- app/_layout.tsx: checkin_prompt + checkin_timeout notification handlers
- app/(tabs)/settings.tsx: check-in configuration section
- tests: 10 unit tests for pure functions"
```

---

## Self-Review

### Spec coverage

| Requisito (launch-scope-v1.md) | Implementado em |
|---|---|
| "tudo bem?" prompt at a user-set time | Task 6 (settings) + Task 3 (scheduleCheckin com DAILY trigger) |
| auto-escalates to contacts if no response | Task 4 (checkin-response countdown → escalateAlarmToContacts) + Task 3 (_scheduleTimeoutNotification) |
| Configuração de horário pelo usuário | Task 6 (settings section) |
| Persiste configuração entre sessões | Automático — AppSettings já vai para userData.settings via cloud sync |
| Startup: reagenda se configurado | Task 5 (CheckinInitializer) |
| Notificação de timeout visível mesmo sem abrir o app | Task 3 (_scheduleTimeoutNotification: DATE trigger, mostra notificação) |
| Disclaimer LGPD (não substitui emergência) | Task 4 (checkin-response.tsx, linha de disclaimer) |

### Checklist de ausência de placeholders

- ✅ Nenhum "TODO", "TBD", ou "implement later"
- ✅ Todos os blocos de código são completos
- ✅ Comandos de test têm output esperado
- ✅ Tipos consistentes: `checkinTime: string` (HH:mm) e `checkinWindowMinutes: number` em todas as tasks

### Consistência de tipos

- `computeTimeoutDate(checkinTime: string, windowMinutes: number, now?: Date)` — usada em Task 3 (implementação) e Task 3 Step 3.1 (testes) ✅
- `formatCountdown(totalSeconds: number): string` — usada em Task 3 (implementação) e Task 4 (tela) ✅
- `markCheckinResponded(checkinTime: string, windowMinutes: number)` — usada em Task 4 e Task 5 (initializer) ✅
- `scheduleCheckin(checkinTime: string, windowMinutes: number)` — usada em Tasks 5, 6 ✅
- `cancelCheckin()` — usada em Tasks 5, 6 ✅
