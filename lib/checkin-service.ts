/**
 * checkin-service.ts
 *
 * Serviço de check-in diário "Você está bem?".
 *
 * Fluxo:
 * 1. scheduleCheckin() agenda duas notificações:
 *    - Prompt diário recorrente (DAILY trigger) → abre /checkin-response
 *    - Timeout one-shot (DATE trigger, checkinTime + windowMinutes) → escalona se não respondido
 * 2. Usuário toca "Estou Bem" → markCheckinResponded() cancela o timeout e reagenda para amanhã
 * 3. Se não responder → notificação de timeout dispara; _layout.tsx a intercepta e escalona
 *
 * IDs de notificação persistidos em AsyncStorage:
 *   vigora_checkin_prompt_id  — ID do prompt diário
 *   vigora_checkin_timeout_id — ID do timeout one-shot
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { CHECKIN_CHANNEL_ID } from './notification-constants';
import { createPendingAlarmEvent } from './monitoring-service';

const PROMPT_ID_KEY = 'vigora_checkin_prompt_id';
const TIMEOUT_ID_KEY = 'vigora_checkin_timeout_id';

// ---------------------------------------------------------------------------
// Funções puras (testáveis sem mocks)
// ---------------------------------------------------------------------------

/**
 * Calcula a data/hora do próximo timeout:
 * checkinTime + windowMinutes. Se já passou, avança para amanhã.
 */
export function computeTimeoutDate(
  checkinTime: string,
  windowMinutes: number,
  now: Date = new Date()
): Date {
  const [h, m] = checkinTime.split(':').map(Number);
  const totalMinutes = h * 60 + m + windowMinutes;
  const timeoutHour = Math.floor(totalMinutes / 60) % 24;
  const timeoutMinute = totalMinutes % 60;

  const result = new Date(now);
  result.setHours(timeoutHour, timeoutMinute, 0, 0);

  // Se o timeout já passou hoje, agenda para amanhã
  if (result <= now) {
    result.setDate(result.getDate() + 1);
  }
  return result;
}

/**
 * Formata segundos restantes em "MM:SS" para o countdown.
 */
export function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Funções de agendamento (dependem de expo-notifications + AsyncStorage)
// ---------------------------------------------------------------------------

/**
 * Agenda (ou reagenda) o check-in diário.
 * Cancela qualquer agendamento anterior antes de criar os novos.
 */
export async function scheduleCheckin(
  checkinTime: string,
  windowMinutes: number
): Promise<void> {
  if (Platform.OS === 'web') return;

  try {
    await cancelCheckin();

    const [hours, minutes] = checkinTime.split(':').map(Number);

    // 1. Notificação-prompt diária recorrente
    const promptId = await Notifications.scheduleNotificationAsync({
      content: {
        title: '💚 Como você está?',
        body: 'Toque para confirmar que está tudo bem 🌿',
        color: '#2E7D32',
        data: {
          type: 'checkin_prompt',
          url: '/checkin-response',
          checkinTime,
          windowMinutes,
        },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: hours,
        minute: minutes,
        channelId: CHECKIN_CHANNEL_ID,
      } as any,
    });
    await AsyncStorage.setItem(PROMPT_ID_KEY, promptId);

    // 2. Timeout one-shot para hoje (ou amanhã se já passou)
    await scheduleTimeoutNotification(checkinTime, windowMinutes);
  } catch (error) {
    console.error('[Checkin] scheduleCheckin failed:', error);
  }
}

/**
 * Cancela prompt e timeout do check-in.
 */
export async function cancelCheckin(): Promise<void> {
  if (Platform.OS === 'web') return;

  const [promptId, timeoutId] = await Promise.all([
    AsyncStorage.getItem(PROMPT_ID_KEY),
    AsyncStorage.getItem(TIMEOUT_ID_KEY),
  ]);

  await Promise.all([
    promptId
      ? Notifications.cancelScheduledNotificationAsync(promptId).catch(() => {})
      : Promise.resolve(),
    timeoutId
      ? Notifications.cancelScheduledNotificationAsync(timeoutId).catch(() => {})
      : Promise.resolve(),
    AsyncStorage.multiRemove([PROMPT_ID_KEY, TIMEOUT_ID_KEY]),
  ]);
}

/**
 * Marca o check-in como respondido:
 * - Cancela o timeout de hoje
 * - Reagenda o timeout para amanhã
 *
 * Chamar quando o usuário tocar "Estou Bem".
 */
export async function markCheckinResponded(
  checkinTime: string,
  windowMinutes: number
): Promise<void> {
  if (Platform.OS === 'web') return;

  try {
    // Cancela o timeout de hoje
    const timeoutId = await AsyncStorage.getItem(TIMEOUT_ID_KEY);
    if (timeoutId) {
      await Notifications.cancelScheduledNotificationAsync(timeoutId).catch(() => {});
      await AsyncStorage.removeItem(TIMEOUT_ID_KEY);
    }

    // Reagenda o timeout para amanhã (o prompt diário continua ativo)
    await scheduleTimeoutNotification(checkinTime, windowMinutes);
  } catch (error) {
    console.error('[Checkin] markCheckinResponded failed:', error);
  }
}

/**
 * Registra o próximo evento de check-in como pending no servidor.
 * scheduledAt = checkinTime + windowMinutes (o deadline, não o horário de início),
 * para que GRACE_PERIOD_MINUTES no servidor só expire após o prazo do usuário.
 *
 * Chamado em três pontos: enable no settings, confirmação do usuário,
 * e timeout (para reagendar o de amanhã mesmo quando hoje foi perdido).
 * createAlarmEvent é idempotente: chamadas duplicadas para o mesmo deadline não duplicam eventos.
 */
export async function createNextCheckinEvent(
  checkinTime: string,
  windowMinutes: number
): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const scheduledAt = computeTimeoutDate(checkinTime, windowMinutes);
    await createPendingAlarmEvent(
      { id: 'checkin-daily', time: checkinTime, description: 'Check-in diário', enabled: true, repeat: 'daily', customDays: [] } as any,
      scheduledAt
    );
  } catch (error) {
    console.error('[Checkin] createNextCheckinEvent failed:', error);
  }
}

/**
 * Interno: agenda a notificação de timeout one-shot.
 */
async function scheduleTimeoutNotification(
  checkinTime: string,
  windowMinutes: number
): Promise<void> {
  const timeoutDate = computeTimeoutDate(checkinTime, windowMinutes);

  const timeoutId = await Notifications.scheduleNotificationAsync({
    content: {
      title: '⚠️ Check-in não respondido',
      body: 'Você não confirmou seu check-in. Seus contatos de emergência serão notificados.',
      sound: true,
      data: {
        type: 'checkin_timeout',
        checkinTime,
        windowMinutes,
      },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: timeoutDate,
      channelId: CHECKIN_CHANNEL_ID,
    } as any,
  });
  await AsyncStorage.setItem(TIMEOUT_ID_KEY, timeoutId);
}
