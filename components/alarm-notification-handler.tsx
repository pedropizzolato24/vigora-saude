import React, { useEffect, useRef } from 'react';
import { Alert, Linking, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Location from 'expo-location';
import { useAppContext, type EmergencyContact } from '@/lib/app-context';
import { startAlarmTimeout, clearAlarmTimeout } from '@/lib/alarm-timeout-manager';

/**
 * Sends WhatsApp messages to all emergency contacts with WhatsApp enabled.
 * Includes the user's current location if available.
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
 * Should be placed inside AppProvider in the component tree.
 */
export function AlarmNotificationHandler() {
  const { state, dispatch } = useAppContext();
  const pendingAlarms = useRef<Set<string>>(new Set());

  // Handle alarm notification received (alarm fires)
  useEffect(() => {
    const subscription = Notifications.addNotificationReceivedListener((notification) => {
      const alarmId = notification.request.content.data?.alarmId as string | undefined;

      if (alarmId) {
        console.log(`[AlarmHandler] Alarm fired: ${alarmId}`);

        const alarm = state.alarms.find((a) => a.id === alarmId);
        if (alarm && alarm.enabled) {
          // Track this alarm as pending response
          pendingAlarms.current.add(alarmId);

          // Start timeout for escalation (2 min)
          startAlarmTimeout(alarm, state.emergencyContacts);

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
  }, [state.alarms, state.emergencyContacts, state.missedAlarmCount, state.settings.missedAlarmThreshold, dispatch]);

  // Handle notification response (user taps/dismisses alarm)
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const alarmId = response.notification.request.content.data?.alarmId as string | undefined;

      if (alarmId) {
        console.log(`[AlarmHandler] Alarm responded: ${alarmId}`);
        // Remove from pending — alarm was responded to
        pendingAlarms.current.delete(alarmId);
        // Clear escalation timeout
        clearAlarmTimeout(alarmId);
        // Reset missed alarm counter (user is responsive)
        dispatch({ type: 'RESET_MISSED_ALARM' });
      }
    });

    return () => subscription.remove();
  }, [dispatch]);

  return null;
}
