import * as Haptics from 'expo-haptics';
import { usePathname, useRouter } from 'expo-router';
import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useColors } from '@/hooks/use-colors';
import { useMenu } from '@/lib/menu-context';
import { useAppContext } from '@/lib/app-context';
import { useAccessibility } from '@/lib/accessibility-context';

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
  const { isAccessibilityMode, a11yColors: ac } = useAccessibility();
  const activeAlarmCount = state.alarms.filter((a) => a.enabled).length;

  const bottomPadding = Platform.OS === 'web' ? 12 : Math.max(insets.bottom, 8);
  const tabBarHeight = isAccessibilityMode ? 80 + bottomPadding : 60 + bottomPadding;

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
          backgroundColor: isAccessibilityMode ? ac.background : colors.background,
          borderTopColor: isAccessibilityMode ? ac.border : colors.border,
          borderTopWidth: isAccessibilityMode ? 2 : 0.5,
        },
      ]}
    >
      {TABS.map((tab) => {
        const active = !tab.isMenu && isActive(tab.route);
        const iconColor = isAccessibilityMode
          ? (active ? ac.primary : ac.muted)
          : (active ? colors.primary : colors.muted);
        const labelColor = isAccessibilityMode
          ? (active ? ac.primary : ac.muted)
          : (active ? colors.primary : colors.muted);
        const iconSize = isAccessibilityMode ? 32 : 24;
        const labelSize = isAccessibilityMode ? 13 : 11;
        return (
          <Pressable
            key={tab.label}
            onPress={() => handlePress(tab)}
            style={({ pressed }) => [
              styles.tab,
              isAccessibilityMode && { paddingTop: 4 },
              pressed && { opacity: 0.7 },
            ]}
            accessibilityLabel={tab.label}
            accessibilityRole="button"
          >
            {/* Outer wrapper: overflow visible for badge */}
            <View style={[styles.iconWrapper, isAccessibilityMode && { width: 56, height: 40 }]}>
              {/* Inner background: overflow hidden so borderRadius clips correctly */}
              <View
                style={[
                  styles.iconBackground,
                  isAccessibilityMode && { width: 56, height: 40, borderRadius: 14, borderWidth: active ? 2 : 0, borderColor: ac.primary },
                  {
                    backgroundColor: active
                      ? (isAccessibilityMode ? ac.primary + '25' : colors.primary + '20')
                      : 'transparent',
                  },
                ]}
              >
                <MaterialIcons name={tab.icon} size={iconSize} color={iconColor} />
              </View>
              {tab.route === '/(tabs)/alarms' && activeAlarmCount > 0 && (
                <View
                  style={[
                    styles.badge,
                    { backgroundColor: isAccessibilityMode ? ac.primary : colors.primary },
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
                { color: labelColor, fontSize: labelSize },
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
  iconWrapper: {
    width: 48,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  iconBackground: {
    width: 48,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
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
