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
    if (route === '/(caregiver-tabs)/') return pathname === '/' || pathname === '/index';
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
      // Chave ligada ao modo: sair do modo de acessibilidade some com os ícones
      // até reabrir o app (glifos do MaterialIcons não redesenham no Android
      // depois do Modal de confirmação fechar). Trocar a key força remontagem.
      key={isAccessibilityMode ? 'a11y' : 'normal'}
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
        // 15 normal / 18 acessível: os mínimos do CLAUDE.md. Eram 11 e 13, e o
  // fontSize: 11 do stylesheet nunca chegou a valer — esta linha o sobrepõe.
  const labelSize = isAccessibilityMode ? 18 : 15;
        return (
          <Pressable
            key={tab.label}
            onPress={() => handlePress(tab)}
            accessibilityLabel={tab.label}
            accessibilityRole="button"
            style={({ pressed }) => [styles.tab, pressed && { opacity: 0.7 }]}
          >
            {/* Two-layer split: outer wrapper has overflow visible so a
                future badge (e.g. unread alerts count) can render outside
                the inner background's clipping radius. Mirrors custom-tab-bar. */}
            <View style={[styles.iconWrapper, isAccessibilityMode && { width: 56, height: 40 }]}>
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
            </View>
            <Text numberOfLines={1} style={[styles.label, { color: tint, fontSize: labelSize }, active && styles.labelActive]}>
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
  iconWrapper: {
    width: 48, height: 34,
    alignItems: 'center', justifyContent: 'center',
    overflow: 'visible',
  },
  iconBackground: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  label: { fontWeight: '500', textAlign: 'center' },
  labelActive: { fontWeight: '700' },
});
