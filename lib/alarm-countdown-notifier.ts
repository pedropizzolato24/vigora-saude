/**
 * alarm-countdown-notifier.ts
 *
 * Replaces the original alarm notification with an updated version that shows
 * a live countdown timer. Instead of creating a second notification, we:
 *
 * 1. Dismiss the original alarm notification (by its ID).
 * 2. Schedule a new notification with the countdown body and the same alarmId
 *    data (so tapping it still navigates to alarm-ring).
 * 3. Repeat every second until the alarm is dismissed or the timer expires.
 *
 * This ensures only ONE notification is visible at any time, the countdown
 * is always up-to-date, and tapping the notification navigates correctly.
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { ALARM_CHANNEL_ID } from './notifications-utils';

// Map of alarmId → interval handle
const countdownIntervals = new Map<string, ReturnType<typeof setInterval>>();
// Map of alarmId → current notification identifier
const countdownNotifIds = new Map<string, string>();

/**
 * Format seconds as MM:SS or Ns.
 */
function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m > 0) return `${m}:${s.toString().padStart(2, '0')}`;
  return `${s}s`;
}

/**
 * Start the countdown notification loop. Call this right after the alarm fires.
 *
 * @param alarmId - The alarm ID
 * @param alarmName - Display name of the alarm/medication
 * @param expiresAt - Unix ms when escalation fires
 * @param timerDuration - Total timer duration in seconds
 * @param originalNotifId - The notification ID of the original alarm notification to dismiss
 */
export async function startCountdownNotification(
  alarmId: string,
  alarmName: string,
  expiresAt: number,
  timerDuration: number,
  originalNotifId?: string
): Promise<void> {
  // Stop any existing interval for this alarm
  stopCountdownNotification(alarmId);

  if (Platform.OS === 'web') return;

  // Dismiss the original alarm notification so we don't have duplicates
  if (originalNotifId) {
    try {
      await Notifications.dismissNotificationAsync(originalNotifId);
    } catch {}
  }

  // Also dismiss all currently presented notifications for this alarm
  try {
    const presented = await Notifications.getPresentedNotificationsAsync();
    for (const notif of presented) {
      if (notif.request.content.data?.alarmId === alarmId) {
        try {
          await Notifications.dismissNotificationAsync(notif.request.identifier);
        } catch {}
      }
    }
  } catch {}

  const updateNotification = async () => {
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
      // Dismiss the previous countdown notification
      const prevNotifId = countdownNotifIds.get(alarmId);
      if (prevNotifId) {
        try { await Notifications.dismissNotificationAsync(prevNotifId); } catch {}
      }

      // Schedule an immediate replacement notification
      // NOTE: No isCountdownUpdate flag — this is the ONLY notification for this alarm.
      // Tapping it will navigate to alarm-ring because it has alarmId in data.
      const notifId = await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          sound: undefined, // Silent — the alarm sound is already playing in-app
          data: {
            alarmId,
            url: `/alarm-ring?alarmId=${alarmId}`,
            isCountdownUpdate: true, // Used internally to suppress foreground alert/sound
          },
          priority: Notifications.AndroidNotificationPriority.HIGH,
          sticky: true,
        } as any,
        trigger: null, // Immediate — shows right now
      });

      countdownNotifIds.set(alarmId, notifId);
    } catch (e) {
      // Best-effort — don't crash the alarm flow
    }

    // Stop interval when expired
    if (secondsLeft <= 0) {
      stopCountdownNotification(alarmId);
    }
  };

  // Show first update immediately, then every second
  await updateNotification();
  const handle = setInterval(updateNotification, 1000);
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
 * Stop all active countdown notifications.
 */
export function stopAllCountdownNotifications(): void {
  for (const alarmId of countdownIntervals.keys()) {
    stopCountdownNotification(alarmId);
  }
}
