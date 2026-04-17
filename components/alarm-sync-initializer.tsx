import { useEffect } from 'react';
import { useAppContext } from '@/lib/app-context';
import { syncAlarmsOnStartup } from '@/lib/alarm-sync';

/**
 * Component that syncs alarms on app startup
 * Reschedules any lost notifications for enabled alarms
 * Should be placed inside AppProvider in the component tree
 */
export function AlarmSyncInitializer() {
  const { state, dispatch } = useAppContext();

  useEffect(() => {
    // Run alarm sync on app startup
    const initializeAlarms = async () => {
      try {
        console.log('[AlarmSyncInitializer] Starting alarm sync on app startup');
        
        // Create a copy of alarms to track which ones need updating
        const alarmsToUpdate = [...state.alarms];
        
        // Sync alarms and get updated list
        await syncAlarmsOnStartup(alarmsToUpdate);
        
        // Dispatch updates for any alarms that got new notification IDs
        for (let i = 0; i < alarmsToUpdate.length; i++) {
          const originalAlarm = state.alarms[i];
          const updatedAlarm = alarmsToUpdate[i];
          
          // If notification ID changed, update the alarm in state
          if (originalAlarm.notificationId !== updatedAlarm.notificationId) {
            console.log(`[AlarmSyncInitializer] Updating alarm ${updatedAlarm.id} with new notification ID`);
            dispatch({ type: 'UPDATE_ALARM', payload: updatedAlarm });
          }
        }
        
        console.log('[AlarmSyncInitializer] Alarm sync completed');
      } catch (error) {
        console.error('[AlarmSyncInitializer] Error during alarm sync:', error);
      }
    };

    // Only run sync if we have alarms
    if (state.alarms.length > 0) {
      initializeAlarms();
    }
  }, []); // Run only once on mount

  return null; // This component doesn't render anything
}
