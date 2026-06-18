import * as Notifications from 'expo-notifications';
import { Alarm, EmergencyContact } from './app-context';
import { escalateAlarmToContacts } from './alarm-escalation';

/**
 * Alarm timeout configuration
 */
export const ALARM_TIMEOUT_CONFIG = {
  ESCALATION_DELAY_MS: 2 * 60 * 1000, // 2 minutes before escalation
  CHECK_INTERVAL_MS: 5 * 1000, // Check every 5 seconds
};

/**
 * Track active alarm timeouts
 */
const activeTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
const escalatedAlarms = new Set<string>();

/**
 * Start timeout monitoring for an alarm
 * If alarm is not dismissed within ESCALATION_DELAY_MS, escalate to emergency contacts
 */
export function startAlarmTimeout(
  alarm: Alarm,
  contacts: EmergencyContact[],
  userLocation?: { latitude: number; longitude: number }
): void {
  // Clear any existing timeout for this alarm
  clearAlarmTimeout(alarm.id);

  console.log(`[Alarm Timeout] Starting timeout for alarm ${alarm.id} (${ALARM_TIMEOUT_CONFIG.ESCALATION_DELAY_MS}ms)`);

  const timeoutId = setTimeout(async () => {
    console.log(`[Alarm Timeout] Timeout reached for alarm ${alarm.id}, escalating...`);

    // Check if alarm has already been escalated
    if (escalatedAlarms.has(alarm.id)) {
      console.log(`[Alarm Timeout] Alarm ${alarm.id} already escalated, skipping`);
      return;
    }

    // Mark as escalated
    escalatedAlarms.add(alarm.id);

    // Escalate to emergency contacts
    try {
      const result = await escalateAlarmToContacts(alarm, contacts, userLocation);
      console.log(`[Alarm Timeout] Escalation complete: ${result.totalSent} sent, ${result.totalFailed} failed (method: ${result.method})`);

      // Send notification about escalation
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '🚨 Alarme Escalado',
          body: `Alarme não respondido. Contatos de emergência foram notificados via WhatsApp.`,
          data: { type: 'alarm_escalated', alarmId: alarm.id },
          sound: 'default',
        },
        trigger: null, // Send immediately
      });
    } catch (error) {
      console.error(`[Alarm Timeout] Error escalating alarm ${alarm.id}:`, error);
    }

    // Clean up
    activeTimeouts.delete(alarm.id);
  }, ALARM_TIMEOUT_CONFIG.ESCALATION_DELAY_MS);

  activeTimeouts.set(alarm.id, timeoutId);
}

/**
 * Clear timeout for an alarm (when dismissed or snoozed)
 */
export function clearAlarmTimeout(alarmId: string): void {
  const timeoutId = activeTimeouts.get(alarmId);
  if (timeoutId) {
    clearTimeout(timeoutId);
    activeTimeouts.delete(alarmId);
    escalatedAlarms.delete(alarmId);
    console.log(`[Alarm Timeout] Cleared timeout for alarm ${alarmId}`);
  }
}

/**
 * Clear all active timeouts
 */
export function clearAllAlarmTimeouts(): void {
  activeTimeouts.forEach((timeoutId) => clearTimeout(timeoutId));
  activeTimeouts.clear();
  escalatedAlarms.clear();
  console.log('[Alarm Timeout] Cleared all timeouts');
}
