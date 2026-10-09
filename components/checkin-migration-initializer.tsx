/**
 * CheckinMigrationInitializer
 *
 * Roda a migração do check-in antigo para alarme (monitorado) sempre que o
 * estado SINCRONIZADO indica check-in antigo ligado: na carga inicial e quando
 * `checkinEnabled` muda (ex.: restauração da nuvem depois do boot).
 *
 * As notificações que o sistema antigo deixou agendadas são canceladas em TODA
 * carga, antes de qualquer porta (cuidador, sem login, flag desligada): elas
 * ficaram inertes e são do aparelho, não da conta.
 *
 * Se a migração falha (não agendou ou sem espaço), a flag continua ligada para
 * a próxima carga tentar de novo e o usuário é avisado, no máximo uma vez por
 * abertura do app: sem check-in ninguém é avisado se ele não responder.
 * Ver lib/checkin-migration.ts.
 */
import { router } from 'expo-router';
import { useEffect } from 'react';
import * as Auth from '@/lib/_core/auth';
import { AppDialog, useAppDialog } from '@/components/app-dialog';
import { scheduleFullAlarm } from '@/lib/alarm-sync';
import { useAppContext } from '@/lib/app-context';
import { migrateLegacyCheckin } from '@/lib/checkin-migration';
import { cancelLegacyCheckinNotifications } from '@/lib/legacy-checkin-cancel';

/** Um aviso por abertura do app (o módulo vive enquanto o processo vive). */
let failureDialogShown = false;

export function CheckinMigrationInitializer() {
  const { state, dispatch } = useAppContext();
  const { dialogProps, showDialog } = useAppDialog();

  useEffect(() => {
    if (state.isLoading) return;
    (async () => {
      const user = state.settings.checkinEnabled ? await Auth.getUserInfo() : null;
      // Cuidador não tem alarmes; sem login não há conta cujo estado migrar.
      // userType nulo conta como monitorado (como no resto do app).
      if (!state.settings.checkinEnabled || !user?.openId || user.userType === 'caregiver') {
        await cancelLegacyCheckinNotifications();
        return;
      }
      const outcome = await migrateLegacyCheckin(
        { alarms: state.alarms, settings: state.settings },
        {
          scheduleAlarm: scheduleFullAlarm,
          addAlarm: (alarm) => dispatch({ type: 'ADD_ALARM', payload: alarm }),
          disableLegacy: () => dispatch({ type: 'UPDATE_SETTINGS', payload: { checkinEnabled: false } }),
          cancelLegacyNotifications: cancelLegacyCheckinNotifications,
        }
      );
      if (outcome === 'failed' && !failureDialogShown) {
        failureDialogShown = true;
        showDialog({
          title: 'Não foi possível mover o seu check-in',
          message:
            'Abra a tela Check-in e crie o seu check-in diário de novo. Enquanto isso, ninguém será avisado se você não responder.',
          variant: 'warning',
          buttons: [
            { text: 'Agora não', style: 'cancel' },
            { text: 'Abrir Check-in', onPress: () => router.push('/(tabs)/checkin' as never) },
          ],
        });
      }
    })().catch((error) => console.warn('[CheckinMigration] falhou:', error));
    // Só reavalia na carga e quando checkinEnabled muda; alarmes/settings lidos são os atuais.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.isLoading, state.settings.checkinEnabled]);

  return <AppDialog {...dialogProps} />;
}
