/**
 * CheckinMigrationInitializer
 *
 * Roda a migração do check-in antigo para alarme (monitorado) sempre que o
 * estado SINCRONIZADO indica check-in antigo ligado: na carga inicial e quando
 * `checkinEnabled` muda (ex.: restauração da nuvem depois do boot).
 * Ver lib/checkin-migration.ts.
 */
import { useEffect } from 'react';
import * as Auth from '@/lib/_core/auth';
import { scheduleFullAlarm } from '@/lib/alarm-sync';
import { useAppContext } from '@/lib/app-context';
import { migrateLegacyCheckin } from '@/lib/checkin-migration';

export function CheckinMigrationInitializer() {
  const { state, dispatch } = useAppContext();

  useEffect(() => {
    if (state.isLoading || !state.settings.checkinEnabled) return;
    (async () => {
      const user = await Auth.getUserInfo();
      // Cuidador não tem alarmes; sem login não há conta cujo estado migrar.
      // userType nulo conta como monitorado (como no resto do app).
      if (!user?.openId || user.userType === 'caregiver') return;
      await migrateLegacyCheckin(
        { alarms: state.alarms, settings: state.settings },
        {
          scheduleAlarm: scheduleFullAlarm,
          addAlarm: (alarm) => dispatch({ type: 'ADD_ALARM', payload: alarm }),
          disableLegacy: () => dispatch({ type: 'UPDATE_SETTINGS', payload: { checkinEnabled: false } }),
        }
      );
    })().catch((error) => console.warn('[CheckinMigration] falhou:', error));
    // Só reavalia na carga e quando checkinEnabled muda; alarmes/settings lidos são os atuais.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.isLoading, state.settings.checkinEnabled]);

  return null;
}
