import { NativeModules, Platform } from 'react-native';

const LINKING_ERROR =
  `The package 'expo-alarm-countdown' doesn't seem to be linked. Make sure: \n\n` +
  Platform.select({ ios: "- You have run 'pod install'\n", default: '' }) +
  '- You rebuilt the app after installing the package\n' +
  '- You are not using Expo Go\n';

const ExpoAlarmCountdown = NativeModules.ExpoAlarmCountdown
  ? NativeModules.ExpoAlarmCountdown
  : new Proxy(
      {},
      {
        get() {
          throw new Error(LINKING_ERROR);
        },
      }
    );

/**
 * Updates the alarm notification text to show the current countdown.
 *
 * Android: Calls NotificationManager.notify(1, ...) with the same channel
 * as expo-alarm-module to update the foreground service notification in-place.
 *
 * iOS: Replaces the existing UNUserNotification with a new one using the
 * same identifier, updating the subtitle with the countdown text.
 *
 * @param title - The notification title (alarm name / medication name)
 * @param secondsLeft - Seconds remaining until escalation
 */
export function updateAlarmNotification(title: string, secondsLeft: number): void {
  if (Platform.OS === 'web') return;
  try {
    ExpoAlarmCountdown.updateAlarmNotification(title, secondsLeft);
  } catch (e) {
    // Silently fail - countdown in notification is a nice-to-have, not critical
    console.warn('[ExpoAlarmCountdown] updateAlarmNotification failed:', e);
  }
}

/**
 * Clears the countdown from the alarm notification, restoring the original text.
 * Call this when the alarm is dismissed.
 *
 * @param title - The notification title to restore
 */
export function clearAlarmNotification(title: string): void {
  if (Platform.OS === 'web') return;
  try {
    ExpoAlarmCountdown.clearAlarmNotification(title);
  } catch (e) {
    console.warn('[ExpoAlarmCountdown] clearAlarmNotification failed:', e);
  }
}

/**
 * Android 12+: whether the app holds the "Alarms & reminders" special access
 * (SCHEDULE_EXACT_ALARM). Always true on other platforms/versions.
 * Fail-open: returns true when the native module is unavailable (Expo Go).
 */
export async function canScheduleExactAlarms(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  try {
    return await ExpoAlarmCountdown.canScheduleExactAlarms();
  } catch {
    return true;
  }
}

/**
 * Android 12+: opens the system "Alarms & reminders" screen for this app.
 * No-op on other platforms/versions.
 */
export async function openExactAlarmSettings(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await ExpoAlarmCountdown.openExactAlarmSettings();
  } catch (e) {
    console.warn('[ExpoAlarmCountdown] openExactAlarmSettings failed:', e);
  }
}
