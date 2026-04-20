import React, { useEffect, useRef } from 'react';
import { Alert, AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useAppContext } from '@/lib/app-context';
import { clearAlarmTimeout } from '@/lib/alarm-timeout-manager';
import { escalateAlarmToContacts, type EscalationResult } from '@/lib/alarm-escalation';
import { saveAlarmTimer, clearAlarmTimer, loadAlarmTimer, computeSecondsLeft } from '@/lib/alarm-timer-store';
import { startCountdownNotification, stopCountdownNotification } from '@/lib/alarm-countdown-notifier';
import { isNativeAlarmAvailable } from '@/lib/native-alarm-manager';

// Lazy-load expo-alarm-module getAlarmState for Android
let getAlarmStateNative: (() => Promise<string | null>) | null = null;
if (Platform.OS === 'android') {
  try {
    const mod = require('expo-alarm-module');
    getAlarmStateNative = mod.getAlarmState;
  } catch {}
}

/**
 * Extract the Vigora alarmId from a native alarm UID.
 * Native UIDs look like: "vigora_<alarmId>" or "vigora_<alarmId>_mon" etc.
 */
function extractAlarmIdFromUid(uid: string): string | null {
  // Native UIDs: "vigora_<alarmId>" (one-time/daily) or "vigora_<alarmId>_wd<0-6>" (weekday)
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
 *   by the native alarm and start the countdown + escalation timer.
 * - iOS/Web: expo-notifications fires the alarm and we handle it here.
 *
 * Synchronized timer:
 * - When an alarm fires, we record startedAt + expiresAt in AsyncStorage.
 * - alarm-ring.tsx reads this on mount to compute the real secondsLeft.
 * - The native alarm notification title is updated every second with the countdown.
 */
export function AlarmNotificationHandler() {
  const { state, dispatch } = useAppContext();
  const router = useRouter();
  const pendingAlarms = useRef<Set<string>>(new Set());
  const navigatedAlarms = useRef<Set<string>>(new Set());
  const escalationTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  /**
   * Shared alarm-fired handler — called when an alarm fires (foreground or background).
   * Sets up the timer, starts the countdown notification, and schedules escalation.
   */
  const handleAlarmFired = async (alarmId: string) => {
    const alarm = state.alarms.find((a) => a.id === alarmId);
    if (!alarm || !alarm.enabled) return;

    console.log(`[AlarmHandler] Alarm fired: ${alarmId}`);

    // ── Synchronized timer setup ──────────────────────────────────────────────────────────────────────
    const timerDuration = state.settings.timerDuration ?? 30;

    // Check if a timer is already running for this alarm (e.g., app foregrounded
    // after tapping notification). If so, reuse the existing expiresAt so the
    // in-app countdown stays in sync with the notification countdown.
    let expiresAt: number;
    const existingEntry = await loadAlarmTimer(alarmId);
    if (existingEntry && existingEntry.expiresAt > Date.now()) {
      // Timer already running — reuse it
      expiresAt = existingEntry.expiresAt;
      console.log(`[AlarmHandler] Reusing existing timer for ${alarmId}, ${computeSecondsLeft(existingEntry)}s left`);
    } else {
      // Fresh alarm — create a new timer
      const startedAt = Date.now();
      expiresAt = startedAt + timerDuration * 1000;
      await saveAlarmTimer({ alarmId, startedAt, expiresAt, timerDuration });
      console.log(`[AlarmHandler] New timer for ${alarmId}, ${timerDuration}s`);
    }

    // Navigate to alarm-ring screen, passing expiresAt as URL param to avoid AsyncStorage race condition.
    // alarm-ring will use expiresAt directly instead of waiting for AsyncStorage.
    if (!navigatedAlarms.current.has(alarmId)) {
      navigatedAlarms.current.add(alarmId);
      router.push(`/alarm-ring?alarmId=${alarmId}&expiresAt=${expiresAt}`);
      setTimeout(() => navigatedAlarms.current.delete(alarmId), 5000);
    }

    // Track this alarm as pending response
    pendingAlarms.current.add(alarmId);

    // Start countdown notification — shows expo-notifications with live countdown every second
    startCountdownNotification(
      alarmId,
      alarm.description || 'Alarme',
      expiresAt,
      timerDuration,
    );

    // Escalation timeout — fires after timerDuration seconds
    const existingTimer = escalationTimers.current.get(alarmId);
    if (existingTimer) clearTimeout(existingTimer);

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
              alarm,
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
    }, timerDuration * 1000);

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
            // Navigate immediately — expiresAt will be loaded from AsyncStorage in alarm-ring
            // (by this point handleAlarmFired has already saved it or will save it shortly)
            if (!navigatedAlarms.current.has(alarmId)) {
              navigatedAlarms.current.add(alarmId);
              // Load existing timer first to pass expiresAt in URL
              const existingForNav = await loadAlarmTimer(alarmId).catch(() => null);
              const navExpiresAt = existingForNav?.expiresAt ?? (Date.now() + (state.settings.timerDuration ?? 30) * 1000);
              navigatedAlarms.current.add(alarmId);
              router.push(`/alarm-ring?alarmId=${alarmId}&expiresAt=${navExpiresAt}`);
              setTimeout(() => navigatedAlarms.current.delete(alarmId), 5000);
            }
            // Then run the rest of the alarm-fired logic asynchronously
            handleAlarmFired(alarmId);
          }
        }
      } catch (e) {
        console.warn('[AlarmHandler] AppState getAlarmState failed:', e);
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [state.alarms, state.settings.timerDuration]);

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
  }, [state.alarms, state.emergencyContacts, state.missedAlarmCount, state.settings.missedAlarmThreshold, state.settings.timerDuration, state.profile, dispatch, router]);

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
        router.push(`/alarm-ring?alarmId=${alarmId}`);
      }
    });

    return () => subscription.remove();
  }, [dispatch, router]);

  return null;
}
