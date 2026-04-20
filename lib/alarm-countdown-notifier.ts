/**
 * alarm-countdown-notifier.ts
 *
 * Updates the alarm notification body every second to show the countdown timer.
 * This creates the "live countdown" effect in the notification shade.
 *
 * Strategy:
 * - We use Notifications.presentNotificationAsync() to update the notification
 *   body in-place every second while the alarm is ringing.
 * - We keep a JS setInterval running in the app process (foreground or background).
 * - The notification identifier is kept stable so it updates rather than stacks.
 * - When the alarm is dismissed or escalated, we cancel the interval and dismiss
 *   the notification.
 *
 * Limitation: When the app is fully killed (not just backgrounded), the JS
 * interval stops. In that case the notification shows the last known countdown
 * value. When the user taps it and opens the app, alarm-ring.tsx reads the
 * persisted startedAt from AsyncStorage and computes the real remaining time.
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { ALARM_CHANNEL_ID } from './notifications-utils';

// Map of alarmId → interval handle
const countdownIntervals = new Map<string, ReturnType<typeof setInterval>>();
// Map of alarmId → notification identifier used for the live countdown notification
const countdownNotifIds = new Map<string, string>();

/**
 * Format seconds as MM:SS.
 */
function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m > 0) return `${m}:${s.toString().padStart(2, '0')}`;
  return `${s}s`;
}

/**
 * Start updating the notification body every second with the countdown.
 *
 * @param alarmId - The alarm ID (used as the stable notification tag)
 * @param alarmName - Display name of the alarm/medication
 * @param expiresAt - Unix ms when escalation fires
 * @param timerDuration - Total timer duration in seconds (for display context)
 */
export async function startCountdownNotification(
  alarmId: string,
  alarmName: string,
  expiresAt: number,
  timerDuration: number
): Promise<void> {
  // Stop any existing interval for this alarm
  stopCountdownNotification(alarmId);

  if (Platform.OS === 'web') return;

  // Present the initial notification immediately
  const presentAndUpdate = async () => {
    const now = Date.now();
    const secondsLeft = Math.max(0, Math.ceil((expiresAt - now) / 1000));
    const isUrgent = secondsLeft <= Math.ceil(timerDuration * 0.3);

    const title = isUrgent
      ? `⚠️ URGENTE: ${alarmName}`
      : `⏰ ${alarmName}`;

    const body = secondsLeft > 0
      ? `Emergência em ${formatCountdown(secondsLeft)} — Abra o app para desligar`
      : `🚨 Contatando emergência agora!`;

    try {
      // Dismiss the previous countdown notification before showing the new one
      const prevNotifId = countdownNotifIds.get(alarmId);
      if (prevNotifId) {
        try { await Notifications.dismissNotificationAsync(prevNotifId); } catch {}
      }

      // Schedule an immediate notification (seconds: 0 fires instantly)
      const notifId = await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          sound: undefined, // No sound on updates — only the initial alarm sound
          data: {
            alarmId,
            url: `/alarm-ring?alarmId=${alarmId}`,
            isCountdownUpdate: true,
          },
          priority: Notifications.AndroidNotificationPriority.HIGH,
          sticky: true,
        } as any,
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: 1,
          channelId: ALARM_CHANNEL_ID,
        } as any,
      });

      // Store the latest notification ID so we can dismiss it
      countdownNotifIds.set(alarmId, notifId);
    } catch (e) {
      // Silently ignore — notification updates are best-effort
    }

    // Stop interval when expired
    if (secondsLeft <= 0) {
      stopCountdownNotification(alarmId);
    }
  };

  // Present immediately, then update every second
  await presentAndUpdate();
  const handle = setInterval(presentAndUpdate, 1000);
  countdownIntervals.set(alarmId, handle);
}

/**
 * Stop the countdown notification interval and dismiss the notification.
 */
export function stopCountdownNotification(alarmId: string): void {
  const handle = countdownIntervals.get(alarmId);
  if (handle !== undefined) {
    clearInterval(handle);
    countdownIntervals.delete(alarmId);
  }

  // Dismiss the countdown notification
  const notifId = countdownNotifIds.get(alarmId);
  if (notifId) {
    Notifications.dismissNotificationAsync(notifId).catch(() => {});
    countdownNotifIds.delete(alarmId);
  }
}

/**
 * Stop all active countdown notifications (e.g., on app reset).
 */
export function stopAllCountdownNotifications(): void {
  for (const alarmId of countdownIntervals.keys()) {
    stopCountdownNotification(alarmId);
  }
}
