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
  listAlarmKitAlarmIds,
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
 * - iOS 26+ (AlarmKit disponível): AlarmKit é o alarme de verdade — toca em
 *   loop e toma a tela. Nenhuma notificação é agendada para este alarme. Se o
 *   agendamento falhar (autorização negada, App Group, recusa do nativo), cai
 *   para a notificação em vez de deixar o alarme sem existir.
 * - iOS <26 / AlarmKit indisponível / Web: expo-notifications (Critical
 *   Alerts no iOS).
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
    try {
      await scheduleAlarmKitAlarm(alarm);
      // Migração: quem vinha do caminho antigo tem notificações agendadas para
      // este alarme. Sem cancelar, o remédio toca duas vezes.
      await cancelScheduledAlarmNotifications(alarm.id);
      updated.notificationId = undefined;
      return updated;
    } catch (error) {
      // isAlarmKitAvailable() só responde "o módulo JS carregou". Autorização
      // negada, configure() sem App Group e recusa do nativo aparecem só aqui.
      // Propagar deixaria o idoso sem alarme de remédio NENHUM, e ele só
      // descobriria ao não tomar o remédio — por isso cai para a notificação,
      // que é o alarme que o iPhone tinha até ontem. O motivo real vai para o
      // log: falha de capacidade nunca é engolida (CLAUDE.md).
      console.error(
        `[Alarm Sync] AlarmKit recusou o alarme ${alarm.id}; caindo para a notificação:`,
        error,
      );
    }
  }

  // 3. iOS <26 / AlarmKit indisponível: notificação com Critical Alerts.
  // O cancelAlarmKitAlarm abaixo é no-op quando o AlarmKit não existe (a
  // fachada sai cedo sem ponte). Ele vale para o OUTRO caminho que chega aqui,
  // a queda do ramo 2: lá o nativo pode ter aceitado parte do agendamento
  // antes de recusar, e os dois caminhos nunca podem ficar vivos para o mesmo
  // alarme.
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

    // O que está agendado do lado do AlarmKit. As varreduras abaixo precisam
    // enxergar os dois lados: no iOS 26+ o alarme não aparece nas notificações,
    // e um alarme de sistema que sobra não tem como ser desligado pelo app —
    // nada no app conhece o id dele.
    const idsNoAlarmKit = isAlarmKitAvailable() ? listAlarmKitAlarmIds() : [];

    // Alarme agendado que não pertence a nenhum alarme atual: sobra de
    // exclusão/edição anterior. Ninguém mais vai cancelá-lo, e ele toca no
    // aparelho do idoso como um alarme fantasma. A varredura existe para o
    // fluxo ANORMAL — o alarme apagado em OUTRO aparelho e propagado pelo
    // cloud backup nunca passa por cancelFullAlarm aqui.
    const idsAtuais = new Set(alarms.map((a) => a.id));
    for (const [alarmId] of agendadasPorAlarme) {
      if (!idsAtuais.has(alarmId)) {
        const n = await cancelScheduledAlarmNotifications(alarmId);
        console.log(`[Alarm Sync] ${n} notificação(ões) órfã(s) do alarme ${alarmId} removida(s)`);
      }
    }
    for (const alarmId of idsNoAlarmKit) {
      if (!idsAtuais.has(alarmId)) {
        await cancelAlarmKitAlarm(alarmId);
        console.log(`[Alarm Sync] alarme órfão ${alarmId} removido do AlarmKit`);
      }
    }

    for (const alarm of alarms) {
      if (!alarm.enabled) {
        // Cancel any lingering scheduled items for disabled alarms
        if (agendadasPorAlarme.has(alarm.id)) {
          await cancelScheduledAlarmNotifications(alarm.id);
        }
        if (idsNoAlarmKit.includes(alarm.id)) {
          await cancelAlarmKitAlarm(alarm.id);
          console.log(`[Alarm Sync] alarme desabilitado ${alarm.id} removido do AlarmKit`);
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

      // iOS 26+: a pergunta "está faltando?" vai ao AlarmKit, não às
      // notificações — um alarme do AlarmKit nunca aparece em
      // agendadasPorAlarme, e perguntar lá faria TODO alarme parecer
      // faltando em toda abertura do app: a mesma classe de bug das ~15-20
      // notificações simultâneas do iPhone, agora do lado do AlarmKit.
      //
      // iOS <26 / AlarmKit indisponível: pergunta pelo alarmId nas
      // notificações, não pelo id guardado — que fica desatualizado assim
      // que este reagendamento roda e fazia todo alarme parecer faltando em
      // toda abertura.
      const missing = isAlarmKitAvailable()
        ? !idsNoAlarmKit.includes(alarm.id)
        : (agendadasPorAlarme.get(alarm.id) ?? 0) === 0;

      if (missing || forcarReagendamento) {
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

  // AlarmKit: o alarme é do SISTEMA e sobrevive ao logout. Sem isto, o iPhone
  // toma a tela em loop todo dia, na hora do remédio, num aparelho sem conta
  // logada — e quem logar depois recebe o alarme do idoso anterior. Não há
  // recuperação: syncAlarmsOnStartup só itera os alarmes da conta atual, então
  // o id órfão nunca mais aparece para ninguém cancelar.
  if (isAlarmKitAvailable()) {
    for (const id of listAlarmKitAlarmIds()) {
      try {
        await cancelAlarmKitAlarm(id);
      } catch (error) {
        // Um id que o nativo recusa não pode levar os outros junto — cada
        // alarme que sobra é um alarme tocando para a conta errada.
        console.error(`[Alarm Sync] AlarmKit não cancelou o alarme ${id}:`, error);
      }
    }
  }

  // Cancel all notifications
  if (Platform.OS !== 'web') {
    await Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});
  }
}
