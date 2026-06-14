/**
 * caregiver-push-initializer.tsx
 *
 * Invisible component that registers this caregiver device's Expo push token
 * with the server, so the monitoring job can deliver real-time alerts about the
 * person they follow. Mounted inside the caregiver layout, which only renders
 * after auth has confirmed a caregiver session.
 */
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { getDevicePushToken } from '@/lib/push-registration';
import { trpc } from '@/lib/trpc';

// Push `data.type` values sent by the server monitoring job. Gating on these
// keeps this handler from reacting to unrelated notifications (e.g. alarms).
const CAREGIVER_PUSH_TYPES = ['monitoring_warning', 'missed_checkin', 'sos'];
const DEFAULT_ROUTE = '/(caregiver-tabs)/alerts';

export function CaregiverPushInitializer() {
  const registered = useRef(false);
  const router = useRouter();
  const register = trpc.push.register.useMutation();

  // Register this device's push token once.
  useEffect(() => {
    if (registered.current) return;
    registered.current = true;

    (async () => {
      const result = await getDevicePushToken();
      if (!result) return;
      try {
        await register.mutateAsync(result);
        console.log('[Push] Caregiver push token registered');
      } catch (err) {
        console.warn('[Push] Failed to register push token:', err);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tap-to-navigate: open the screen named in the push payload when the
  // caregiver taps the notification (both warm taps and the cold-start tap
  // that launched the app).
  useEffect(() => {
    if (Platform.OS === 'web') return;

    const navigateFromResponse = (response: Notifications.NotificationResponse | null) => {
      const data = response?.notification.request.content.data;
      if (!data || !CAREGIVER_PUSH_TYPES.includes(data.type as string)) return;
      const url = typeof data.url === 'string' && data.url ? data.url : DEFAULT_ROUTE;
      router.push(url as never);
    };

    // Cold start: the notification tap that launched the app.
    Notifications.getLastNotificationResponseAsync()
      .then(navigateFromResponse)
      .catch(() => {});

    // Warm: taps while the app is already running.
    const sub = Notifications.addNotificationResponseReceivedListener(navigateFromResponse);
    return () => sub.remove();
  }, [router]);

  return null;
}
