import * as Haptics from 'expo-haptics';
import { usePathname, useRouter } from 'expo-router';
import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useColors } from '@/hooks/use-colors';
import { useMenu } from '@/lib/menu-context';
import { useAppContext } from '@/lib/app-context';

interface TabItem {
  label: string;
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  route: string;
  isMenu?: boolean;
}

const TABS: TabItem[] = [
  { label: 'Menu', icon: 'menu', route: '', isMenu: true },
  { label: 'Alarmes', icon: 'alarm', route: '/(tabs)/alarms' },
  { label: 'Início', icon: 'home', route: '/(tabs)/' },
  { label: 'Saúde', icon: 'favorite', route: '/(tabs)/health' },
  { label: 'Config', icon: 'settings', route: '/(tabs)/settings' },
];

export function CustomTabBar() {
  const colors = useColors();
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { toggleMenu } = useMenu();
  const { state } = useAppContext();
  const activeAlarmCount = state.alarms.filter((a) => a.enabled).length;

  const bottomPadding = Platform.OS === 'web' ? 12 : Math.max(insets.bottom, 8);
  const tabBarHeight = 60 + bottomPadding;

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
            <View
              style={[
                styles.iconContainer,
                {
                  backgroundColor: active ? colors.primary + '20' : 'transparent',
                  borderRadius: 12,
                },
              ]}
            >
              <MaterialIcons
                name={tab.icon}
                size={24}
                color={active ? colors.primary : colors.muted}
              />
              {tab.route === '/(tabs)/alarms' && activeAlarmCount > 0 && (
                <View
                  style={[
                    styles.badge,
                    { backgroundColor: colors.primary },
                  ]}
                >
                  <Text style={styles.badgeText}>
                    {activeAlarmCount > 9 ? '9+' : String(activeAlarmCount)}
                  </Text>
                </View>
              )}
            </View>
            <Text
              style={[
                styles.label,
                { color: active ? colors.primary : colors.muted },
                active && styles.labelActive,
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
    paddingTop: 6,
    alignItems: 'flex-start',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  iconContainer: {
    width: 48,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  label: {
    fontSize: 11,
    fontWeight: '500',
    textAlign: 'center',
  },
  labelActive: {
    fontWeight: '700',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FFFFFF',
    lineHeight: 12,
  },
});
