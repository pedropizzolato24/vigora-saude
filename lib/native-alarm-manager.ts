/**
 * native-alarm-manager.ts
 *
 * Wrapper around expo-alarm-module for real Android alarm scheduling.
 * Uses AlarmManager native API - fires even when the app is completely closed.
 *
 * Strategy:
 * - Android: use expo-alarm-module (AlarmManager + BroadcastReceiver)
 * - iOS/Web: fall back to expo-notifications (best effort)
 * - Both mechanisms are scheduled in parallel so the notification deep-link
 *   still works as a secondary trigger.
 */

import { Platform } from 'react-native';
import { Alarm } from './app-context';

// Lazy import to avoid crashing on web/iOS where the native module is not linked
let scheduleAlarmNative: ((alarm: any) => Promise<void>) | null = null;
let removeAlarmNative: ((uid: string) => Promise<void>) | null = null;
let removeAllAlarmsNative: (() => Promise<void>) | null = null;
let stopAlarmNative: (() => Promise<void>) | null = null;

if (Platform.OS === 'android') {
  try {
    const mod = require('expo-alarm-module');
    scheduleAlarmNative = mod.scheduleAlarm;
    removeAlarmNative = mod.removeAlarm;
    removeAllAlarmsNative = mod.removeAllAlarms;
    stopAlarmNative = mod.stopAlarm;
  } catch (e) {
    console.warn('[NativeAlarm] expo-alarm-module not available:', e);
  }
}

/**
 * Calculate the next trigger Date for an alarm given its time string (HH:MM).
 * If the time has already passed today, schedule for tomorrow.
 */
function getNextTriggerDate(timeStr: string): Date {
  const [hours, minutes] = timeStr.split(':').map(Number);
  const now = new Date();
  const trigger = new Date();
  trigger.setHours(hours, minutes, 0, 0);
  if (trigger <= now) {
    trigger.setDate(trigger.getDate() + 1);
  }
  return trigger;
}

/**
 * Get the next weekday trigger date.
 * weekday: 0=Mon, 1=Tue, ..., 6=Sun
 */
function getNextWeekdayDate(weekday: number, timeStr: string): Date {
  const [hours, minutes] = timeStr.split(':').map(Number);
  const now = new Date();
  // JS getDay(): 0=Sun, 1=Mon, ..., 6=Sat
  // Our weekday: 0=Mon, 1=Tue, ..., 6=Sun
  const jsDay = (weekday + 1) % 7; // convert our weekday to JS getDay()
  const today = now.getDay();
  let daysUntil = (jsDay - today + 7) % 7;
  if (daysUntil === 0) {
    // Same day - check if time has passed
    const trigger = new Date();
    trigger.setHours(hours, minutes, 0, 0);
    if (trigger <= now) daysUntil = 7;
  }
  const date = new Date();
  date.setDate(date.getDate() + daysUntil);
  date.setHours(hours, minutes, 0, 0);
  return date;
}

/**
 * Schedule a native alarm using expo-alarm-module.
 * Returns the uid(s) used so they can be stored and cancelled later.
 *
 * For repeating alarms, schedules one instance (the next occurrence).
 * expo-alarm-module handles re-scheduling via its repeating flag.
 */
export async function scheduleNativeAlarm(alarm: Alarm): Promise<string[]> {
  if (!scheduleAlarmNative || Platform.OS !== 'android') return [];

  const uids: string[] = [];

  try {
    // Passo 1.2: usar texto estático descritivo na notificação nativa.
    // NÃO usar countdown dinâmico aqui - é impossível sem Foreground Service.
    // O countdown é exibido apenas quando o app está em foreground (alarm-ring screen).
    const title = '⏰ Vigora - Alarme de Medicamento';
    const body = alarm.description
      ? `${alarm.description} - Toque para confirmar que tomou o medicamento`
      : 'Toque aqui para confirmar que tomou o medicamento';
    const baseUid = `vigora_${alarm.id}`;

    if (alarm.repeat === 'daily') {
      const day = getNextTriggerDate(alarm.time);
      await scheduleAlarmNative({
        uid: baseUid,
        day,
        title,
        description: body,
        active: true,
        repeating: true,
        showDismiss: true,
        showSnooze: true,
        snoozeInterval: 0,
        dismissText: 'Dispensar',
        snoozeText: 'Soneca',
      });
      uids.push(baseUid);

    } else if (alarm.repeat === 'weekdays') {
      // Mon–Fri: weekdays 0–4
      for (let wd = 0; wd <= 4; wd++) {
        const uid = `${baseUid}_wd${wd}`;
        const day = getNextWeekdayDate(wd, alarm.time);
      await scheduleAlarmNative({
        uid,
        day,
        title,
        description: body,
        active: true,
        repeating: true,
        showDismiss: true,
        showSnooze: true,
        snoozeInterval: 0,
        dismissText: 'Dispensar',
        snoozeText: 'Soneca',
      });
        uids.push(uid);
      }

    } else if (alarm.repeat === 'weekends') {
      // Sat(5) and Sun(6)
      for (const wd of [5, 6]) {
        const uid = `${baseUid}_wd${wd}`;
        const day = getNextWeekdayDate(wd, alarm.time);
        await scheduleAlarmNative({
          uid,
          day,
          title,
          description: body,
          active: true,
          repeating: true,
          showDismiss: true,
          showSnooze: true,
          snoozeInterval: 0,
          dismissText: 'Dispensar',
          snoozeText: 'Soneca',
        });
        uids.push(uid);
      }

    } else if (alarm.repeat === 'custom' && alarm.customDays && alarm.customDays.length > 0) {
      for (const wd of alarm.customDays) {
        const uid = `${baseUid}_wd${wd}`;
        const day = getNextWeekdayDate(wd, alarm.time);
        await scheduleAlarmNative({
          uid,
          day,
          title,
          description: body,
          active: true,
          repeating: true,
          showDismiss: true,
          showSnooze: true,
          snoozeInterval: 0,
          dismissText: 'Dispensar',
          snoozeText: 'Soneca',
        });
        uids.push(uid);
      }

    } else {
      // One-time alarm
      const day = getNextTriggerDate(alarm.time);
      await scheduleAlarmNative({
        uid: baseUid,
        day,
        title,
        description: body,
        active: true,
        repeating: false,
        showDismiss: true,
        showSnooze: true,
        snoozeInterval: 0,
        dismissText: 'Dispensar',
        snoozeText: 'Soneca',
      });
      uids.push(baseUid);
    }

    console.log(`[NativeAlarm] Scheduled ${uids.length} alarm(s) for: ${alarm.id}`);
  } catch (e) {
    console.error('[NativeAlarm] Error scheduling alarm:', e);
  }

  return uids;
}

/**
 * Re-agenda um disparo ÚNICO (soneca) em `fireAt`, sem mexer na recorrência do
 * alarme. Usa um uid próprio (`vigora_<id>_snooze`) — extraído de volta para o
 * alarmId pelos handlers de roteamento. O botão "Soneca" da notificação abre o
 * app via deep link (&snooze=1) e a soneca roda em alarm-ring — nunca o
 * SNOOZE_ACTION nativo, que deixaria o evento do DMS sem confirmação.
 */
export async function snoozeNativeAlarm(alarm: Alarm, fireAt: Date): Promise<void> {
  if (!scheduleAlarmNative || Platform.OS !== 'android') return;
  try {
    await scheduleAlarmNative({
      uid: `vigora_${alarm.id}_snooze`,
      day: fireAt,
      title: '⏰ Vigora - Alarme de Medicamento',
      description: alarm.description
        ? `${alarm.description} - Toque para confirmar que tomou o medicamento`
        : 'Toque aqui para confirmar que tomou o medicamento',
      active: true,
      repeating: false,
      showDismiss: true,
      showSnooze: true,
      snoozeInterval: 0,
      dismissText: 'Dispensar',
      snoozeText: 'Soneca',
    });
    console.log(`[NativeAlarm] Snoozed alarm ${alarm.id} until ${fireAt.toISOString()}`);
  } catch (e) {
    console.error('[NativeAlarm] Error snoozing alarm:', e);
  }
}

/**
 * Cancel native alarm(s) for a given alarm.
 * nativeUids: array of uids previously returned by scheduleNativeAlarm.
 */
export async function cancelNativeAlarm(nativeUids: string[]): Promise<void> {
  if (!removeAlarmNative || Platform.OS !== 'android') return;
  for (const uid of nativeUids) {
    try {
      await removeAlarmNative(uid);
      console.log(`[NativeAlarm] Cancelled alarm uid: ${uid}`);
    } catch (e) {
      console.warn(`[NativeAlarm] Error cancelling alarm ${uid}:`, e);
    }
  }
}

/**
 * Cancel all native alarms.
 */
export async function cancelAllNativeAlarms(): Promise<void> {
  if (!removeAllAlarmsNative || Platform.OS !== 'android') return;
  try {
    await removeAllAlarmsNative();
    console.log('[NativeAlarm] All native alarms cancelled');
  } catch (e) {
    console.warn('[NativeAlarm] Error cancelling all alarms:', e);
  }
}

/**
 * Stop the currently ringing native alarm (call from alarm-ring dismiss).
 */
export async function stopNativeAlarm(): Promise<void> {
  if (!stopAlarmNative || Platform.OS !== 'android') return;
  try {
    await stopAlarmNative();
    console.log('[NativeAlarm] Alarm stopped');
  } catch (e) {
    console.warn('[NativeAlarm] Error stopping alarm:', e);
  }
}

/** Whether native alarm module is available on this platform */
export const isNativeAlarmAvailable = Platform.OS === 'android' && scheduleAlarmNative !== null;
