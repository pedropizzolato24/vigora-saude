import { Tabs } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';
import { CaregiverProvider } from '@/lib/caregiver-context';
import { CaregiverTabBar } from '@/components/caregiver-tab-bar';
import { registerPushToken } from '@/lib/push-token';
import { getDeviceId } from '@/lib/device-id';
import { getApiBaseUrl } from '@/constants/oauth';

function parseSuperjsonResponse(data: any): any {
  const resultData = data?.result?.data;
  return resultData?.json ?? resultData ?? null;
}

async function registerTokenOnServer(args: { deviceId: string; token: string }): Promise<unknown> {
  const url = `${getApiBaseUrl()}/api/trpc/caregiver.registerPushToken`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ json: args }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return parseSuperjsonResponse(data);
}

function PushTokenRegistrar() {
  useEffect(() => {
    (async () => {
      try {
        const deviceId = await getDeviceId();
        await registerPushToken(deviceId, registerTokenOnServer);
      } catch (err) {
        console.warn('[CaregiverLayout] Failed to register push token:', err);
      }
    })();
  }, []);

  return null;
}

export default function CaregiverLayout() {
  return (
    <CaregiverProvider>
      <PushTokenRegistrar />
      <View style={{ flex: 1 }}>
        <Tabs
          tabBar={() => <CaregiverTabBar />}
          screenOptions={{ headerShown: false }}
        >
          <Tabs.Screen name="index" options={{ title: 'Início' }} />
          <Tabs.Screen name="alerts" options={{ title: 'Alertas' }} />
          <Tabs.Screen name="monitored" options={{ title: 'Monitorado' }} />
          <Tabs.Screen name="settings" options={{ title: 'Configurações' }} />
        </Tabs>
      </View>
    </CaregiverProvider>
  );
}
