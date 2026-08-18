import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { Alarm } from './app-context';
import { setupCountdownChannel } from './alarm-countdown-notifier';

// --- Notification Channel IDs ----------------------------------------------
import { ALARM_CHANNEL_ID, DEFAULT_CHANNEL_ID, CHECKIN_CHANNEL_ID, alarmChannelId } from './notification-constants';
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
 * São quatro canais de alarme, um por combinação som × vibração (ver
 * alarmChannelId). Todos usam:
 * - AndroidImportance.MAX -> bypasses Do Not Disturb / silent mode
 * - enableLights + lightColor for LED indicator
 * e variam só no som (alarm-notification.wav, embutido pelo plugin do
 * expo-notifications) e no padrão de vibração.
 *
 * On Android 8+, the channel importance determines whether the notification
 * can make sound and vibrate even when the device is in silent/DND mode.
 * MAX importance = alarm-level priority = overrides silent mode.
 */
export async function setupNotificationChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;

  // Set up countdown channel (no sound, DEFAULT importance)
  await setupCountdownChannel();

  // Um canal por combinação som × vibração: no Android 8+ essas duas coisas são
  // propriedades do canal, e desmarcá-las no `content` da notificação não tem
  // efeito nenhum. Todos mantêm MAX + bypassDnd — silenciar o alarme não pode
  // rebaixar a entrega dele.
  const combinacoes: { som: boolean; vibracao: boolean; nome: string }[] = [
    { som: true, vibracao: true, nome: 'Alarmes de Medicamento' },
    { som: true, vibracao: false, nome: 'Alarmes de Medicamento (sem vibração)' },
    { som: false, vibracao: true, nome: 'Alarmes de Medicamento (sem som)' },
    { som: false, vibracao: false, nome: 'Alarmes de Medicamento (silencioso)' },
  ];

  for (const { som, vibracao, nome } of combinacoes) {
    const id = alarmChannelId(som, vibracao);
    // Android congela som/importância na criação do canal; para uma definição
    // nova valer é preciso apagar antes.
    try {
      await Notifications.deleteNotificationChannelAsync(id);
    } catch {}

    await Notifications.setNotificationChannelAsync(id, {
      name: nome,
      description: 'Alarmes de alta prioridade para medicamentos e lembretes de saúde. Aparece mesmo no modo silencioso.',
      importance: Notifications.AndroidImportance.MAX,
      sound: som ? 'alarm_notification.wav' : null,
      vibrationPattern: vibracao ? [0, 500, 200, 500, 200, 500] : undefined,
      enableVibrate: vibracao,
      enableLights: true,
      lightColor: '#0066CC',
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      bypassDnd: true,
    });
  }

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
 * - Escolhe o canal de alarme (MAX importance) conforme as chaves de som e
 *   vibração do próprio alarme -> overrides silent mode on Android
 * - Includes data.url for deep linking to alarm-ring screen
 * - Includes data.alarmId for alarm identification
 * - Sets priority to MAX for full-screen intent behavior
 */
export async function scheduleAlarmNotification(alarm: Alarm): Promise<string | null> {
  try {
    const [hours, minutes] = alarm.time.split(':').map(Number);

    // `!== false` e não `=== true`: alarme gravado antes destas chaves
    // existirem tem o campo ausente, e para ele o certo é tocar/vibrar — não
    // emudecer o remédio de alguém sem ninguém ter pedido. Mesma convenção do
    // lado nativo do Android (ver alarmChannelId e native-alarm-manager).
    const comSom = alarm.sound !== false;
    const comVibracao = alarm.vibration !== false;

    // Notification content - same for all repeat types
    const content: Notifications.NotificationContentInput = {
      title: `⏰ ${alarm.description || 'Alarme'}`,
      body: alarm.description
        ? `Hora do alarme: ${alarm.time} - ${alarm.description}`
        : `Hora do alarme: ${alarm.time}`,
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
      //
      // Sem som cai para 'timeSensitive': 'critical' existe para furar o
      // silencioso TOCANDO, então pedi-lo para um alarme mudo é contraditório
      // (e gasta a permissão de alerta crítico à toa). Medido: os quatro
      // níveis entregam igual sem som — isto é coerência, não é o que
      // consertou o alarme sumido.
      interruptionLevel: comSom ? 'critical' : 'timeSensitive',
    };

    // As chaves só entram quando têm valor. `sound: undefined` NÃO equivale a
    // omitir: em JS a chave continua no objeto (Object.keys devolve 'sound'),
    // e do outro lado da ponte o campo é `Either<Bool, String>?` — converter
    // undefined para Either falha e derruba o agendamento INTEIRO. Era isso
    // que fazia o alarme sem som não existir no iPhone: scheduleNotification
    // lançava, o catch abaixo engolia, e nunca houve o que entregar.
    if (comSom) {
      content.sound = Platform.OS === 'ios'
        // Só um som CRÍTICO toca com a chavinha no silencioso. O
        // expo-notifications expõe apenas `defaultCritical`; o som próprio do
        // alarme só viria por `criticalSoundNamed`, que ele não repassa —
        // então trocamos o timbre pelo alarme que de fato toca: assim que a
        // tela abre, alarm-ring.tsx assume com alarm.mp3 em loop.
        ? 'defaultCritical'
        : 'alarm_notification.wav';
    }
    if (comVibracao) {
      content.vibrate = [0, 500, 200, 500, 200, 500];
    }

    // Android: é o canal que decide som e vibração — o `sound`/`vibrate` acima
    // vale só para o iOS. Sem escolher o canal aqui, desmarcar "Som" no
    // formulário não silenciava nada.
    const channelId = alarmChannelId(alarm.sound, alarm.vibration);

    // Handle different repeat patterns
    if (alarm.repeat === 'daily') {
      const notificationId = await Notifications.scheduleNotificationAsync({
        content,
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour: hours,
          minute: minutes,
          channelId,
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
            channelId,
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
            channelId,
          } as any,
        });
        notificationIds.push(id);
      }
      return notificationIds[0];

    } else if (alarm.repeat === 'custom' && alarm.customDays && alarm.customDays.length > 0) {
      // customDays vem da UI em convenção JS (0=Dom..6=Sáb) — igual ao WEEKDAYS
      // do formulário, ao DAY_ABBR do card e ao alarm-fire-times. O expo usa
      // 1=Dom..7=Sáb, então é só somar 1. O dayMap anterior assumia 0=Seg e
      // agendava TODO dia escolhido um dia depois (domingo tocava segunda).
      const notificationIds: string[] = [];
      for (const dayIdx of alarm.customDays) {
        const weekday = dayIdx + 1;
        if (weekday >= 1 && weekday <= 7) {
          const id = await Notifications.scheduleNotificationAsync({
            content,
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
              weekday,
              hour: hours,
              minute: minutes,
              channelId,
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
          channelId,
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
 * Cancela TODAS as notificações agendadas deste alarme e devolve quantas eram.
 *
 * `weekdays`/`weekends`/`custom` agendam 5/2/N requests e só o PRIMEIRO id vai
 * para alarm.notificationId — cancelar por esse id deixava as outras agendadas
 * para sempre. Um iPhone chegou a disparar ~15-20 notificações de uma vez, num
 * horário sem relação com o alarme e de um alarme que já não existia.
 *
 * Filtrar por `data.alarmId` é a única pergunta que corresponde à realidade, e
 * de quebra recolhe o que já ficou órfão de versões anteriores — sem exigir
 * reinstalação de quem já tem o problema.
 */
export async function cancelScheduledAlarmNotifications(alarmId: string): Promise<number> {
  try {
    const agendadas = await Notifications.getAllScheduledNotificationsAsync();
    const doAlarme = agendadas.filter(
      (n) => (n.content?.data as { alarmId?: string } | undefined)?.alarmId === alarmId,
    );
    for (const n of doAlarme) {
      await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }
    return doAlarme.length;
  } catch (error) {
    console.error('[Notifications] Erro ao cancelar notificações do alarme:', error);
    return 0;
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
