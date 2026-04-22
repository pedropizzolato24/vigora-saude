import React, { useEffect, useRef } from 'react';
import { Alert, AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useAppContext } from '@/lib/app-context';
import { clearAlarmTimeout } from '@/lib/alarm-timeout-manager';
import { escalateAlarmToContacts, type EscalationResult } from '@/lib/alarm-escalation';
import { saveAlarmTimer, clearAlarmTimer, loadAlarmTimer } from '@/lib/alarm-timer-store';
import { startCountdownNotification, stopCountdownNotification } from '@/lib/alarm-countdown-notifier';
import { isNativeAlarmAvailable } from '@/lib/native-alarm-manager';
import { updateAlarmWidgetOnFire } from '@/lib/update-widgets';

// Lazy-load expo-alarm-module getAlarmState for Android
let getAlarmStateNative: (() => Promise<string | null>) | null = null;
if (Platform.OS === 'android') {
  try {
    const mod = require('expo-alarm-module');
    getAlarmStateNative = mod.getAlarmState;
  } catch {}
}

const STORAGE_KEY = 'vigora_app_state';

/**
 * Read timerDuration directly from AsyncStorage to avoid stale closure issues.
 * Falls back to 30s if not found or not yet loaded.
 */
async function readTimerDurationFromStorage(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const duration = parsed?.settings?.timerDuration;
      if (typeof duration === 'number' && [15, 30, 45, 60].includes(duration)) {
        return duration;
      }
    }
  } catch {}
  return 30;
}

/**
 * Extract the Vigora alarmId from a native alarm UID.
 * Native UIDs look like: "vigora_<alarmId>" or "vigora_<alarmId>_wd<0-6>"
 */
function extractAlarmIdFromUid(uid: string): string | null {
  const match = uid.match(/^vigora_(.+?)(?:_wd\d+)?$/);
  return match ? match[1] : null;
}

/**
 * Shows an alert to the user with the escalation result summary.
 */
function showEscalationAlert(result: EscalationResult) {
  if (result.totalSent === 0 && result.method === 'none') return;

  let title = 'Escalação Automática';
  let body = '';

  switch (result.method) {
    case 'deeplink':
      body = `Mensagens WhatsApp abertas para ${result.deepLinkSent} contato(s) de emergência.\n\nAs mensagens foram abertas no seu WhatsApp pessoal. Confirme o envio de cada uma.`;
      break;
    case 'server_api':
      body = `Mensagens enviadas automaticamente para ${result.serverApiSent} contato(s) de emergência via WhatsApp Business.\n\nAs mensagens foram enviadas do número do Vigora Saúde.`;
      break;
    case 'both':
      body = `Escalação híbrida:\n• ${result.deepLinkSent} contato(s) via seu WhatsApp pessoal\n• ${result.serverApiSent} contato(s) via WhatsApp Business (automático)`;
      break;
    default:
      body = 'Nenhum contato de emergência foi notificado. Verifique se há contatos com WhatsApp configurados.';
      title = 'Escalação Falhou';
  }

  Alert.alert(title, body);
}

/**
 * Component that handles alarm notifications and triggers escalation.
 *
 * Architecture:
 * - Android: expo-alarm-module fires the alarm natively (no expo-notifications needed).
 *   The native module creates its own notification. We listen for the app being opened
 *   by the native alarm and start the escalation timer.
 * - iOS/Web: expo-notifications fires the alarm and we handle it here.
 *
 * Synchronized timer:
 * - When an alarm fires, we record startedAt + expiresAt in AsyncStorage.
 * - alarm-ring.tsx reads this on mount to compute the real secondsLeft.
 * - timerDuration is read directly from AsyncStorage (not from React state)
 *   to avoid stale closure issues when the alarm fires before React state loads.
 */
export function AlarmNotificationHandler() {
  const { state, dispatch } = useAppContext();
  const router = useRouter();
  const pendingAlarms = useRef<Set<string>>(new Set());
  const navigatedAlarms = useRef<Set<string>>(new Set());
  const escalationTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  /**
   * Shared alarm-fired handler — called when an alarm fires (foreground or background).
   * Sets up the timer, navigates to alarm-ring, and schedules escalation.
   *
   * Key fix: reads timerDuration directly from AsyncStorage to avoid stale closure
   * issues when state.settings.timerDuration hasn't loaded yet from AsyncStorage.
   */
  const handleAlarmFired = async (alarmId: string) => {
    // Read alarm from current state — if state is still loading, try to find it anyway
    const alarm = state.alarms.find((a) => a.id === alarmId);

    // If alarm not found in state yet (state still loading), try reading from AsyncStorage
    let alarmData = alarm;
    if (!alarmData || !alarmData.enabled) {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          alarmData = parsed?.alarms?.find((a: any) => a.id === alarmId && a.enabled);
        }
      } catch {}
    }

    if (!alarmData || !alarmData.enabled) {
      console.log(`[AlarmHandler] Alarm ${alarmId} not found or disabled — skipping`);
      return;
    }

    console.log(`[AlarmHandler] Alarm fired: ${alarmId}`);

    // ── Read timerDuration from AsyncStorage (avoids stale closure) ──────────────
    const timerDuration = await readTimerDurationFromStorage();

    // ── Synchronized timer setup ─────────────────────────────────────────────────
    // Check if a timer is already running for this alarm (e.g., app foregrounded
    // after tapping notification). If so, reuse the existing expiresAt.
    let expiresAt: number;
    const existingEntry = await loadAlarmTimer(alarmId);
    if (existingEntry && existingEntry.expiresAt > Date.now()) {
      // Timer already running — reuse it
      expiresAt = existingEntry.expiresAt;
      console.log(`[AlarmHandler] Reusing existing timer for ${alarmId}, expires in ${Math.ceil((expiresAt - Date.now()) / 1000)}s`);
    } else {
      // Fresh alarm — create a new timer
      const startedAt = Date.now();
      expiresAt = startedAt + timerDuration * 1000;
      await saveAlarmTimer({ alarmId, startedAt, expiresAt, timerDuration });
      console.log(`[AlarmHandler] New timer for ${alarmId}, ${timerDuration}s, expires at ${expiresAt}`);
    }

    // Atualiza widget Android para mostrar estado "tocando agora"
    updateAlarmWidgetOnFire(alarmData.description || 'Alarme').catch(() => {});

    // Inicia countdown na notificação nativa via módulo nativo
    startCountdownNotification(
      alarmId,
      alarmData.description || 'Alarme de Medicamento',
      expiresAt,
    );

    // Navigate to alarm-ring screen, passing expiresAt as URL param.
    // alarm-ring uses expiresAt directly — no AsyncStorage race condition.
    if (!navigatedAlarms.current.has(alarmId)) {
      navigatedAlarms.current.add(alarmId);
      router.push(`/alarm-ring?alarmId=${alarmId}&expiresAt=${expiresAt}`);
      setTimeout(() => navigatedAlarms.current.delete(alarmId), 5000);
    }

    // Track this alarm as pending response
    pendingAlarms.current.add(alarmId);

    // Escalation timeout — fires after timerDuration seconds
    const existingTimer = escalationTimers.current.get(alarmId);
    if (existingTimer) clearTimeout(existingTimer);

    const msUntilExpiry = Math.max(0, expiresAt - Date.now());
    const escalationTimer = setTimeout(() => {
      escalationTimers.current.delete(alarmId);

      if (pendingAlarms.current.has(alarmId)) {
        pendingAlarms.current.delete(alarmId);
        dispatch({ type: 'INCREMENT_MISSED_ALARM' });

        const newCount = state.missedAlarmCount + 1;
        if (newCount >= state.settings.missedAlarmThreshold) {
          console.log('[AlarmHandler] Threshold reached! Triggering hybrid WhatsApp escalation...');

          if (Platform.OS !== 'web') {
            escalateAlarmToContacts(
              alarmData!,
              state.emergencyContacts,
              undefined,
              state.profile?.name || undefined,
              newCount
            ).then((result) => {
              showEscalationAlert(result);
            }).catch((error) => {
              console.error('[AlarmHandler] Escalation error:', error);
            });
          }

          dispatch({ type: 'RESET_MISSED_ALARM' });
        }
      }
    }, msUntilExpiry);

    escalationTimers.current.set(alarmId, escalationTimer);
  };

  // Android: detect when app comes to foreground with a native alarm active.
  // This handles the case where the user taps the native alarm notification
  // while the app is in background (not killed).
  useEffect(() => {
    if (!isNativeAlarmAvailable || !getAlarmStateNative) return;

    const handleAppStateChange = async (nextState: string) => {
      if (nextState !== 'active') return;

      try {
        const activeUid = await getAlarmStateNative!();
        if (activeUid && typeof activeUid === 'string') {
          const alarmId = extractAlarmIdFromUid(activeUid);
          if (alarmId) {
            console.log(`[AlarmHandler] App foregrounded with active alarm: ${activeUid} → ${alarmId}`);

            // Load existing timer to pass expiresAt in URL (avoids AsyncStorage race)
            const existingForNav = await loadAlarmTimer(alarmId).catch(() => null);
            const navExpiresAt = existingForNav?.expiresAt ?? null;

            if (!navigatedAlarms.current.has(alarmId)) {
              navigatedAlarms.current.add(alarmId);
              const navUrl = navExpiresAt
                ? `/alarm-ring?alarmId=${alarmId}&expiresAt=${navExpiresAt}`
                : `/alarm-ring?alarmId=${alarmId}`;
              router.push(navUrl as any);
              setTimeout(() => navigatedAlarms.current.delete(alarmId), 5000);
            }

            // Run the rest of the alarm-fired logic asynchronously
            handleAlarmFired(alarmId);
          }
        }
      } catch (e) {
        console.warn('[AlarmHandler] AppState getAlarmState failed:', e);
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
    // Note: intentionally omitting state from deps — we read from AsyncStorage directly
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle alarm notification received via expo-notifications (iOS/Web only)
  // On Android, expo-alarm-module fires the alarm natively — no expo-notifications needed.
  useEffect(() => {
    if (isNativeAlarmAvailable) {
      // Android: skip expo-notifications listener — native alarm handles everything
      return;
    }

    const subscription = Notifications.addNotificationReceivedListener(async (notification) => {
      const alarmId = notification.request.content.data?.alarmId as string | undefined;
      if (alarmId) {
        await handleAlarmFired(alarmId);
      }
    });

    return () => subscription.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Android: poll getAlarmState() while app is in foreground to detect when a native
  // alarm fires without the app going to background first.
  // This is necessary because expo-alarm-module does NOT emit a JS event when the alarm
  // fires — it only creates the native notification directly via AlarmService (Java).
  // Without polling, startCountdownNotification() would never be called when the app
  // is already open at the moment the alarm fires.
  useEffect(() => {
    if (!isNativeAlarmAvailable || !getAlarmStateNative) return;

    // Track the last UID we acted on to avoid re-triggering the same alarm
    const lastActedUid = { current: null as string | null };

    const poll = async () => {
      try {
        const activeUid = await getAlarmStateNative!();
        if (activeUid && typeof activeUid === 'string') {
          // New alarm detected that we haven't acted on yet
          if (activeUid !== lastActedUid.current) {
            lastActedUid.current = activeUid;
            const alarmId = extractAlarmIdFromUid(activeUid);
            if (alarmId && !pendingAlarms.current.has(alarmId)) {
              console.log(`[AlarmHandler] Foreground poll detected active alarm: ${activeUid} → ${alarmId}`);
              handleAlarmFired(alarmId);
            }
          }
        } else {
          // No alarm active — reset so the next alarm can be detected
          lastActedUid.current = null;
        }
      } catch {
        // Silent — module may not be linked in dev/Expo Go
      }
    };

    // Poll every 2 seconds while app is mounted
    const interval = setInterval(poll, 2000);
    // Also run immediately on mount to catch alarms that fired before this component mounted
    poll();

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle notification response (user taps notification from tray)
  // On Android, this handles the expo-alarm-module notification tap.
  // On iOS/Web, this handles expo-notifications tap.
  useEffect(() => {
    if (Platform.OS === 'web') return;

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const alarmId = response.notification.request.content.data?.alarmId as string | undefined;

      if (alarmId) {
        console.log(`[AlarmHandler] Alarm tapped (from notification): ${alarmId}`);
        pendingAlarms.current.delete(alarmId);
        clearAlarmTimeout(alarmId);
        router.push(`/alarm-ring?alarmId=${alarmId}` as any);
      }
    });

    return () => subscription.remove();
  }, [dispatch, router]);

  return null;
}
