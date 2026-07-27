import { useEffect, useRef } from 'react';
import { useAppContext } from '@/lib/app-context';
import { syncAlarmsOnStartup } from '@/lib/alarm-sync';

/**
 * Component that syncs alarms with the OS scheduler.
 * Reschedules any lost notifications/native alarms for enabled alarms.
 * Should be placed inside AppProvider in the component tree.
 *
 * Roda sempre que o conjunto de alarmes habilitados da conta carregada muda —
 * cobre o boot, a troca de conta (os alarmes da conta anterior são cancelados
 * no AppProvider; os da conta que entra precisam ser reagendados) e a
 * restauração do cloud após reinstalar. O reagendamento é idempotente
 * (uids determinísticos), então rodar de novo não duplica nada.
 */
export function AlarmSyncInitializer() {
  const { state, dispatch } = useAppContext();

  // Assinatura do conjunto de alarmes habilitados: id + campos que afetam o
  // agendamento. null enquanto o blob da conta ainda carrega.
  const signature = state.isLoading
    ? null
    : state.alarms
        .filter((a) => a.enabled)
        .map((a) => `${a.id}|${a.time}|${a.repeat}|${(a.customDays ?? []).join(',')}`)
        .join(';');
  const lastSignatureRef = useRef<string | null>(null);

  useEffect(() => {
    if (signature === null || signature === lastSignatureRef.current) return;
    lastSignatureRef.current = signature;

    const initializeAlarms = async () => {
      try {
        console.log('[AlarmSyncInitializer] Starting alarm sync');

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

    if (state.alarms.length > 0) {
      initializeAlarms();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  return null; // This component doesn't render anything
}
