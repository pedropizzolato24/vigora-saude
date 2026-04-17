import * as Notifications from 'expo-notifications';
import { Alarm } from './app-context';
import { scheduleAlarmNotification, cancelAlarmNotification } from './notifications-utils';

/**
 * Sync alarms on app startup - reschedule any lost notifications
 * This ensures alarms continue to work even after app crash or device restart
 */
export async function syncAlarmsOnStartup(alarms: Alarm[]): Promise<void> {
  try {
    // Get all scheduled notifications
    const scheduledNotifications = await Notifications.getAllScheduledNotificationsAsync();
    const scheduledIds = new Set(scheduledNotifications.map(n => n.identifier));

    console.log(`[Alarm Sync] Found ${alarms.length} alarms, ${scheduledIds.size} scheduled notifications`);

    for (const alarm of alarms) {
      // Skip disabled alarms
      if (!alarm.enabled) {
        // Cancel notification if it exists for disabled alarm
        if (alarm.notificationId && scheduledIds.has(alarm.notificationId)) {
          await cancelAlarmNotification(alarm.notificationId);
          console.log(`[Alarm Sync] Cancelled notification for disabled alarm: ${alarm.id}`);
        }
        continue;
      }

      // Check if alarm's notification is still scheduled
      const isScheduled = alarm.notificationId && scheduledIds.has(alarm.notificationId);

      if (!isScheduled) {
        // Notification is missing - reschedule it
        console.log(`[Alarm Sync] Rescheduling missing notification for alarm: ${alarm.id}`);
        try {
          const newNotificationId = await scheduleAlarmNotification(alarm);
          if (newNotificationId) {
            // Update alarm with new notification ID
            // Note: This is returned to the caller to dispatch UPDATE_ALARM action
            alarm.notificationId = newNotificationId;
          }
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
 * Get alarms that need rescheduling
 * Returns array of alarms with missing or invalid notification IDs
 */
export async function getAlarmsNeedingSync(alarms: Alarm[]): Promise<Alarm[]> {
  try {
    const scheduledNotifications = await Notifications.getAllScheduledNotificationsAsync();
    const scheduledIds = new Set(scheduledNotifications.map(n => n.identifier));

    const alarmsToSync = alarms.filter(alarm => {
      // Include enabled alarms that don't have a scheduled notification
      if (!alarm.enabled) return false;
      if (!alarm.notificationId) return true;
      return !scheduledIds.has(alarm.notificationId);
    });

    return alarmsToSync;
  } catch (error) {
    console.error('[Alarm Sync] Error getting alarms needing sync:', error);
    return [];
  }
}
