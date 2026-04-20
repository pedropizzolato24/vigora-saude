/**
 * alarm-countdown-notifier.ts
 *
 * Updates the native alarm notification body every second to show a live countdown.
 *
 * Android strategy (expo-alarm-module available):
 * - Call updateAlarm() every second to update the alarm title/description with
 *   the remaining time. This updates the notification shown by the native module.
 *
 * iOS/Web fallback:
 * - No live countdown in notification (not supported by expo-notifications without
 *   Live Activities). The countdown is only visible inside the alarm-ring screen.
 */

import { Platform } from 'react-native';

// Map of alarmId → interval handle
const countdownIntervals = new Map<string, ReturnType<typeof setInterval>>();

// Lazy import of expo-alarm-module to avoid crashing on iOS/web
let updateAlarmNative: ((alarm: any) => Promise<void>) | null = null;
if (Platform.OS === 'android') {
  try {
    const mod = require('expo-alarm-module');
    updateAlarmNative = mod.updateAlarm;
  } catch {}
}

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
 * Start updating the native alarm notification every second with the countdown.
 *
 * @param alarmId - The alarm ID (used as the native alarm UID prefix)
 * @param alarmName - Display name of the alarm/medication
 * @param expiresAt - Unix ms when escalation fires
 * @param timerDuration - Total timer duration in seconds
 * @param nativeAlarmUids - UIDs of the native alarm(s) to update
 */
export async function startCountdownNotification(
  alarmId: string,
  alarmName: string,
  expiresAt: number,
  timerDuration: number,
  _originalNotifId?: string,
  nativeAlarmUids?: string[]
): Promise<void> {
  // Stop any existing interval for this alarm
  stopCountdownNotification(alarmId);

  // Only update native alarm notification on Android
  if (Platform.OS !== 'android' || !updateAlarmNative) return;

  const uids = nativeAlarmUids && nativeAlarmUids.length > 0
    ? nativeAlarmUids
    : [`vigora_${alarmId}`];

  const updateNativeAlarm = async () => {
    const now = Date.now();
    const secondsLeft = Math.max(0, Math.ceil((expiresAt - now) / 1000));
    const isUrgent = secondsLeft <= Math.ceil(timerDuration * 0.3);

    const title = isUrgent
      ? `⚠️ ${alarmName} — Emergência em ${formatCountdown(secondsLeft)}`
      : `⏰ ${alarmName} — Emergência em ${formatCountdown(secondsLeft)}`;

    const description = secondsLeft > 0
      ? `Abra o app para desligar o alarme`
      : `🚨 Contatando emergência agora!`;

    // Update all UIDs for this alarm (e.g., repeating alarms have multiple UIDs)
    for (const uid of uids) {
      try {
        await updateAlarmNative!({
          uid,
          title,
          description,
          // Keep the alarm active and preserve other settings
          active: true,
        });
      } catch {
        // Best-effort — don't crash the alarm flow
      }
    }

    // Stop interval when expired
    if (secondsLeft <= 0) {
      stopCountdownNotification(alarmId);
    }
  };

  // Update immediately, then every second
  await updateNativeAlarm();
  const handle = setInterval(updateNativeAlarm, 1000);
  countdownIntervals.set(alarmId, handle);
}

/**
 * Stop the countdown notification interval.
 */
export function stopCountdownNotification(alarmId: string): void {
  const handle = countdownIntervals.get(alarmId);
  if (handle !== undefined) {
    clearInterval(handle);
    countdownIntervals.delete(alarmId);
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
