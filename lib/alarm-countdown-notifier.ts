/**
 * alarm-countdown-notifier.ts
 *
 * Shows a countdown notification that updates every second using expo-notifications.
 *
 * Strategy:
 * - Uses a FIXED notification identifier per alarm so each scheduleNotificationAsync
 *   call REPLACES the previous notification with the same identifier.
 * - The native expo-alarm-module notification (with "Dispensar" button) remains
 *   separate — it fires the alarm sound and cannot be updated in real time.
 * - This countdown notification is a SECOND notification that shows the live timer.
 * - When the alarm is dismissed, both notifications are cancelled.
 *
 * NOTE: updateAlarm() from expo-alarm-module only reschedules the alarm — it does NOT
 * update the visible notification text. expo-notifications is the correct tool here.
 */

import * as Notifications from 'expo-notifications';

// Map of alarmId → interval handle
const countdownIntervals = new Map<string, ReturnType<typeof setInterval>>();

// Fixed notification identifier prefix for countdown notifications
const COUNTDOWN_NOTIF_PREFIX = 'vigora_countdown_';

function getCountdownNotifId(alarmId: string): string {
  return `${COUNTDOWN_NOTIF_PREFIX}${alarmId}`;
}

/**
 * Start a countdown notification that updates every second.
 * Uses a fixed identifier so each update replaces the previous notification.
 */
export async function startCountdownNotification(
  alarmId: string,
  alarmTitle: string,
  expiresAt: number,
  totalDuration: number,
): Promise<void> {
  // Stop any existing countdown for this alarm
  stopCountdownNotification(alarmId);

  const notifId = getCountdownNotifId(alarmId);

  const updateNotification = async () => {
    const secondsLeft = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
    const minutes = Math.floor(secondsLeft / 60);
    const secs = secondsLeft % 60;
    const timeStr = minutes > 0 ? `${minutes}m ${secs}s` : `${secondsLeft}s`;

    const isUrgent = secondsLeft <= Math.ceil(totalDuration * 0.3);
    const urgentPrefix = isUrgent ? '🚨 ' : '⏰ ';

    const body =
      secondsLeft > 0
        ? `${urgentPrefix}Emergência em ${timeStr} — Abra o app para desligar`
        : '🚨 Contatando emergência agora!';

    try {
      // Cancel previous countdown notification and schedule new one immediately.
      // Using the same identifier replaces the existing notification on Android.
      await Notifications.cancelScheduledNotificationAsync(notifId).catch(() => {});
      await Notifications.scheduleNotificationAsync({
        identifier: notifId,
        content: {
          title: alarmTitle,
          body,
          sound: false,
          priority: Notifications.AndroidNotificationPriority.HIGH,
          data: { alarmId, isCountdownUpdate: true },
        },
        trigger: null, // show immediately
      });
    } catch {
      // Best-effort — don't crash the alarm flow
    }

    if (secondsLeft <= 0) {
      stopCountdownNotification(alarmId);
    }
  };

  // Show immediately, then update every second
  await updateNotification();
  const interval = setInterval(updateNotification, 1000);
  countdownIntervals.set(alarmId, interval);
}

/**
 * Stop the countdown notification for a given alarm and dismiss it.
 */
export async function stopCountdownNotification(alarmId: string): Promise<void> {
  const interval = countdownIntervals.get(alarmId);
  if (interval !== undefined) {
    clearInterval(interval);
    countdownIntervals.delete(alarmId);
  }

  // Dismiss the countdown notification
  const notifId = getCountdownNotifId(alarmId);
  try {
    await Notifications.cancelScheduledNotificationAsync(notifId).catch(() => {});
    await Notifications.dismissNotificationAsync(notifId).catch(() => {});
  } catch {}
}

/**
 * Stop all active countdown notifications.
 */
export async function stopAllCountdownNotifications(): Promise<void> {
  for (const alarmId of [...countdownIntervals.keys()]) {
    await stopCountdownNotification(alarmId);
  }
}
