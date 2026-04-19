import React, { useEffect, useRef } from 'react';
import { Alert, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useAppContext } from '@/lib/app-context';
import { startAlarmTimeout, clearAlarmTimeout } from '@/lib/alarm-timeout-manager';
import { escalateAlarmToContacts, type EscalationResult } from '@/lib/alarm-escalation';

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
 * Hybrid escalation strategy:
 * 1. PRIMARY: Deep link — opens WhatsApp with pre-filled message (user's personal number)
 * 2. FALLBACK: Server API — sends via WhatsApp Business API (automatic, business number)
 *
 * Key behavior:
 * 1. When a notification is RECEIVED (app in foreground):
 *    → Automatically navigates to alarm-ring screen
 *    → Starts escalation timeout
 *
 * 2. When a notification is TAPPED (app in background/killed):
 *    → Navigates to alarm-ring screen
 *    → Clears escalation timeout (user is responding)
 *
 * 3. When app is launched from a notification (cold start):
 *    → Handled by _layout.tsx via getLastNotificationResponseAsync()
 */
export function AlarmNotificationHandler() {
  const { state, dispatch } = useAppContext();
  const router = useRouter();
  const pendingAlarms = useRef<Set<string>>(new Set());
  const navigatedAlarms = useRef<Set<string>>(new Set());

  // Handle alarm notification received while app is in foreground
  // → Automatically open the alarm-ring screen (real alarm behavior)
  useEffect(() => {
    const subscription = Notifications.addNotificationReceivedListener((notification) => {
      const alarmId = notification.request.content.data?.alarmId as string | undefined;

      if (alarmId) {
        console.log(`[AlarmHandler] Alarm fired (foreground): ${alarmId}`);

        const alarm = state.alarms.find((a) => a.id === alarmId);
        if (alarm && alarm.enabled) {
          // Track this alarm as pending response
          pendingAlarms.current.add(alarmId);

          // Start timeout for escalation (2 min)
          startAlarmTimeout(alarm, state.emergencyContacts);

          // IMPORTANT: Automatically navigate to alarm-ring screen
          // This makes it behave like a real alarm — the screen takes over immediately
          if (!navigatedAlarms.current.has(alarmId)) {
            navigatedAlarms.current.add(alarmId);
            router.push(`/alarm-ring?alarmId=${alarmId}`);

            // Clean up navigated set after 5 seconds to allow re-navigation
            setTimeout(() => navigatedAlarms.current.delete(alarmId), 5000);
          }

          // Set a timeout to check if alarm was responded to
          setTimeout(() => {
            if (pendingAlarms.current.has(alarmId)) {
              // Alarm was NOT responded to — increment missed counter
              pendingAlarms.current.delete(alarmId);
              dispatch({ type: 'INCREMENT_MISSED_ALARM' });

              console.log(
                `[AlarmHandler] Missed alarm count: ${state.missedAlarmCount + 1} / threshold: ${state.settings.missedAlarmThreshold}`
              );

              // Check if threshold reached
              const newCount = state.missedAlarmCount + 1;
              if (newCount >= state.settings.missedAlarmThreshold) {
                console.log('[AlarmHandler] Threshold reached! Triggering hybrid WhatsApp escalation...');

                if (Platform.OS !== 'web') {
                  // Use the hybrid escalation system
                  escalateAlarmToContacts(
                    alarm,
                    state.emergencyContacts,
                    undefined, // location will be fetched automatically
                    state.profile?.name || undefined,
                    newCount
                  ).then((result) => {
                    console.log(`[AlarmHandler] Escalation complete: method=${result.method}, sent=${result.totalSent}`);
                    showEscalationAlert(result);
                  }).catch((error) => {
                    console.error('[AlarmHandler] Escalation error:', error);
                  });
                }

                // Reset counter after escalation
                dispatch({ type: 'RESET_MISSED_ALARM' });
              }
            }
          }, 2 * 60 * 1000); // 2 minutes timeout
        }
      }
    });

    return () => subscription.remove();
  }, [state.alarms, state.emergencyContacts, state.missedAlarmCount, state.settings.missedAlarmThreshold, state.profile, dispatch, router]);

  // Handle notification response (user taps alarm notification from tray)
  // This handles the case where the app is in background and user taps the notification
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const alarmId = response.notification.request.content.data?.alarmId as string | undefined;

      if (alarmId) {
        console.log(`[AlarmHandler] Alarm tapped (from notification): ${alarmId}`);

        // Clear pending state — user is responding
        pendingAlarms.current.delete(alarmId);
        clearAlarmTimeout(alarmId);

        // Navigate to full-screen alarm ring screen
        router.push(`/alarm-ring?alarmId=${alarmId}`);
      }
    });

    return () => subscription.remove();
  }, [dispatch, router]);

  return null;
}
