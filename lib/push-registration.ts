/**
 * push-registration.ts
 *
 * Resolves this device's Expo push token so the server can deliver real-time
 * alerts. Used by the caregiver app to receive dead man's switch / check-in
 * escalations inside the app, alongside the WhatsApp messages sent to the
 * monitored person's emergency contacts.
 */
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

export interface DevicePushToken {
  token: string;
  platform: 'ios' | 'android' | 'web';
}

/**
 * Request notification permission and resolve this device's Expo push token.
 * Returns null on web, when permission is denied, or when a push token can't
 * be obtained (e.g. simulator/emulator or missing EAS projectId).
 */
export async function getDevicePushToken(): Promise<DevicePushToken | null> {
  if (Platform.OS === 'web') return null;

  const { status: existing } = await Notifications.getPermissionsAsync();
  let status = existing;
  if (status !== 'granted') {
    const res = await Notifications.requestPermissionsAsync();
    status = res.status;
  }
  if (status !== 'granted') return null;

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId;
  if (!projectId) {
    console.warn('[Push] Missing EAS projectId; cannot resolve push token');
    return null;
  }

  try {
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    return { token: data, platform: Platform.OS as 'ios' | 'android' };
  } catch (err) {
    console.warn('[Push] Failed to get Expo push token:', err);
    return null;
  }
}

/**
 * Desregistra este aparelho no servidor. Precisa rodar no logout ANTES de a
 * sessão ser descartada (a rota exige auth).
 *
 * Sem isto, a linha em `push_tokens` sobrevivia ao logout e à troca de conta:
 * o aparelho continuava recebendo os alertas da conta que o registrou — até
 * mesmo sem ninguém logado. Best-effort: falhar aqui não pode travar o logout,
 * mas o motivo real vai para o log.
 */
export async function unregisterDevicePushToken(): Promise<void> {
  if (Platform.OS === 'web') return;

  try {
    const { getApiBaseUrl } = await import('@/constants/oauth');
    const Auth = await import('@/lib/_core/auth');

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId;
    if (!projectId) return;

    // Sem pedir permissão aqui: se o aparelho nunca teve token, não há o que
    // desregistrar, e um prompt de permissão no logout seria absurdo.
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return;

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    if (!token) return;

    const sessionToken = await Auth.getSessionToken();
    if (!sessionToken) return;

    // deviceId é a PROVA DE POSSE do aparelho: é o que autoriza apagar a linha
    // quando ela ficou chaveada em outra conta (registrou como cuidador, depois
    // entrou como monitorado). Sem ele o servidor só apaga linha da própria
    // conta — de propósito, para que conhecer o token não baste.
    const { getDeviceId } = await import('@/lib/device-id');
    const deviceId = await getDeviceId();

    const res = await fetch(`${getApiBaseUrl()}/api/trpc/push.unregister`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionToken}`,
      },
      credentials: 'include',
      body: JSON.stringify({ json: { token, deviceId } }),
    });

    if (!res.ok) {
      console.warn('[Push] unregister respondeu', res.status);
      return;
    }
    console.log('[Push] Token deste aparelho desregistrado');
  } catch (err) {
    console.warn('[Push] Falha ao desregistrar o token:', err);
  }
}
