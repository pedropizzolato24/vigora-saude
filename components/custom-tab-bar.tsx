import * as Haptics from 'expo-haptics';
import { usePathname, useRouter } from 'expo-router';
import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useColors } from '@/hooks/use-colors';
import { useMenu } from '@/lib/menu-context';

interface TabItem {
  label: string;
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  route: string;
  isMenu?: boolean;
}

const TABS: TabItem[] = [
  { label: 'Menu', icon: 'menu', route: '', isMenu: true },
  { label: 'Início', icon: 'home', route: '/(tabs)/' },
  { label: 'Alarmes', icon: 'alarm', route: '/(tabs)/alarms' },
  { label: 'Saúde', icon: 'favorite', route: '/(tabs)/health' },
  { label: 'Config', icon: 'settings', route: '/(tabs)/settings' },
];

export function CustomTabBar() {
  const colors = useColors();
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { toggleMenu } = useMenu();

  const bottomPadding = Platform.OS === 'web' ? 12 : Math.max(insets.bottom, 8);
  const tabBarHeight = 56 + bottomPadding;

  const isActive = (route: string) => {
    if (route === '/(tabs)/') return pathname === '/' || pathname === '/index';
    return pathname.includes(route.replace('/(tabs)', ''));
  };

  const handlePress = async (tab: TabItem) => {
    if (Platform.OS !== 'web') {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    if (tab.isMenu) {
      toggleMenu();
      return;
    }
    router.push(tab.route as any);
  };

  return (
    <View
      style={[
        styles.container,
        {
          height: tabBarHeight,
          paddingBottom: bottomPadding,
          backgroundColor: colors.background,
          borderTopColor: colors.border,
        },
      ]}
    >
      {TABS.map((tab) => {
        const active = !tab.isMenu && isActive(tab.route);
        return (
          <Pressable
            key={tab.label}
            onPress={() => handlePress(tab)}
            style={({ pressed }) => [
              styles.tab,
              pressed && { opacity: 0.7 },
            ]}
            accessibilityLabel={tab.label}
            accessibilityRole="button"
          >
            <View style={[styles.iconContainer, active && { backgroundColor: colors.primary + '20' }]}>
              <MaterialIcons
                name={tab.icon}
                size={26}
                color={active ? colors.primary : colors.muted}
              />
            </View>
            <Text
              style={[
                styles.label,
                { color: active ? colors.primary : colors.muted },
              ]}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderTopWidth: 0.5,
    paddingTop: 8,
    alignItems: 'flex-start',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  iconContainer: {
    width: 40,
    height: 32,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 11,
    fontWeight: '500',
    textAlign: 'center',
  },
});
