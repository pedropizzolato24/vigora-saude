/**
 * alarm-sync.ts
 *
 * Dual-layer alarm scheduling:
 * 1. expo-alarm-module (Android AlarmManager) - fires even with app closed
 * 2. expo-notifications (fallback + deep-link trigger) - handles navigation
 *
 * Both are scheduled in parallel. The AlarmManager is the primary audio source;
 * the notification is the secondary trigger that opens the alarm-ring screen.
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import * as Auth from '@/lib/_core/auth';
import { Alarm } from './app-context';
import {
  scheduleAlarmNotification,
  cancelAlarmNotification,
} from './notifications-utils';
import {
  scheduleNativeAlarm,
  cancelNativeAlarm,
  cancelAllNativeAlarms,
  isNativeAlarmAvailable,
} from './native-alarm-manager';

/**
 * Schedule both a native alarm (Android) and a notification for an alarm.
 * Returns the updated alarm with notificationId and nativeAlarmUids populated.
 *
 * LANÇA se o sistema não aceitou o agendamento. Antes devolvia o alarme do
 * mesmo jeito — sem notificationId, sem uid, sem sinal nenhum — e a tela
 * anunciava "Alarme criado" para um alarme que não existia. Foi isso que
 * escondeu o bug do iOS por três rodadas de teste no aparelho. Quem chama
 * PRECISA avisar o usuário: um alarme de remédio que não vai tocar não pode
 * ser uma falha silenciosa.
 *
 * Strategy:
 * - Android: use expo-alarm-module ONLY. It creates its own notification with
 *   static title/body (set in native-alarm-manager.ts). Adding expo-notifications
 *   on top creates a DUPLICATE notification - removed per Passo 1.1.
 * - iOS/Web: use expo-notifications only (no native alarm module available).
 */
export async function scheduleFullAlarm(alarm: Alarm): Promise<Alarm> {
  const updated = { ...alarm };

  // 1. Schedule native alarm (Android AlarmManager) - NO expo-notifications on Android
  if (isNativeAlarmAvailable) {
    const uids = await scheduleNativeAlarm(alarm);
    if (uids.length === 0) {
      throw new Error(
        `Alarme ${alarm.id}: o sistema não aceitou nenhum agendamento nativo`,
      );
    }
    updated.nativeAlarmUids = uids;
    // Do NOT schedule expo-notifications here - it creates a duplicate notification.
    // The native alarm module creates its own notification with the static text
    // defined in native-alarm-manager.ts.
    return updated;
  }

  // 2. iOS/Web fallback: schedule via expo-notifications
  const notificationId = await scheduleAlarmNotification(alarm);
  if (!notificationId) {
    throw new Error(
      `Alarme ${alarm.id}: o sistema não aceitou o agendamento da notificação`,
    );
  }
  updated.notificationId = notificationId;

  return updated;
}

/**
 * Cancel both native alarm and notification for an alarm.
 */
export async function cancelFullAlarm(alarm: Alarm): Promise<void> {
  // Cancel native alarm
  if (isNativeAlarmAvailable && alarm.nativeAlarmUids && alarm.nativeAlarmUids.length > 0) {
    await cancelNativeAlarm(alarm.nativeAlarmUids);
  }

  // Cancel notification
  if (alarm.notificationId) {
    await cancelAlarmNotification(alarm.notificationId);
  }
}

/**
 * Sync alarms on app startup - reschedule any missing alarms.
 * This ensures alarms survive app crash, device restart, etc.
 */
export async function syncAlarmsOnStartup(alarms: Alarm[]): Promise<void> {
  try {
    // Defesa em profundidade: alarme pertence a uma conta. Sem conta logada não
    // se agenda nada — um aparelho deslogado chegou a tocar o alarme da última
    // conta que o usou. A causa primária (estado carregado sem conta) foi
    // corrigida em app-state-storage, mas agendar alarme é o caminho mais
    // crítico do app e não deve depender de outra camada ter acertado.
    const user = await Auth.getUserInfo().catch(() => null);
    if (!user) {
      console.log('[Alarm Sync] Sem conta logada — nada a agendar');
      return;
    }

    // Get all scheduled notifications to check which are missing
    const scheduledNotifications = Platform.OS !== 'web'
      ? await Notifications.getAllScheduledNotificationsAsync()
      : [];
    const scheduledIds = new Set(scheduledNotifications.map(n => n.identifier));

    console.log(`[Alarm Sync] Found ${alarms.length} alarms, ${scheduledIds.size} scheduled notifications`);

    for (const alarm of alarms) {
      if (!alarm.enabled) {
        // Cancel any lingering scheduled items for disabled alarms
        if (alarm.notificationId && scheduledIds.has(alarm.notificationId)) {
          await cancelAlarmNotification(alarm.notificationId);
        }
        continue;
      }

      // Android: (re)agenda o alarme nativo — idempotente (uids determinísticos
      // vigora_<id>[_wd<n>], e o cálculo do disparo é sempre a PRÓXIMA ocorrência
      // futura). Necessário desde o cancelamento na troca de conta: o AlarmManager
      // não guarda mais os alarmes de uma conta deslogada, então quem loga de
      // volta (ou restaura do cloud após reinstalar) precisa deles reagendados aqui.
      if (isNativeAlarmAvailable) {
        console.log(`[Alarm Sync] Android: (re)scheduling native alarm for ${alarm.id}`);
        try {
          await scheduleFullAlarm(alarm);
        } catch (error) {
          console.error(`[Alarm Sync] Failed to reschedule native alarm ${alarm.id}:`, error);
        }
        continue;
      }

      // iOS/Web: Check if notification is missing
      const notificationMissing = !alarm.notificationId || !scheduledIds.has(alarm.notificationId);

      if (notificationMissing) {
        console.log(`[Alarm Sync] Rescheduling alarm: ${alarm.id}`);
        try {
          await scheduleFullAlarm(alarm);
        } catch (error) {
          console.error(`[Alarm Sync] Failed to reschedule alarm ${alarm.id}:`, error);
        }
      } else {
        console.log(`[Alarm Sync] Alarm ${alarm.id} is properly scheduled`);
      }
    }

    console.log('[Alarm Sync] Sync completed');
  } catch (error) {
    console.error('[Alarm Sync] Error during alarm sync:', error);
  }
}

/**
 * Cancel all alarms (native + notifications). Chamado na troca de conta
 * (login/logout): os alarmes agendados pertencem à conta que sai — sem isso,
 * o alarme do monitorado continua tocando para quem logar depois no aparelho.
 */
export async function cancelAllAlarms(): Promise<void> {
  // Cancel all native alarms at once
  if (isNativeAlarmAvailable) {
    await cancelAllNativeAlarms();
  }

  // Cancel all notifications
  if (Platform.OS !== 'web') {
    await Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});
  }
}
