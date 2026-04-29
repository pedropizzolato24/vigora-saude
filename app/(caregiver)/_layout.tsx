import { Tabs } from 'expo-router';
import { View } from 'react-native';
import { CaregiverProvider } from '@/lib/caregiver-context';
import { CaregiverTabBar } from '@/components/caregiver-tab-bar';

export default function CaregiverLayout() {
  return (
    <CaregiverProvider>
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
