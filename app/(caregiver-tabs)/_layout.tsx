import { Tabs, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CaregiverTabBar } from '@/components/caregiver-tab-bar';
import { CaregiverPushInitializer } from '@/components/caregiver-push-initializer';
import { useColors } from '@/hooks/use-colors';
import * as Auth from '@/lib/_core/auth';
import { useCaregiverContext } from '@/lib/caregiver-context';

export default function CaregiverTabLayout() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { refreshLink } = useCaregiverContext();
  const [checked, setChecked] = useState(false);

  // Defense in depth: a monitored user that somehow lands on a caregiver-tabs
  // deep link is redirected. The primary guarantee is OnboardingGate / OAuth
  // callback, but this avoids surprising state if something else routes here.
  useEffect(() => {
    (async () => {
      const user = await Auth.getUserInfo();
      if (user?.userType && user.userType !== 'caregiver') {
        router.replace('/(tabs)');
        return;
      }
      // Auth is available now (the provider mounts pre-login at the app root, so
      // its initial hydration may have run unauthenticated). Re-sync the link
      // from the server so fresh logins / reinstalls see their active link.
      refreshLink();
      setChecked(true);
    })();
  }, [router, refreshLink]);

  if (!checked) return null;

  const bottomPadding = Platform.OS === 'web' ? 12 : Math.max(insets.bottom, 8);
  const tabBarHeight = 56 + bottomPadding;

  return (
    <View style={{ flex: 1 }}>
      <CaregiverPushInitializer />
      <Tabs
        tabBar={() => <CaregiverTabBar />}
        screenOptions={{
          headerShown: false,
          // Mesmo cross-fade das abas do monitorado.
          animation: 'fade',
          tabBarStyle: {
            height: tabBarHeight,
            backgroundColor: colors.background,
            borderTopColor: colors.border,
            borderTopWidth: 0.5,
          },
        }}
      >
        <Tabs.Screen name="index" options={{ title: 'Início' }} />
        <Tabs.Screen name="alerts" options={{ title: 'Alertas' }} />
        <Tabs.Screen name="person" options={{ title: 'Pessoa' }} />
        <Tabs.Screen name="settings" options={{ title: 'Configurações' }} />
      </Tabs>
    </View>
  );
}
