import * as Notifications from 'expo-notifications';
import { Alarm } from './app-context';

// Configure notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Schedule a notification for an alarm
 */
export async function scheduleAlarmNotification(alarm: Alarm): Promise<string | null> {
  try {
    // Parse time (HH:MM format)
    const [hours, minutes] = alarm.time.split(':').map(Number);
    
    // Create trigger for the next occurrence of this time
    const trigger = new Date();
    trigger.setHours(hours, minutes, 0, 0);
    
    // If the time has already passed today, schedule for tomorrow
    if (trigger < new Date()) {
      trigger.setDate(trigger.getDate() + 1);
    }
    
    // Handle repeat patterns
    if (alarm.repeat === 'daily') {
      // Schedule daily notification
      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Alarme: ' + alarm.description,
          body: alarm.description || 'Hora do seu alarme configurado',
          sound: alarm.sound ? 'default' : undefined,
          vibrate: alarm.vibration ? [0, 250, 250, 250] : undefined,
          data: { alarmId: alarm.id },
        },
        trigger: {
          type: 'daily',
          hour: hours,
          minute: minutes,
        } as any,
      });
      return notificationId;
    } else if (alarm.repeat === 'weekdays') {
      // Schedule for weekdays (Monday-Friday)
      const notificationIds: string[] = [];
      for (let day = 1; day <= 5; day++) {
        const id = await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Alarme: ' + alarm.description,
            body: alarm.description || 'Hora do seu alarme configurado',
            sound: alarm.sound ? 'default' : undefined,
            vibrate: alarm.vibration ? [0, 250, 250, 250] : undefined,
            data: { alarmId: alarm.id },
          },
          trigger: {
            type: 'weekly',
            weekday: day,
            hour: hours,
            minute: minutes,
          } as any,
        });
        notificationIds.push(id);
      }
      return notificationIds[0]; // Return first ID as reference
    } else if (alarm.repeat === 'weekends') {
      // Schedule for weekends (Saturday-Sunday)
      const notificationIds: string[] = [];
      for (const day of [6, 0]) {
        const id = await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Alarme: ' + alarm.description,
            body: alarm.description || 'Hora do seu alarme configurado',
            sound: alarm.sound ? 'default' : undefined,
            vibrate: alarm.vibration ? [0, 250, 250, 250] : undefined,
            data: { alarmId: alarm.id },
          },
          trigger: {
            type: 'weekly',
            weekday: day,
            hour: hours,
            minute: minutes,
          } as any,
        });
        notificationIds.push(id);
      }
      return notificationIds[0]; // Return first ID as reference
    } else {
      // One-time notification
      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Alarme: ' + alarm.description,
          body: alarm.description || 'Hora do seu alarme configurado',
          sound: alarm.sound ? 'default' : undefined,
          vibrate: alarm.vibration ? [0, 250, 250, 250] : undefined,
          data: { alarmId: alarm.id },
        },
        trigger: {
          type: 'date' as any,
          date: trigger,
        } as any,
      });
      return notificationId;
    }
  } catch (error) {
    console.error('Error scheduling alarm notification:', error);
    return null;
  }
}

/**
 * Cancel a scheduled notification
 */
export async function cancelAlarmNotification(notificationId: string): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  } catch (error) {
    console.error('Error canceling notification:', error);
  }
}

/**
 * Cancel all scheduled notifications
 */
export async function cancelAllNotifications(): Promise<void> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch (error) {
    console.error('Error canceling all notifications:', error);
  }
}
