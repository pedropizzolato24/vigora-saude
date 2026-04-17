import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Platform } from "react-native";
import { useColors } from "@/hooks/use-colors";
import { CustomTabBar } from "@/components/custom-tab-bar";
import { SidebarMenu } from "@/components/sidebar-menu";
import { View } from "react-native";

export default function TabLayout() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const bottomPadding = Platform.OS === "web" ? 12 : Math.max(insets.bottom, 8);
  const tabBarHeight = 56 + bottomPadding;

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        tabBar={() => <CustomTabBar />}
        screenOptions={{
          headerShown: false,
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
      </Tabs>
      <SidebarMenu />
    </View>
  );
}
