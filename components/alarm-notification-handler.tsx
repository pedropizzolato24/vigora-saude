import React, { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { useAppContext } from '@/lib/app-context';
import { startAlarmTimeout, clearAlarmTimeout } from '@/lib/alarm-timeout-manager';

/**
 * Component that handles alarm notifications and manages timeout escalation
 * Should be placed inside AppProvider in the component tree
 */
export function AlarmNotificationHandler() {
  const { state } = useAppContext();

  useEffect(() => {
    // Set up notification received handler
    const subscription = Notifications.addNotificationReceivedListener((notification) => {
      const alarmId = notification.request.content.data?.alarmId;
      
      if (alarmId) {
        console.log(`[AlarmNotificationHandler] Alarm notification received: ${alarmId}`);
        
        // Find the alarm
        const alarm = state.alarms.find(a => a.id === alarmId);
        
        if (alarm && alarm.enabled) {
          // Start timeout for escalation
          startAlarmTimeout(alarm, state.emergencyContacts);
        }
      }
    });

    return () => subscription.remove();
  }, [state.alarms, state.emergencyContacts]);

  useEffect(() => {
    // Set up notification response handler (when user taps notification)
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const alarmId = response.notification.request.content.data?.alarmId as string | undefined;
      
      if (alarmId) {
        console.log(`[AlarmNotificationHandler] Alarm notification dismissed: ${alarmId}`);
        // Clear timeout when user responds to alarm
        clearAlarmTimeout(alarmId);
      }
    });

    return () => subscription.remove();
  }, []);

  return null; // This component doesn't render anything
}
