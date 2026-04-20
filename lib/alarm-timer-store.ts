/**
 * alarm-timer-store.ts
 *
 * Persists alarm timer start timestamps in AsyncStorage so that when the user
 * opens the app from a notification, the countdown timer is synchronized with
 * the actual elapsed time — not restarted from scratch.
 *
 * Key design:
 * - When an alarm fires, we store { alarmId, startedAt, expiresAt } in AsyncStorage.
 * - alarm-ring.tsx reads this on mount to compute `secondsLeft` from real elapsed time.
 * - When the alarm is dismissed, we clear the entry.
 * - The notification body is also updated every second via a series of scheduled
 *   notifications (see alarm-countdown-notifier.ts).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const TIMER_KEY_PREFIX = 'alarm_timer_';

export interface AlarmTimerEntry {
  alarmId: string;
  startedAt: number; // Unix ms when the alarm started ringing
  expiresAt: number; // Unix ms when escalation should fire
  timerDuration: number; // seconds (15 | 30 | 45 | 60)
}

/**
 * Save the timer entry when an alarm starts ringing.
 */
export async function saveAlarmTimer(entry: AlarmTimerEntry): Promise<void> {
  try {
    await AsyncStorage.setItem(
      `${TIMER_KEY_PREFIX}${entry.alarmId}`,
      JSON.stringify(entry)
    );
  } catch (e) {
    console.warn('[AlarmTimerStore] Failed to save timer entry:', e);
  }
}

/**
 * Load the timer entry for a given alarmId.
 * Returns null if not found or expired.
 */
export async function loadAlarmTimer(alarmId: string): Promise<AlarmTimerEntry | null> {
  try {
    const raw = await AsyncStorage.getItem(`${TIMER_KEY_PREFIX}${alarmId}`);
    if (!raw) return null;
    const entry: AlarmTimerEntry = JSON.parse(raw);
    // If already past expiry, treat as expired (return entry so UI can show escalated state)
    return entry;
  } catch (e) {
    console.warn('[AlarmTimerStore] Failed to load timer entry:', e);
    return null;
  }
}

/**
 * Remove the timer entry when alarm is dismissed.
 */
export async function clearAlarmTimer(alarmId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(`${TIMER_KEY_PREFIX}${alarmId}`);
  } catch (e) {
    console.warn('[AlarmTimerStore] Failed to clear timer entry:', e);
  }
}

/**
 * Compute how many seconds are left given a timer entry and the current time.
 * Returns 0 if already expired.
 */
export function computeSecondsLeft(entry: AlarmTimerEntry): number {
  const now = Date.now();
  const remaining = Math.ceil((entry.expiresAt - now) / 1000);
  return Math.max(0, remaining);
}
