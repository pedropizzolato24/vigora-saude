/**
 * legacy-checkin-cancel.ts
 *
 * Cancela o que o check-in ANTIGO (notificações `checkin_prompt` /
 * `checkin_timeout`) deixou agendado no aparelho. O sistema antigo foi removido,
 * então nada mais as reagenda nem as trata: se sobrarem, o idoso recebe um
 * "Como você está?" que não leva a lugar nenhum. Chamado pela migração.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const PROMPT_ID_KEY = 'vigora_checkin_prompt_id';
const TIMEOUT_ID_KEY = 'vigora_checkin_timeout_id';

export async function cancelLegacyCheckinNotifications(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const [scheduled, promptId, timeoutId] = await Promise.all([
      Notifications.getAllScheduledNotificationsAsync(),
      AsyncStorage.getItem(PROMPT_ID_KEY),
      AsyncStorage.getItem(TIMEOUT_ID_KEY),
    ]);

    const idsToCancel = new Set<string>();
    if (promptId) idsToCancel.add(promptId);
    if (timeoutId) idsToCancel.add(timeoutId);
    for (const n of scheduled) {
      const type = n.content.data?.type;
      if (type === 'checkin_prompt' || type === 'checkin_timeout') idsToCancel.add(n.identifier);
    }

    await Promise.all([
      ...[...idsToCancel].map((id) =>
        Notifications.cancelScheduledNotificationAsync(id).catch((error) =>
          console.warn('[LegacyCheckin] não foi possível cancelar uma notificação antiga:', error)
        )
      ),
      AsyncStorage.multiRemove([PROMPT_ID_KEY, TIMEOUT_ID_KEY]),
    ]);
  } catch (error) {
    console.error('[LegacyCheckin] cancelar notificações do check-in antigo falhou:', error);
  }
}
