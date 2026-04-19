import React, { useEffect, useRef } from 'react';
import { Alert, Linking, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useAppContext, type EmergencyContact } from '@/lib/app-context';
import { startAlarmTimeout, clearAlarmTimeout } from '@/lib/alarm-timeout-manager';

/**
 * Sends WhatsApp messages to all emergency contacts with WhatsApp enabled.
 * Uses deep links to open WhatsApp with pre-filled message for each contact.
 */
async function sendWhatsAppEscalation(contacts: EmergencyContact[], missedCount: number) {
  const whatsappContacts = contacts.filter((c) => c.whatsapp);
  if (whatsappContacts.length === 0) return;

  let locationText = '';
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status === 'granted') {
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const mapsUrl = `https://www.google.com/maps?q=${loc.coords.latitude},${loc.coords.longitude}`;
      locationText = `\n\nLocalização atual:\n${mapsUrl}`;
    }
  } catch {
    // Location unavailable, send without it
  }

  const message =
    `⚠️ ALERTA VIGORA SAÚDE ⚠️\n\n` +
    `O usuário não respondeu a ${missedCount} alarme(s) consecutivo(s).\n` +
    `Por favor, entre em contato para verificar se está tudo bem.${locationText}`;

  let sentCount = 0;
  for (const contact of whatsappContacts) {
    try {
      const phone = contact.phone.replace(/\D/g, '');
      const fullPhone = phone.length <= 11 ? `55${phone}` : phone;
      const url = `whatsapp://send?phone=${fullPhone}&text=${encodeURIComponent(message)}`;
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
        sentCount++;
        // Small delay between messages
        await new Promise((r) => setTimeout(r, 1500));
      }
    } catch {
      // Skip this contact
    }
  }

  if (sentCount > 0) {
    Alert.alert(
      'Escalação Automática',
      `Mensagens WhatsApp enviadas para ${sentCount} de ${whatsappContacts.length} contato(s) de emergência.`
    );
  }
}

/**
 * Component that handles alarm notifications, tracks missed alarms,
 * and triggers WhatsApp escalation when threshold is reached.
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
                console.log('[AlarmHandler] Threshold reached! Sending WhatsApp escalation...');
                if (Platform.OS !== 'web') {
                  sendWhatsAppEscalation(state.emergencyContacts, newCount);
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
  }, [state.alarms, state.emergencyContacts, state.missedAlarmCount, state.settings.missedAlarmThreshold, dispatch, router]);

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
