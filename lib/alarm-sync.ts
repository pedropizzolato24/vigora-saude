/**
 * alarm-sync.ts
 *
 * Dual-layer alarm scheduling:
 * 1. expo-alarm-module (Android AlarmManager) — fires even with app closed
 * 2. expo-notifications (fallback + deep-link trigger) — handles navigation
 *
 * Both are scheduled in parallel. The AlarmManager is the primary audio source;
 * the notification is the secondary trigger that opens the alarm-ring screen.
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { Alarm } from './app-context';
import {
  scheduleAlarmNotification,
  cancelAlarmNotification,
} from './notifications-utils';
import {
  scheduleNativeAlarm,
  cancelNativeAlarm,
  cancelAllNativeAlarms,
  isNativeAlarmAvailable,
} from './native-alarm-manager';

/**
 * Schedule both a native alarm (Android) and a notification for an alarm.
 * Returns the updated alarm with notificationId and nativeAlarmUids populated.
 */
export async function scheduleFullAlarm(alarm: Alarm): Promise<Alarm> {
  const updated = { ...alarm };

  // 1. Schedule native alarm (Android AlarmManager)
  if (isNativeAlarmAvailable) {
    const uids = await scheduleNativeAlarm(alarm);
    updated.nativeAlarmUids = uids;
  }

  // 2. Schedule notification (for deep-link navigation to alarm-ring screen)
  const notificationId = await scheduleAlarmNotification(alarm);
  if (notificationId) {
    updated.notificationId = notificationId;
  }

  return updated;
}

/**
 * Cancel both native alarm and notification for an alarm.
 */
export async function cancelFullAlarm(alarm: Alarm): Promise<void> {
  // Cancel native alarm
  if (isNativeAlarmAvailable && alarm.nativeAlarmUids && alarm.nativeAlarmUids.length > 0) {
    await cancelNativeAlarm(alarm.nativeAlarmUids);
  }

  // Cancel notification
  if (alarm.notificationId) {
    await cancelAlarmNotification(alarm.notificationId);
  }
}

/**
 * Sync alarms on app startup — reschedule any missing alarms.
 * This ensures alarms survive app crash, device restart, etc.
 */
export async function syncAlarmsOnStartup(alarms: Alarm[]): Promise<void> {
  try {
    // Get all scheduled notifications to check which are missing
    const scheduledNotifications = Platform.OS !== 'web'
      ? await Notifications.getAllScheduledNotificationsAsync()
      : [];
    const scheduledIds = new Set(scheduledNotifications.map(n => n.identifier));

    console.log(`[Alarm Sync] Found ${alarms.length} alarms, ${scheduledIds.size} scheduled notifications`);

    for (const alarm of alarms) {
      if (!alarm.enabled) {
        // Cancel any lingering scheduled items for disabled alarms
        if (alarm.notificationId && scheduledIds.has(alarm.notificationId)) {
          await cancelAlarmNotification(alarm.notificationId);
        }
        continue;
      }

      // Check if notification is missing (native alarm may still be active)
      const notificationMissing = !alarm.notificationId || !scheduledIds.has(alarm.notificationId);

      if (notificationMissing) {
        console.log(`[Alarm Sync] Rescheduling alarm: ${alarm.id}`);
        try {
          await scheduleFullAlarm(alarm);
        } catch (error) {
          console.error(`[Alarm Sync] Failed to reschedule alarm ${alarm.id}:`, error);
        }
      } else {
        console.log(`[Alarm Sync] Alarm ${alarm.id} is properly scheduled`);
      }
    }

    console.log('[Alarm Sync] Sync completed');
  } catch (error) {
    console.error('[Alarm Sync] Error during alarm sync:', error);
  }
}

/**
 * Cancel all alarms (native + notifications).
 */
export async function cancelAllAlarms(alarms: Alarm[]): Promise<void> {
  // Cancel all native alarms at once
  if (isNativeAlarmAvailable) {
    await cancelAllNativeAlarms();
  }

  // Cancel all notifications
  await Notifications.cancelAllScheduledNotificationsAsync();
}

/**
 * Get alarms that need rescheduling (notification missing).
 */
export async function getAlarmsNeedingSync(alarms: Alarm[]): Promise<Alarm[]> {
  try {
    if (Platform.OS === 'web') return [];

    const scheduledNotifications = await Notifications.getAllScheduledNotificationsAsync();
    const scheduledIds = new Set(scheduledNotifications.map(n => n.identifier));

    return alarms.filter(alarm => {
      if (!alarm.enabled) return false;
      if (!alarm.notificationId) return true;
      return !scheduledIds.has(alarm.notificationId);
    });
  } catch (error) {
    console.error('[Alarm Sync] Error getting alarms needing sync:', error);
    return [];
  }
}
