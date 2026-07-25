import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Platform } from "react-native";
import { useColors } from "@/hooks/use-colors";
import { CustomTabBar } from "@/components/custom-tab-bar";
import { MicFab } from "@/components/mic-fab";
import { View } from "react-native";

export default function TabLayout() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const bottomPadding = Platform.OS === "web" ? 12 : Math.max(insets.bottom, 8);
  const tabBarHeight = 86 + bottomPadding;

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        tabBar={() => <CustomTabBar />}
        screenOptions={{
          headerShown: false,
          // Troca de aba com cross-fade: sem isso a tela aparece cortada, o que
          // dava a impressão de app "duro" (feedback do teste). É a navegação
          // mais usada pelo monitorado, então é onde o ganho aparece.
          animation: 'fade',
          tabBarStyle: {
            height: tabBarHeight,
            backgroundColor: colors.background,
            borderTopColor: colors.border,
            borderTopWidth: 0.5,
          },
        }}
      >
        <Tabs.Screen name="index" options={{ title: "Início" }} />
        <Tabs.Screen name="alarms" options={{ title: "Alarmes" }} />
        <Tabs.Screen name="health" options={{ title: "Saúde" }} />
        <Tabs.Screen name="settings" options={{ title: "Configurações" }} />
        <Tabs.Screen name="contacts" options={{ title: "Contatos" }} />
        <Tabs.Screen name="anamnesis" options={{ title: "Anamnese" }} />
        <Tabs.Screen name="ambulance" options={{ title: "Ambulância" }} />
        <Tabs.Screen name="location" options={{ title: "Localização" }} />
        <Tabs.Screen name="profile" options={{ title: "Perfil" }} />
        <Tabs.Screen name="help" options={{ title: "Ajuda" }} />
        <Tabs.Screen name="invite-caregiver" options={{ title: "Convidar Cuidador" }} />
        <Tabs.Screen name="tudo" />
      </Tabs>
      <MicFab bottomOffset={86} />
    </View>
  );
}
