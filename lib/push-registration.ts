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
