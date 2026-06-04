/**
 * checkin-service.ts
 *
 * Serviço de check-in diário "Você está bem?".
 *
 * Fluxo:
 * 1. scheduleCheckin() agenda duas notificações:
 *    - Prompt diário recorrente (DAILY trigger) → abre /checkin-response
 *    - Timeout one-shot (DATE trigger, checkinTime + windowMinutes) → escalona se não respondido
 * 2. Usuário toca "Estou Bem" → markCheckinResponded() cancela o timeout de hoje
 *    e reagenda o timeout para AMANHÃ (hoje já está satisfeito).
 * 3. Se não responder → notificação de timeout dispara; _layout.tsx a intercepta e escalona
 *
 * Invariantes:
 * - No máximo UM prompt e UM timeout agendados por vez.
 * - Todas as operações de agendamento rodam serializadas (withLock) para que
 *   cancelar-e-recriar seja atômico. Sem isso, chamadas concorrentes
 *   (settings.tsx + CheckinInitializer) duplicam/triplicam as notificações.
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
 * Calcula o timeout do PRÓXIMO check-in, usado após o usuário responder.
 *
 * markCheckinResponded só roda depois do prompt de hoje ter disparado
 * (todo chamador tem now >= checkinTime), então o check-in de hoje já está
 * satisfeito. O próximo timeout é sempre o de AMANHÃ: amanhã no horário do
 * check-in + a janela. Calcular o dia seguinte diretamente evita o bug de
 * "hoje + janela ainda no futuro" — que rearmava um timeout para hoje e
 * disparava "check-in não respondido" poucos minutos após a confirmação.
 */
export function computeNextTimeoutDate(
  checkinTime: string,
  windowMinutes: number,
  now: Date = new Date()
): Date {
  const [h, m] = checkinTime.split(':').map(Number);
  const base = new Date(now);
  base.setDate(base.getDate() + 1);
  base.setHours(h, m, 0, 0);
  return new Date(base.getTime() + windowMinutes * 60000);
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
// Serialização — torna cancelar-e-recriar atômico entre chamadas concorrentes.
// ---------------------------------------------------------------------------

let opChain: Promise<unknown> = Promise.resolve();

/** Enfileira fn para rodar após a operação anterior, evitando races de agendamento. */
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = opChain.then(fn, fn);
  opChain = run.catch(() => {});
  return run;
}

// ---------------------------------------------------------------------------
// Funções de agendamento (dependem de expo-notifications + AsyncStorage)
// ---------------------------------------------------------------------------

/**
 * Agenda (ou reagenda) o check-in diário.
 * Cancela qualquer agendamento anterior antes de criar os novos.
 */
export function scheduleCheckin(
  checkinTime: string,
  windowMinutes: number
): Promise<void> {
  if (Platform.OS === 'web') return Promise.resolve();
  return withLock(() => scheduleCheckinInternal(checkinTime, windowMinutes));
}

async function scheduleCheckinInternal(
  checkinTime: string,
  windowMinutes: number
): Promise<void> {
  try {
    await cancelCheckinInternal();

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
    await scheduleTimeoutNotification(
      checkinTime,
      windowMinutes,
      computeTimeoutDate(checkinTime, windowMinutes)
    );
  } catch (error) {
    console.error('[Checkin] scheduleCheckin failed:', error);
  }
}

/**
 * Cancela prompt e timeout do check-in.
 * Varre todas as notificações agendadas para garantir que não sobram órfãos
 * de sessões anteriores mesmo que o ID no AsyncStorage esteja desatualizado.
 */
export function cancelCheckin(): Promise<void> {
  if (Platform.OS === 'web') return Promise.resolve();
  return withLock(() => cancelCheckinInternal());
}

async function cancelCheckinInternal(): Promise<void> {
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
      if (type === 'checkin_prompt' || type === 'checkin_timeout') {
        idsToCancel.add(n.identifier);
      }
    }

    await Promise.all([
      ...[...idsToCancel].map(id =>
        Notifications.cancelScheduledNotificationAsync(id).catch(() => {})
      ),
      AsyncStorage.multiRemove([PROMPT_ID_KEY, TIMEOUT_ID_KEY]),
    ]);
  } catch (error) {
    console.error('[Checkin] cancelCheckin failed:', error);
  }
}

/**
 * Marca o check-in como respondido:
 * - Cancela TODOS os timeouts pendentes (mantém o prompt diário)
 * - Reagenda o timeout para AMANHÃ (hoje já está satisfeito)
 *
 * Chamar quando o usuário tocar "Estou Bem".
 */
export function markCheckinResponded(
  checkinTime: string,
  windowMinutes: number
): Promise<void> {
  if (Platform.OS === 'web') return Promise.resolve();
  return withLock(() => markCheckinRespondedInternal(checkinTime, windowMinutes));
}

async function markCheckinRespondedInternal(
  checkinTime: string,
  windowMinutes: number
): Promise<void> {
  try {
    // Cancela qualquer timeout de hoje (incluindo órfãos), mantendo o prompt diário.
    await cancelTimeoutNotifications();

    // Reagenda o timeout para amanhã — o check-in de hoje já foi confirmado.
    await scheduleTimeoutNotification(
      checkinTime,
      windowMinutes,
      computeNextTimeoutDate(checkinTime, windowMinutes)
    );
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
 * Interno: cancela apenas as notificações de timeout (mantém o prompt diário).
 * Varre todas as agendadas para limpar órfãos além do ID persistido.
 */
async function cancelTimeoutNotifications(): Promise<void> {
  const [scheduled, timeoutId] = await Promise.all([
    Notifications.getAllScheduledNotificationsAsync(),
    AsyncStorage.getItem(TIMEOUT_ID_KEY),
  ]);

  const idsToCancel = new Set<string>();
  if (timeoutId) idsToCancel.add(timeoutId);
  for (const n of scheduled) {
    if (n.content.data?.type === 'checkin_timeout') {
      idsToCancel.add(n.identifier);
    }
  }

  await Promise.all([
    ...[...idsToCancel].map(id =>
      Notifications.cancelScheduledNotificationAsync(id).catch(() => {})
    ),
    AsyncStorage.removeItem(TIMEOUT_ID_KEY),
  ]);
}

/**
 * Interno: agenda a notificação de timeout one-shot na data informada.
 * Não cancela nada — o chamador é responsável por garantir o invariante
 * de um único timeout (cancelCheckinInternal / cancelTimeoutNotifications).
 */
async function scheduleTimeoutNotification(
  checkinTime: string,
  windowMinutes: number,
  when: Date
): Promise<void> {
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
      date: when,
      channelId: CHECKIN_CHANNEL_ID,
    } as any,
  });
  await AsyncStorage.setItem(TIMEOUT_ID_KEY, timeoutId);
}
