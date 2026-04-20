import React, { useEffect, useRef } from 'react';
import { Alert, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useAppContext } from '@/lib/app-context';
import { clearAlarmTimeout } from '@/lib/alarm-timeout-manager';
import { escalateAlarmToContacts, type EscalationResult } from '@/lib/alarm-escalation';
import { saveAlarmTimer, clearAlarmTimer } from '@/lib/alarm-timer-store';
import { startCountdownNotification, stopCountdownNotification } from '@/lib/alarm-countdown-notifier';

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
 * Component that handles alarm notifications, tracks missed alarms,
 * and triggers hybrid WhatsApp escalation when threshold is reached.
 *
 * Synchronized timer design:
 * - When an alarm fires, we record startedAt + expiresAt in AsyncStorage.
 * - alarm-ring.tsx reads this on mount to compute the real secondsLeft.
 * - A countdown notification is updated every second while the alarm is ringing.
 * - When the user taps the notification (even with 12s left), alarm-ring reads
 *   the persisted expiresAt and shows exactly 12s remaining.
 */
export function AlarmNotificationHandler() {
  const { state, dispatch } = useAppContext();
  const router = useRouter();
  const pendingAlarms = useRef<Set<string>>(new Set());
  const navigatedAlarms = useRef<Set<string>>(new Set());
  const escalationTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Handle alarm notification received while app is in foreground
  useEffect(() => {
    const subscription = Notifications.addNotificationReceivedListener(async (notification) => {
      const alarmId = notification.request.content.data?.alarmId as string | undefined;
      const isCountdownUpdate = notification.request.content.data?.isCountdownUpdate as boolean | undefined;

      // Ignore countdown update notifications — they are only for the notification shade
      if (isCountdownUpdate) return;

      if (alarmId) {
        console.log(`[AlarmHandler] Alarm fired (foreground): ${alarmId}`);

        const alarm = state.alarms.find((a) => a.id === alarmId);
        if (alarm && alarm.enabled) {
          // ── Synchronized timer setup ──────────────────────────────────────
          const timerDuration = state.settings.timerDuration ?? 30;
          const startedAt = Date.now();
          const expiresAt = startedAt + timerDuration * 1000;

          // Persist timer entry so alarm-ring can sync even after cold start
          await saveAlarmTimer({ alarmId, startedAt, expiresAt, timerDuration });

          // Start countdown notification (updates every second in notification shade)
          if (Platform.OS !== 'web') {
            startCountdownNotification(
              alarmId,
              alarm.description || 'Alarme',
              expiresAt,
              timerDuration
            );
          }

          // Track this alarm as pending response
          pendingAlarms.current.add(alarmId);

          // Navigate to alarm-ring screen
          if (!navigatedAlarms.current.has(alarmId)) {
            navigatedAlarms.current.add(alarmId);
            router.push(`/alarm-ring?alarmId=${alarmId}`);
            setTimeout(() => navigatedAlarms.current.delete(alarmId), 5000);
          }

          // Escalation timeout — fires after timerDuration seconds
          const existingTimer = escalationTimers.current.get(alarmId);
          if (existingTimer) clearTimeout(existingTimer);

          const escalationTimer = setTimeout(() => {
            escalationTimers.current.delete(alarmId);

            if (pendingAlarms.current.has(alarmId)) {
              pendingAlarms.current.delete(alarmId);
              dispatch({ type: 'INCREMENT_MISSED_ALARM' });

              console.log(
                `[AlarmHandler] Missed alarm count: ${state.missedAlarmCount + 1} / threshold: ${state.settings.missedAlarmThreshold}`
              );

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
                    console.log(`[AlarmHandler] Escalation complete: method=${result.method}, sent=${result.totalSent}`);
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
        }
      }
    });

    return () => subscription.remove();
  }, [state.alarms, state.emergencyContacts, state.missedAlarmCount, state.settings.missedAlarmThreshold, state.settings.timerDuration, state.profile, dispatch, router]);

  // Handle notification response (user taps alarm notification from tray)
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const alarmId = response.notification.request.content.data?.alarmId as string | undefined;
      const isCountdownUpdate = response.notification.request.content.data?.isCountdownUpdate as boolean | undefined;

      if (alarmId && !isCountdownUpdate) {
        console.log(`[AlarmHandler] Alarm tapped (from notification): ${alarmId}`);

        // Clear pending state — user is responding
        pendingAlarms.current.delete(alarmId);
        clearAlarmTimeout(alarmId);

        // Navigate to full-screen alarm ring screen
        // alarm-ring.tsx will read the persisted timer entry to show correct remaining time
        router.push(`/alarm-ring?alarmId=${alarmId}`);
      }
    });

    return () => subscription.remove();
  }, [dispatch, router]);

  return null;
}
