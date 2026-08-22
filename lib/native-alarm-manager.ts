/**
 * native-alarm-manager.ts
 *
 * Wrapper around expo-alarm-module for real Android alarm scheduling.
 * Uses AlarmManager native API - fires even when the app is completely closed.
 *
 * Strategy:
 * - Android: use expo-alarm-module (AlarmManager + BroadcastReceiver)
 * - iOS/Web: fall back to expo-notifications (best effort)
 * - Both mechanisms are scheduled in parallel so the notification deep-link
 *   still works as a secondary trigger.
 */

import { Platform } from 'react-native';
// `import type`: app-context passou a importar este módulo (para empurrar o
// volume ao nativo), e um import de valor aqui fecharia um ciclo em runtime.
import type { Alarm } from './app-context';
import { weeklyJsDays } from './alarm-fire-times';
// O require da lib nativa mora no bridge — ver o porquê lá.
import {
  scheduleAlarmNative,
  removeAlarmNative,
  removeAllAlarmsNative,
  stopAlarmNative,
  alarmNativeModule,
} from './_core/native-alarm-bridge';

/**
 * Calculate the next trigger Date for an alarm given its time string (HH:MM).
 * If the time has already passed today, schedule for tomorrow.
 */
function getNextTriggerDate(timeStr: string): Date {
  const [hours, minutes] = timeStr.split(':').map(Number);
  const now = new Date();
  const trigger = new Date();
  trigger.setHours(hours, minutes, 0, 0);
  if (trigger <= now) {
    trigger.setDate(trigger.getDate() + 1);
  }
  return trigger;
}

/**
 * Get the next weekday trigger date.
 * `jsDay` é dia JS (getDay: 0=Dom..6=Sáb), como tudo que vem de
 * weeklyJsDays. Antes esta função assumia 0=Seg e convertia com
 * `(weekday+1)%7`, o que fazia todo dia escolhido disparar um dia depois
 * (alarme de domingo tocava na segunda).
 */
function getNextWeekdayDate(jsDay: number, timeStr: string): Date {
  const [hours, minutes] = timeStr.split(':').map(Number);
  const now = new Date();
  const today = now.getDay();
  let daysUntil = (jsDay - today + 7) % 7;
  if (daysUntil === 0) {
    // Same day - check if time has passed
    const trigger = new Date();
    trigger.setHours(hours, minutes, 0, 0);
    if (trigger <= now) daysUntil = 7;
  }
  const date = new Date();
  date.setDate(date.getDate() + daysUntil);
  date.setHours(hours, minutes, 0, 0);
  return date;
}

/**
 * Schedule a native alarm using expo-alarm-module.
 * Returns the uid(s) used so they can be stored and cancelled later.
 *
 * For repeating alarms, schedules one instance (the next occurrence).
 * expo-alarm-module handles re-scheduling via its repeating flag.
 */
export async function scheduleNativeAlarm(alarm: Alarm): Promise<string[]> {
  if (!scheduleAlarmNative || Platform.OS !== 'android') return [];

  const uids: string[] = [];

  try {
    // Passo 1.2: usar texto estático descritivo na notificação nativa.
    // NÃO usar countdown dinâmico aqui - é impossível sem Foreground Service.
    // O countdown é exibido apenas quando o app está em foreground (alarm-ring screen).
    const title = '⏰ Vigora - Alarme de Medicamento';
    const body = alarm.description
      ? `${alarm.description} - Toque para confirmar que tomou o medicamento`
      : 'Toque aqui para confirmar que tomou o medicamento';
    const baseUid = `vigora_${alarm.id}`;

    // Dias da semana deste alarme (vazio = diário ou disparo único).
    const diasSemana = weeklyJsDays(alarm);

    if (alarm.repeat === 'daily') {
      const day = getNextTriggerDate(alarm.time);
      await scheduleAlarmNative({
        uid: baseUid,
        day,
        title,
        description: body,
        active: true,
        repeating: true,
        showDismiss: true,
        showSnooze: true,
        snoozeInterval: 0,
        dismissText: 'Dispensar',
        snoozeText: 'Soneca',
        sound: alarm.sound !== false,
      });
      uids.push(baseUid);

    } else if (diasSemana.length > 0) {
      // weekdays/weekends/custom: a lista de dias vem do alarm-fire-times — a
      // MESMA que pré-registra o disparo no servidor. Manter uma cópia própria
      // aqui foi como a convenção divergiu (UI grava 0=Dom, este arquivo lia
      // 0=Seg) e todo alarme semanal passou a disparar um dia depois.
      for (const jsDay of diasSemana) {
        const uid = `${baseUid}_wd${jsDay}`;
        const day = getNextWeekdayDate(jsDay, alarm.time);
        await scheduleAlarmNative({
          uid,
          day,
          title,
          description: body,
          active: true,
          repeating: true,
          showDismiss: true,
          showSnooze: true,
          snoozeInterval: 0,
          dismissText: 'Dispensar',
          snoozeText: 'Soneca',
          sound: alarm.sound !== false,
        });
        uids.push(uid);
      }

    } else {
      // One-time alarm
      const day = getNextTriggerDate(alarm.time);
      await scheduleAlarmNative({
        uid: baseUid,
        day,
        title,
        description: body,
        active: true,
        repeating: false,
        showDismiss: true,
        showSnooze: true,
        snoozeInterval: 0,
        dismissText: 'Dispensar',
        snoozeText: 'Soneca',
        sound: alarm.sound !== false,
      });
      uids.push(baseUid);
    }

    console.log(`[NativeAlarm] Scheduled ${uids.length} alarm(s) for: ${alarm.id}`);
  } catch (e) {
    console.error('[NativeAlarm] Error scheduling alarm:', e);
  }

  return uids;
}

/**
 * Re-agenda um disparo ÚNICO (soneca) em `fireAt`, sem mexer na recorrência do
 * alarme. Usa um uid próprio (`vigora_<id>_snooze`) — extraído de volta para o
 * alarmId pelos handlers de roteamento. O botão "Soneca" da notificação abre o
 * app via deep link (&snooze=1) e a soneca roda em alarm-ring — nunca o
 * SNOOZE_ACTION nativo, que deixaria o evento do DMS sem confirmação.
 */
export async function snoozeNativeAlarm(alarm: Alarm, fireAt: Date): Promise<void> {
  if (!scheduleAlarmNative || Platform.OS !== 'android') return;
  try {
    await scheduleAlarmNative({
      uid: `vigora_${alarm.id}_snooze`,
      day: fireAt,
      title: '⏰ Vigora - Alarme de Medicamento',
      description: alarm.description
        ? `${alarm.description} - Toque para confirmar que tomou o medicamento`
        : 'Toque aqui para confirmar que tomou o medicamento',
      active: true,
      repeating: false,
      showDismiss: true,
      showSnooze: true,
      snoozeInterval: 0,
      dismissText: 'Dispensar',
      snoozeText: 'Soneca',
        sound: alarm.sound !== false,
    });
    console.log(`[NativeAlarm] Snoozed alarm ${alarm.id} until ${fireAt.toISOString()}`);
  } catch (e) {
    console.error('[NativeAlarm] Error snoozing alarm:', e);
  }
}

/**
 * Cancel native alarm(s) for a given alarm.
 * nativeUids: array of uids previously returned by scheduleNativeAlarm.
 */
export async function cancelNativeAlarm(nativeUids: string[]): Promise<void> {
  if (!removeAlarmNative || Platform.OS !== 'android') return;
  for (const uid of nativeUids) {
    try {
      await removeAlarmNative(uid);
      console.log(`[NativeAlarm] Cancelled alarm uid: ${uid}`);
    } catch (e) {
      console.warn(`[NativeAlarm] Error cancelling alarm ${uid}:`, e);
    }
  }
}

/**
 * Cancel all native alarms.
 */
export async function cancelAllNativeAlarms(): Promise<void> {
  if (!removeAllAlarmsNative || Platform.OS !== 'android') return;
  try {
    await removeAllAlarmsNative();
    console.log('[NativeAlarm] All native alarms cancelled');
  } catch (e) {
    console.warn('[NativeAlarm] Error cancelling all alarms:', e);
  }
}

/**
 * Stop the currently ringing native alarm (call from alarm-ring dismiss).
 */
export async function stopNativeAlarm(): Promise<void> {
  if (!stopAlarmNative || Platform.OS !== 'android') return;
  try {
    await stopAlarmNative();
    console.log('[NativeAlarm] Alarm stopped');
  } catch (e) {
    console.warn('[NativeAlarm] Error stopping alarm:', e);
  }
}

/**
 * Envia o volume do alarme (0-100, slider das Configurações) para o serviço
 * nativo, que é quem toca o som. Precisa ser persistido lá porque o alarme
 * dispara sem o app aberto. Escala apenas o player do alarme — o volume de
 * alarme do sistema não é alterado.
 */
export async function setNativeAlarmVolume(volume: number): Promise<void> {
  if (Platform.OS !== 'android' || !alarmNativeModule?.setAlarmVolume) return;
  try {
    await alarmNativeModule.setAlarmVolume(Math.max(0, Math.min(100, Math.round(volume))));
  } catch (e) {
    console.warn('[NativeAlarm] Error setting alarm volume:', e);
  }
}

/**
 * Toca 1,5s do som do alarme — o teste de volume das Configurações. É o alarme
 * de verdade (mesmo arquivo, mesmo stream de ALARME, mesma curva), não uma
 * imitação em JS: o teste antigo tocava outro arquivo por outro player e não
 * dizia nada sobre como o alarme soaria.
 */
export async function previewNativeAlarmSound(volume: number): Promise<void> {
  if (Platform.OS !== 'android' || !alarmNativeModule?.previewSound) return;
  // O nativo lê o volume do storage; grava ANTES para a prévia ser do valor novo.
  await setNativeAlarmVolume(volume);
  try {
    await alarmNativeModule.previewSound();
  } catch (e) {
    console.warn('[NativeAlarm] Error previewing alarm sound:', e);
  }
}

/**
 * Silencia o som do alarme em curso SEM encerrá-lo — a tela do alarme usa isto
 * enquanto a voz fala, para a fala ser ouvida. `stopNativeAlarm` não serve:
 * além de parar o som, ele encerra o alarme e reagenda a recorrência.
 */
export async function pauseNativeAlarmSound(): Promise<void> {
  if (Platform.OS !== 'android' || !alarmNativeModule?.pauseSound) return;
  try {
    await alarmNativeModule.pauseSound();
  } catch (e) {
    console.warn('[NativeAlarm] Error pausing alarm sound:', e);
  }
}

/** Retoma o som pausado por pauseNativeAlarmSound. No-op se já foi encerrado. */
export async function resumeNativeAlarmSound(): Promise<void> {
  if (Platform.OS !== 'android' || !alarmNativeModule?.resumeSound) return;
  try {
    await alarmNativeModule.resumeSound();
  } catch (e) {
    console.warn('[NativeAlarm] Error resuming alarm sound:', e);
  }
}

/** Whether native alarm module is available on this platform */
export const isNativeAlarmAvailable = Platform.OS === 'android' && scheduleAlarmNative !== null;
