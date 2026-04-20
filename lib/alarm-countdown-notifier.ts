/**
 * alarm-countdown-notifier.ts
 *
 * Shows a live countdown in the native alarm notification using the
 * expo-alarm-countdown native module.
 *
 * Architecture:
 * - Android: Calls NotificationManager.notify(1, ...) with the same channel
 *   ("expo-alarm-module") and ID (1) as expo-alarm-module, updating the
 *   foreground service notification text in-place every second.
 *
 * - iOS: Adds/replaces a UNNotificationRequest with identifier
 *   "vigora-alarm-countdown" each second, showing the countdown in the
 *   notification center (lock screen / notification tray).
 *
 * The native module is loaded lazily — if it's not available (Expo Go,
 * web, or module not yet linked), countdown silently falls back to
 * app-only display (alarm-ring screen still shows the countdown).
 */

import { Platform } from 'react-native';

// Lazy-load the native module to avoid crashing in Expo Go / web
let NativeCountdown: {
  updateAlarmNotification: (title: string, secondsLeft: number) => void;
  clearAlarmNotification: (title: string) => void;
} | null = null;

if (Platform.OS !== 'web') {
  try {
    NativeCountdown = require('expo-alarm-countdown');
  } catch {
    // Module not linked (Expo Go) — silent fallback
    console.log('[AlarmCountdown] expo-alarm-countdown not available — countdown in notification disabled');
  }
}

// Map of alarmId → interval handle
const countdownIntervals = new Map<string, ReturnType<typeof setInterval>>();

/**
 * Start a live countdown in the native alarm notification.
 * Updates every second until the alarm expires or is dismissed.
 *
 * @param alarmId - Unique alarm ID
 * @param alarmTitle - Alarm/medication name shown in notification title
 * @param expiresAt - Unix timestamp (ms) when the escalation timer expires
 */
export function startCountdownNotification(
  alarmId: string,
  alarmTitle: string,
  expiresAt: number,
): void {
  if (!NativeCountdown) return;

  // Stop any existing countdown for this alarm
  stopCountdownNotification(alarmId);

  const tick = () => {
    const secondsLeft = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));

    try {
      NativeCountdown!.updateAlarmNotification(alarmTitle, secondsLeft);
    } catch (e) {
      // Best-effort — don't crash the alarm flow
    }

    if (secondsLeft <= 0) {
      stopCountdownNotification(alarmId);
    }
  };

  // Show immediately, then update every second
  tick();
  const interval = setInterval(tick, 1000);
  countdownIntervals.set(alarmId, interval);
}

/**
 * Stop the countdown and restore the notification to its default state.
 * Call this when the alarm is dismissed.
 *
 * @param alarmId - Unique alarm ID
 * @param alarmTitle - Alarm/medication name (used to restore notification title)
 */
export function stopCountdownNotification(alarmId: string, alarmTitle?: string): void {
  const interval = countdownIntervals.get(alarmId);
  if (interval !== undefined) {
    clearInterval(interval);
    countdownIntervals.delete(alarmId);
  }

  if (NativeCountdown && alarmTitle) {
    try {
      NativeCountdown.clearAlarmNotification(alarmTitle);
    } catch {}
  }
}

/**
 * Stop all active countdown notifications.
 */
export function stopAllCountdownNotifications(): void {
  for (const alarmId of [...countdownIntervals.keys()]) {
    stopCountdownNotification(alarmId);
  }
}

// Keep setupCountdownChannel for backward compatibility (no-op now)
export async function setupCountdownChannel(): Promise<void> {}
export const COUNTDOWN_CHANNEL_ID = 'vigora-countdown';
