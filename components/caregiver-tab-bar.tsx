import * as Haptics from 'expo-haptics';
import { usePathname, useRouter } from 'expo-router';
import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useColors } from '@/hooks/use-colors';
import { useCaregiverContext } from '@/lib/caregiver-context';

interface TabItem {
  label: string;
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  route: string;
}

const TABS: TabItem[] = [
  { label: 'Início', icon: 'home', route: '/(caregiver)/' },
  { label: 'Alertas', icon: 'notifications', route: '/(caregiver)/alerts' },
  { label: 'Monitorado', icon: 'person', route: '/(caregiver)/monitored' },
  { label: 'Config', icon: 'settings', route: '/(caregiver)/settings' },
];

export function CaregiverTabBar() {
  const colors = useColors();
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { state } = useCaregiverContext();

  const bottomPadding = Platform.OS === 'web' ? 12 : Math.max(insets.bottom, 8);
  const tabBarHeight = 60 + bottomPadding;

  const CAREGIVER_COLOR = '#7C3AED';

  const isActive = (route: string) => {
    if (route === '/(caregiver)/') return pathname === '/' || pathname === '/index' || pathname === '/(caregiver)' || pathname === '/(caregiver)/index';
    return pathname.includes(route.replace('/(caregiver)', ''));
  };

  const handlePress = async (tab: TabItem) => {
    if (Platform.OS !== 'web') {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
        const active = isActive(tab.route);
        const iconColor = active ? CAREGIVER_COLOR : colors.muted;
        const labelColor = active ? CAREGIVER_COLOR : colors.muted;
        const showBadge = tab.route === '/(caregiver)/alerts' && state.unreadCount > 0;

        return (
          <Pressable
            key={tab.label}
            onPress={() => handlePress(tab)}
            style={({ pressed }) => [styles.tab, pressed && { opacity: 0.7 }]}
            accessibilityLabel={tab.label}
            accessibilityRole="button"
          >
            <View style={styles.iconWrapper}>
              <View
                style={[
                  styles.iconBackground,
                  {
                    backgroundColor: active ? CAREGIVER_COLOR + '20' : 'transparent',
                  },
                ]}
              >
                <MaterialIcons name={tab.icon} size={24} color={iconColor} />
              </View>
              {showBadge && (
                <View style={[styles.badge, { backgroundColor: '#DC2626' }]}>
                  <Text style={styles.badgeText}>
                    {state.unreadCount > 9 ? '9+' : String(state.unreadCount)}
                  </Text>
                </View>
              )}
            </View>
            <Text style={[styles.label, { color: labelColor }, active && styles.labelActive]}>
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
