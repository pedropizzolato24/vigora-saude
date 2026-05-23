/**
 * caregiver-tab-bar.tsx
 *
 * Bottom tab bar for the (caregiver-tabs) group. 4 items: Início / Alertas /
 * Pessoa / Config. Style mirrors components/custom-tab-bar.tsx (same tokens,
 * accessibility behavior). No menu button — caregivers don't use the sidebar.
 */
import * as Haptics from 'expo-haptics';
import { usePathname, useRouter } from 'expo-router';
import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useColors } from '@/hooks/use-colors';
import { useAccessibility } from '@/lib/accessibility-context';

interface TabItem {
  label: string;
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  route: string;
}

const TABS: TabItem[] = [
  { label: 'Início', icon: 'home', route: '/(caregiver-tabs)/' },
  { label: 'Alertas', icon: 'notifications', route: '/(caregiver-tabs)/alerts' },
  { label: 'Pessoa', icon: 'person', route: '/(caregiver-tabs)/person' },
  { label: 'Config', icon: 'settings', route: '/(caregiver-tabs)/settings' },
];

export function CaregiverTabBar() {
  const colors = useColors();
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { isAccessibilityMode, a11yColors: ac } = useAccessibility();

  const bottomPadding = Platform.OS === 'web' ? 12 : Math.max(insets.bottom, 8);
  const tabBarHeight = isAccessibilityMode ? 80 + bottomPadding : 60 + bottomPadding;

  const isActive = (route: string) => {
    if (route === '/(caregiver-tabs)/') {
      return pathname === '/' || pathname === '/index' || pathname.endsWith('(caregiver-tabs)');
    }
    return pathname.includes(route.replace('/(caregiver-tabs)', ''));
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
          backgroundColor: isAccessibilityMode ? ac.background : colors.background,
          borderTopColor: isAccessibilityMode ? ac.border : colors.border,
          borderTopWidth: isAccessibilityMode ? 2 : 0.5,
        },
      ]}
    >
      {TABS.map((tab) => {
        const active = isActive(tab.route);
        const tint = isAccessibilityMode
          ? (active ? ac.primary : ac.muted)
          : (active ? colors.primary : colors.muted);
        const iconSize = isAccessibilityMode ? 32 : 24;
        const labelSize = isAccessibilityMode ? 13 : 11;
        return (
          <Pressable
            key={tab.label}
            onPress={() => handlePress(tab)}
            accessibilityLabel={tab.label}
            accessibilityRole="button"
            style={({ pressed }) => [styles.tab, pressed && { opacity: 0.7 }]}
          >
            <View
              style={[
                styles.iconBackground,
                isAccessibilityMode
                  ? { width: 56, height: 40, borderRadius: 14, borderWidth: active ? 2 : 0, borderColor: ac.primary }
                  : { width: 48, height: 34, borderRadius: 12 },
                { backgroundColor: active ? tint + '20' : 'transparent' },
              ]}
            >
              <MaterialIcons name={tab.icon} size={iconSize} color={tint} />
            </View>
            <Text style={[styles.label, { color: tint, fontSize: labelSize }, active && styles.labelActive]}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', paddingTop: 6, alignItems: 'flex-start' },
  tab: { flex: 1, alignItems: 'center', gap: 3 },
  iconBackground: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  label: { fontSize: 11, fontWeight: '500', textAlign: 'center' },
  labelActive: { fontWeight: '700' },
});
