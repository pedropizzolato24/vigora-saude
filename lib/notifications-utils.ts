import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { Alarm } from './app-context';
import { setupCountdownChannel } from './alarm-countdown-notifier';

// --- Notification Channel IDs ----------------------------------------------
import { ALARM_CHANNEL_ID, DEFAULT_CHANNEL_ID, CHECKIN_CHANNEL_ID } from './notification-constants';
export { ALARM_CHANNEL_ID, DEFAULT_CHANNEL_ID, CHECKIN_CHANNEL_ID };

// --- Configure notification handler ----------------------------------------
// This controls how notifications are presented when the app is in the foreground.
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const isAlarm = !!notification.request.content.data?.alarmId;
    const isCountdownUpdate = !!notification.request.content.data?.isCountdownUpdate;
    const isCheckinPrompt = notification.request.content.data?.type === 'checkin_prompt';
    return {
      // checkin_prompt: suppress system banner — in-app Modal handles it instead
      shouldShowAlert: !isCheckinPrompt,
      shouldShowBanner: !isCheckinPrompt,
      shouldPlaySound: isAlarm && !isCountdownUpdate && !isCheckinPrompt,
      shouldSetBadge: !isCountdownUpdate && !isCheckinPrompt,
      shouldShowList: true,
    };
  },
});

/**
 * Set up Android notification channels.
 * Must be called once at app startup (before scheduling any notifications).
 *
 * The "vigora-alarms" channel uses:
 * - AndroidImportance.MAX -> bypasses Do Not Disturb / silent mode
 * - Custom alarm sound (alarm-notification.wav bundled via expo-notifications plugin)
 * - Vibration pattern
 * - enableLights + lightColor for LED indicator
 *
 * On Android 8+, the channel importance determines whether the notification
 * can make sound and vibrate even when the device is in silent/DND mode.
 * MAX importance = alarm-level priority = overrides silent mode.
 */
export async function setupNotificationChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;

  // Android caches channel settings (including sound) on first creation.
  // To apply updated sound/importance, we must delete the old channel first.
  // This ensures the correct alarm_notification.wav is used.
  try {
    await Notifications.deleteNotificationChannelAsync(ALARM_CHANNEL_ID);
  } catch {}

  // Set up countdown channel (no sound, DEFAULT importance)
  await setupCountdownChannel();

  // Alarm channel - MAX importance, custom sound, bypasses silent mode
  await Notifications.setNotificationChannelAsync(ALARM_CHANNEL_ID, {
    name: 'Alarmes de Medicamento',
    description: 'Alarmes de alta prioridade para medicamentos e lembretes de saúde. Toca mesmo no modo silencioso.',
    importance: Notifications.AndroidImportance.MAX,
    sound: 'alarm_notification.wav',
    vibrationPattern: [0, 500, 200, 500, 200, 500],
    enableLights: true,
    lightColor: '#0066CC',
    enableVibrate: true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    bypassDnd: true,
  });

  // Default channel for non-alarm notifications
  await Notifications.setNotificationChannelAsync(DEFAULT_CHANNEL_ID, {
    name: 'Notificações Gerais',
    description: 'Notificações gerais do Vigora.',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    enableVibrate: true,
  });

  // Check-in channel — HIGH importance (toca som padrão, não bypassa DND)
  await Notifications.setNotificationChannelAsync(CHECKIN_CHANNEL_ID, {
    name: 'Check-in Diário',
    description: 'Notificação diária de bem-estar. Confirme que está tudo bem.',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    enableVibrate: true,
    sound: 'default',
  });
}

/**
 * Request notification permissions from the user.
 * Returns true if permissions were granted.
 */
export async function requestNotificationPermissions(): Promise<boolean> {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: true,
        allowSound: true,
        allowCriticalAlerts: true, // iOS critical alerts bypass silent mode
      },
    });
    finalStatus = status;
  }

  return finalStatus === 'granted';
}

/**
 * Schedule a notification for an alarm.
 *
 * Key features:
 * - Uses the "vigora-alarms" channel (MAX importance) -> overrides silent mode on Android
 * - Uses custom alarm sound (alarm-notification.wav)
 * - Includes data.url for deep linking to alarm-ring screen
 * - Includes data.alarmId for alarm identification
 * - Sets priority to MAX for full-screen intent behavior
 */
export async function scheduleAlarmNotification(alarm: Alarm): Promise<string | null> {
  try {
    const [hours, minutes] = alarm.time.split(':').map(Number);

    // Notification content - same for all repeat types
    const content: Notifications.NotificationContentInput = {
      title: `⏰ ${alarm.description || 'Alarme'}`,
      body: alarm.description
        ? `Hora do alarme: ${alarm.time} - ${alarm.description}`
        : `Hora do alarme: ${alarm.time}`,
      // iOS: só um som CRÍTICO toca com a chavinha lateral no silencioso —
      // `interruptionLevel: 'critical'` sozinho não basta, o som precisa ser
      // marcado como crítico. O expo-notifications expõe apenas
      // `defaultCritical` (UNNotificationSound.defaultCritical); o som próprio
      // do alarme só viria por `criticalSoundNamed`, que ele não repassa.
      // Trocamos o timbre pelo alarme que de fato toca: assim que a tela abre,
      // alarm-ring.tsx assume com alarm.mp3 em loop.
      sound: alarm.sound
        ? Platform.OS === 'ios'
          ? 'defaultCritical'
          : 'alarm_notification.wav'
        : undefined,
      vibrate: alarm.vibration ? [0, 500, 200, 500, 200, 500] : undefined,
      data: {
        alarmId: alarm.id,
        url: `/alarm-ring?alarmId=${alarm.id}`,
      },
      priority: Notifications.AndroidNotificationPriority.MAX,
      // Android: sticky notification that requires user interaction
      sticky: true,
      // iOS: 'critical' fura o Foco/Não Perturbe (inclusive o "Modo Sono",
      // justamente quando o remédio da noite toca) E a chavinha de silencioso.
      // Depende do entitlement aprovado pela Apple + do usuário ter aceitado o
      // pedido de alertas críticos; se ele recusar, o iOS rebaixa sozinho para
      // o comportamento normal, sem erro.
      interruptionLevel: 'critical',
    };

    // Handle different repeat patterns
    if (alarm.repeat === 'daily') {
      const notificationId = await Notifications.scheduleNotificationAsync({
        content,
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour: hours,
          minute: minutes,
          channelId: ALARM_CHANNEL_ID,
        } as any,
      });
      return notificationId;

    } else if (alarm.repeat === 'weekdays') {
      // Schedule for Monday(2) through Friday(6) - expo uses 1=Sunday, 2=Monday...7=Saturday
      const notificationIds: string[] = [];
      for (let weekday = 2; weekday <= 6; weekday++) {
        const id = await Notifications.scheduleNotificationAsync({
          content,
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
            weekday,
            hour: hours,
            minute: minutes,
            channelId: ALARM_CHANNEL_ID,
          } as any,
        });
        notificationIds.push(id);
      }
      return notificationIds[0];

    } else if (alarm.repeat === 'weekends') {
      // Schedule for Saturday(7) and Sunday(1)
      const notificationIds: string[] = [];
      for (const weekday of [1, 7]) {
        const id = await Notifications.scheduleNotificationAsync({
          content,
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
            weekday,
            hour: hours,
            minute: minutes,
            channelId: ALARM_CHANNEL_ID,
          } as any,
        });
        notificationIds.push(id);
      }
      return notificationIds[0];

    } else if (alarm.repeat === 'custom' && alarm.customDays && alarm.customDays.length > 0) {
      // Custom days - map day index (0=Mon..6=Sun) to expo weekday (1=Sun,2=Mon..7=Sat)
      const dayMap: Record<number, number> = {
        0: 2, // Mon
        1: 3, // Tue
        2: 4, // Wed
        3: 5, // Thu
        4: 6, // Fri
        5: 7, // Sat
        6: 1, // Sun
      };
      const notificationIds: string[] = [];
      for (const dayIdx of alarm.customDays) {
        const weekday = dayMap[dayIdx];
        if (weekday) {
          const id = await Notifications.scheduleNotificationAsync({
            content,
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
              weekday,
              hour: hours,
              minute: minutes,
              channelId: ALARM_CHANNEL_ID,
            } as any,
          });
          notificationIds.push(id);
        }
      }
      return notificationIds.length > 0 ? notificationIds[0] : null;

    } else {
      // One-time alarm
      const triggerDate = new Date();
      triggerDate.setHours(hours, minutes, 0, 0);
      if (triggerDate <= new Date()) {
        triggerDate.setDate(triggerDate.getDate() + 1);
      }

      const notificationId = await Notifications.scheduleNotificationAsync({
        content,
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: triggerDate,
          channelId: ALARM_CHANNEL_ID,
        } as any,
      });
      return notificationId;
    }
  } catch (error) {
    console.error('[Notifications] Error scheduling alarm:', error);
    return null;
  }
}

/**
 * Cancel a scheduled notification by ID.
 */
export async function cancelAlarmNotification(notificationId: string): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  } catch (error) {
    console.error('[Notifications] Error canceling notification:', error);
  }
}

/**
 * Remove da Central de Notificações o que já foi ENTREGUE deste alarme.
 *
 * Chamada quando o idoso responde o alarme na tela cheia. No Android quem
 * apaga a notificação é o serviço nativo (dentro de `stopNativeAlarm`); no iOS
 * não há equivalente, e a notificação ficava pendurada mesmo depois do
 * dismiss — tocar nela reabria a alarm-ring de um disparo já respondido, que
 * monta no estado escalado ("Mensagem de emergência enviada para seus
 * contatos"). Sem plataforma no guard: o filtro por `data.alarmId` já não
 * encontra a notificação nativa do Android.
 *
 * Filtra por `data.alarmId` em vez de usar `alarm.notificationId` porque
 * repeat weekdays/weekends/custom agenda 5/2/N requests e só o primeiro id é
 * persistido — por id, os outros dias continuariam na Central.
 */
export async function dismissDeliveredAlarmNotification(alarmId: string): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const presented = await Notifications.getPresentedNotificationsAsync();
    for (const notification of presented) {
      if (notification.request.content.data?.alarmId === alarmId) {
        await Notifications.dismissNotificationAsync(notification.request.identifier);
      }
    }
  } catch (error) {
    // Best-effort: o alarme já foi respondido, nada aqui pode bloquear o fluxo.
    console.warn('[Notifications] Error dismissing delivered alarm:', error);
  }
}

/**
 * Cancel all scheduled notifications.
 */
export async function cancelAllNotifications(): Promise<void> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch (error) {
    console.error('[Notifications] Error canceling all notifications:', error);
  }
}
