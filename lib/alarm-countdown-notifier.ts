/**
 * alarm-countdown-notifier.ts
 *
 * Shows a countdown notification that updates every second using expo-notifications.
 *
 * Strategy (Android):
 * - Uses a DEDICATED countdown channel (vigora-countdown) with DEFAULT importance (no sound).
 * - Each second: dismisses the previous delivered notification, then schedules a new one
 *   immediately (trigger: null). This replaces the visible notification in the tray.
 * - The native expo-alarm-module notification (with "Dispensar" button) remains separate.
 * - When the alarm is dismissed, the countdown notification is cancelled.
 *
 * Key fixes vs previous implementation:
 * - cancelScheduledNotificationAsync only cancels PENDING (not yet delivered) notifications.
 *   dismissNotificationAsync is needed to remove DELIVERED notifications from the tray.
 * - The setNotificationHandler in notifications-utils.ts was suppressing countdown updates
 *   (shouldShowBanner: false for isCountdownUpdate). Fixed by using a separate channel and
 *   removing the isCountdownUpdate suppression.
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Map of alarmId → interval handle
const countdownIntervals = new Map<string, ReturnType<typeof setInterval>>();

// Fixed notification identifier prefix for countdown notifications
const COUNTDOWN_NOTIF_PREFIX = 'vigora_countdown_';

// Countdown channel ID — separate from alarm channel (no sound, DEFAULT importance)
export const COUNTDOWN_CHANNEL_ID = 'vigora-countdown';

function getCountdownNotifId(alarmId: string): string {
  return `${COUNTDOWN_NOTIF_PREFIX}${alarmId}`;
}

/**
 * Set up the countdown notification channel on Android.
 * Must be called once at app startup (in setupNotificationChannels).
 */
export async function setupCountdownChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync(COUNTDOWN_CHANNEL_ID, {
      name: 'Contagem Regressiva do Alarme',
      description: 'Mostra o tempo restante para contato de emergência quando um alarme dispara.',
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: undefined,
      enableVibrate: false,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      bypassDnd: false,
    });
  } catch {}
}

/**
 * Start a countdown notification that updates every second.
 * Dismisses the previous notification and schedules a new one each second.
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
      // Step 1: Dismiss the previously DELIVERED notification from the tray
      await Notifications.dismissNotificationAsync(notifId).catch(() => {});
      // Step 2: Cancel any pending scheduled notification with same id
      await Notifications.cancelScheduledNotificationAsync(notifId).catch(() => {});
      // Step 3: Schedule new notification immediately (trigger: null = show now)
      await Notifications.scheduleNotificationAsync({
        identifier: notifId,
        content: {
          title: alarmTitle,
          body,
          sound: false,
          priority: Notifications.AndroidNotificationPriority.DEFAULT,
          data: { alarmId, isCountdownUpdate: true },
          ...(Platform.OS === 'android' ? { channelId: COUNTDOWN_CHANNEL_ID } : {}),
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

  // Dismiss the countdown notification from the tray
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
