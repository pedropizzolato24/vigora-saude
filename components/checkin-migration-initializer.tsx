/**
 * CheckinMigrationInitializer
 *
 * Roda a migração do check-in antigo para alarme uma vez por conta (monitorado),
 * depois que o estado local carregou. Ver lib/checkin-migration.ts.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect } from 'react';
import * as Auth from '@/lib/_core/auth';
import { scheduleFullAlarm } from '@/lib/alarm-sync';
import { generateId, useAppContext } from '@/lib/app-context';
import { migrateLegacyCheckin } from '@/lib/checkin-migration';

const DONE_KEY_PREFIX = 'vigora_checkin_migrated_v1:';

export function CheckinMigrationInitializer() {
  const { state, dispatch } = useAppContext();

  useEffect(() => {
    if (state.isLoading) return;
    (async () => {
      const user = await Auth.getUserInfo();
      // Cuidador não tem alarmes; sem login não há conta cujo estado migrar.
      if (!user?.openId || user.userType !== 'monitored') return;
      const doneKey = `${DONE_KEY_PREFIX}${user.openId}`;
      await migrateLegacyCheckin(
        { alarms: state.alarms, settings: state.settings },
        {
          isDone: async () => (await AsyncStorage.getItem(doneKey)) === '1',
          markDone: () => AsyncStorage.setItem(doneKey, '1'),
          scheduleAlarm: scheduleFullAlarm,
          addAlarm: (alarm) => dispatch({ type: 'ADD_ALARM', payload: alarm }),
          disableLegacy: () => dispatch({ type: 'UPDATE_SETTINGS', payload: { checkinEnabled: false } }),
          newId: generateId,
        }
      );
    })().catch((error) => console.warn('[CheckinMigration] falhou:', error));
    // Só quando o estado termina de carregar (inclusive na troca de conta).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.isLoading]);

  return null;
}
