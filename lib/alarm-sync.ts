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

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import * as Auth from '@/lib/_core/auth';
import { Alarm } from './app-context';
import {
  scheduleAlarmNotification,
  cancelScheduledAlarmNotifications,
} from './notifications-utils';
import {
  scheduleNativeAlarm,
  cancelNativeAlarm,
  cancelAllNativeAlarms,
  isNativeAlarmAvailable,
} from './native-alarm-manager';
import {
  isAlarmKitAvailable,
  scheduleAlarmKitAlarm,
  cancelAlarmKitAlarm,
} from './ios-alarm-kit';

/**
 * Versão do agendamento já gravado no sistema. Bump a cada correção que muda o
 * QUANDO um alarme dispara — o iOS só reagenda o que está faltando, e uma
 * notificação com o dia/horário errado conta como presente, então sem isso a
 * correção só chegaria em quem editasse o alarme na mão. Público de 60+ com
 * alarme de remédio não pode depender disso.
 *
 * 2 — convenção de dias da semana (customDays 0=Dom): todo dia escolhido
 *     disparava um dia depois.
 */
const SCHEDULE_VERSION = '2';
const SCHEDULE_VERSION_KEY = 'vigora:alarm-schedule-version';

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

  // 2. iOS 26+: AlarmKit é o alarme de verdade — toca em loop e toma a tela,
  // em vez de uma notificação que soa uma vez e vira banner.
  if (isAlarmKitAvailable()) {
    await scheduleAlarmKitAlarm(alarm);
    // Migração: quem vinha do caminho antigo tem notificações agendadas para
    // este alarme. Sem cancelar, o remédio toca duas vezes.
    await cancelScheduledAlarmNotifications(alarm.id);
    updated.notificationId = undefined;
    return updated;
  }

  // 3. iOS <26 / AlarmKit indisponível: notificação com Critical Alerts.
  // Se havia alarme do AlarmKit (aparelho que perdeu a capacidade), sai antes.
  await cancelAlarmKitAlarm(alarm.id);
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

  // Os dois caminhos, sempre: o alarme pode ter sido agendado por um deles e
  // cancelado depois de o aparelho mudar de capacidade.
  await cancelAlarmKitAlarm(alarm.id);

  // Por alarmId, não pelo id guardado: repeat weekdays/weekends/custom agenda
  // 5/2/N requests e só o primeiro id é persistido. Cancelar só esse deixava
  // as outras vivas para sempre, acumulando a cada edição.
  await cancelScheduledAlarmNotifications(alarm.id);
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

    // Correção de agendamento mais nova que o que está no sistema? Reagenda
    // tudo uma vez. Falha de leitura força o reagendamento (o caminho seguro:
    // reagendar à toa custa uma notificação, não reagendar mantém o alarme
    // errado tocando).
    const versaoGravada = await AsyncStorage.getItem(SCHEDULE_VERSION_KEY).catch(
      (error) => {
        console.warn('[Alarm Sync] versão de agendamento ilegível:', error);
        return null;
      }
    );
    const forcarReagendamento = versaoGravada !== SCHEDULE_VERSION;
    if (forcarReagendamento) {
      console.log(
        `[Alarm Sync] agendamento v${versaoGravada ?? 'ausente'} -> v${SCHEDULE_VERSION}: reagendando tudo uma vez`
      );
    }

    // Get all scheduled notifications to check which are missing
    const scheduledNotifications = Platform.OS !== 'web'
      ? await Notifications.getAllScheduledNotificationsAsync()
      : [];
    console.log(`[Alarm Sync] Found ${alarms.length} alarms, ${scheduledNotifications.length} scheduled notifications`);

    // Quantas notificações existem POR alarme, contadas pelo data.alarmId.
    // Antes a pergunta era "o id que guardei ainda está agendado?", e a
    // resposta era sempre "não": syncAlarmsOnStartup descarta o retorno de
    // scheduleFullAlarm, então alarm.notificationId seguia apontando para o
    // agendamento anterior. Cada abertura do app reagendava tudo de novo e
    // somava mais N notificações, sem limite — a causa principal das ~15-20
    // que dispararam juntas no iPhone.
    const agendadasPorAlarme = new Map<string, number>();
    for (const n of scheduledNotifications) {
      const id = (n.content?.data as { alarmId?: string } | undefined)?.alarmId;
      if (id) agendadasPorAlarme.set(id, (agendadasPorAlarme.get(id) ?? 0) + 1);
    }

    // Notificação de alarme que não pertence a nenhum alarme atual: sobra de
    // exclusão/edição anterior. Ninguém mais vai cancelá-la, e ela toca no
    // aparelho do idoso como um alarme fantasma.
    const idsAtuais = new Set(alarms.map((a) => a.id));
    for (const [alarmId] of agendadasPorAlarme) {
      if (!idsAtuais.has(alarmId)) {
        const n = await cancelScheduledAlarmNotifications(alarmId);
        console.log(`[Alarm Sync] ${n} notificação(ões) órfã(s) do alarme ${alarmId} removida(s)`);
      }
    }

    for (const alarm of alarms) {
      if (!alarm.enabled) {
        // Cancel any lingering scheduled items for disabled alarms
        if (agendadasPorAlarme.has(alarm.id)) {
          await cancelScheduledAlarmNotifications(alarm.id);
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

      // iOS/Web: falta agendamento? Pergunta pelo alarmId, não pelo id
      // guardado — que fica desatualizado assim que este reagendamento roda e
      // fazia todo alarme parecer faltando em toda abertura.
      const notificationMissing = (agendadasPorAlarme.get(alarm.id) ?? 0) === 0;

      if (notificationMissing || forcarReagendamento) {
        console.log(`[Alarm Sync] Rescheduling alarm: ${alarm.id}`);
        try {
          // Se sobrou qualquer resto deste alarme, sai antes — reagendar por
          // cima é exatamente como o acúmulo começou.
          await cancelScheduledAlarmNotifications(alarm.id);
          await scheduleFullAlarm(alarm);
        } catch (error) {
          console.error(`[Alarm Sync] Failed to reschedule alarm ${alarm.id}:`, error);
        }
      } else {
        console.log(`[Alarm Sync] Alarm ${alarm.id} is properly scheduled`);
      }
    }

    // Só depois do loop inteiro: se algo acima lançou, o próximo boot tenta de
    // novo em vez de dar a migração por feita.
    if (forcarReagendamento) {
      await AsyncStorage.setItem(SCHEDULE_VERSION_KEY, SCHEDULE_VERSION).catch(
        (error) => {
          console.warn('[Alarm Sync] não gravou a versão de agendamento:', error);
        }
      );
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
