/**
 * monitored-push-initializer.tsx
 *
 * Do lado do idoso: registra o token de push deste aparelho (até a Fase 4 só o
 * app do cuidador fazia isso) e reage aos pushes de gerenciamento de alarmes.
 * Qualquer push desses (recebido com o app aberto ou tocado) pede a busca da
 * lista no servidor; o pedido de gerenciamento também manda o diálogo
 * reaparecer. Mesmo estilo do caregiver-push-initializer.
 *
 * Montado em app/(tabs)/_layout.tsx, que só o idoso usa. Conta de cuidador que
 * chegasse aqui por engano é ignorada.
 */
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Auth from '@/lib/_core/auth';
import { isCloudPushBlocked } from '@/lib/cloud-sync';
import { getDeviceId } from '@/lib/device-id';
import { requestManagedSync } from '@/lib/managed-alarms-sync';
import { trpcMutation } from '@/lib/monitoring-service';
import { getDevicePushToken } from '@/lib/push-registration';

// Push `data.type` que o servidor manda ao aparelho do idoso. Filtrar por tipo
// evita reagir às notificações dos alarmes (que têm data.alarmId).
export const MONITORED_PUSH_TYPES = [
  'management_request',
  'management_ended',
  'managed_alarms_updated',
  'ping',
];

// Só o nome do erro vai para o log (sem payload: pode carregar dado de saúde).
function warnFailed(what: string, error: unknown) {
  console.warn(`[monitored-push] ${what}`, error instanceof Error ? error.name : typeof error);
}

/**
 * O sistema devolve a MESMA resposta de "última notificação tocada" a cada
 * montagem do layout. Tratada uma vez por processo, senão um toque antigo no
 * pedido reabriria o diálogo toda vez que o layout remontasse.
 */
let coldStartHandled = false;

/**
 * Último token NATIVO (FCM/APNs) visto pelo listener. No expo-notifications,
 * TODA chamada de getDevicePushTokenAsync (inclusive a de dentro de
 * getExpoPushTokenAsync) dispara o addPushTokenListener — com o mesmo token. Sem
 * comparar, registrar dispararia o listener, que registraria de novo, para sempre.
 * Só um token diferente do anterior conta como troca. O primeiro evento só semeia.
 */
let lastNativeToken: string | null = null;

// Registra (ou re-registra) o token de push deste aparelho. O servidor faz upsert.
async function registerPushToken() {
  const user = await Auth.getUserInfo();
  if (!user || user.userType === 'caregiver') return;

  const result = await getDevicePushToken();
  if (!result) {
    console.warn('[monitored-push] sem token de push: este aparelho não recebe os avisos do cuidador');
    return;
  }
  // deviceId: prova de posse da linha (o logout apaga por ele).
  const deviceId = await getDeviceId();
  // O logout trava o backup (setCloudPushBlocked) antes de desregistrar o token,
  // e desregistrar dispara o listener: registrar agora recriaria o token no
  // servidor e retomaria a pausa "saiu da conta". Confere de novo, depois dos
  // awaits, que a mesma conta segue ativa e que não há logout em andamento.
  const current = await Auth.getUserInfo();
  if (isCloudPushBlocked() || !current || current.openId !== user.openId) return;
  // trpcMutation devolve null em toda falha e nunca lança.
  const sent = await trpcMutation('push.register', { ...result, deviceId });
  if (sent === null) console.warn('[monitored-push] o servidor não registrou o token');
}

function handleData(data: Record<string, unknown> | undefined) {
  const type = data?.type;
  if (typeof type !== 'string' || !MONITORED_PUSH_TYPES.includes(type)) return;
  requestManagedSync({ openRequest: type === 'management_request' });
}

export function MonitoredPushInitializer() {
  const registered = useRef(false);

  // Registra o token de push deste aparelho (uma vez por montagem).
  useEffect(() => {
    if (registered.current) return;
    registered.current = true;
    if (Platform.OS === 'web') return;
    registerPushToken().catch((e) => warnFailed('registro do token falhou', e));
  }, []);

  // Token trocado pelo sistema (FCM/APNs) enquanto o app está vivo: registra o
  // novo. Sem isto, o ping diário do servidor acharia DeviceNotRegistered no
  // token velho e pausaria a conta como "app removido", com aviso falso ao cuidador.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = Notifications.addPushTokenListener((token) => {
      const native = String(token.data);
      const rotated = lastNativeToken !== null && native !== lastNativeToken;
      lastNativeToken = native;
      if (!rotated) return;
      registerPushToken().catch((e) => warnFailed('re-registro do token falhou', e));
    });
    return () => sub.remove();
  }, []);

  // Toque na notificação: a frio (o toque que abriu o app) e com o app rodando.
  useEffect(() => {
    if (Platform.OS === 'web') return;

    const onResponse = (response: Notifications.NotificationResponse | null) => {
      handleData(response?.notification.request.content.data);
    };

    if (!coldStartHandled) {
      coldStartHandled = true;
      Notifications.getLastNotificationResponseAsync()
        .then(onResponse)
        .catch((e) => warnFailed('toque inicial falhou', e));
    }
    const sub = Notifications.addNotificationResponseReceivedListener(onResponse);
    return () => sub.remove();
  }, []);

  // Push recebido com o app aberto.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = Notifications.addNotificationReceivedListener((notification) => {
      handleData(notification.request.content.data);
    });
    return () => sub.remove();
  }, []);

  return null;
}
