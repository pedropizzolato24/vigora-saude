import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Dimensions,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useColors } from '@/hooks/use-colors';
import { useMenu } from '@/lib/menu-context';

const SIDEBAR_WIDTH = Math.min(Dimensions.get('window').width * 0.75, 300);

interface MenuItem {
  label: string;
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  route: string;
  color?: string;
}

const MENU_ITEMS: MenuItem[] = [
  { label: 'Contatos de Emergência', icon: 'people', route: '/(tabs)/contacts' },
  { label: 'Ficha de Anamnese', icon: 'description', route: '/(tabs)/anamnesis' },
  { label: 'Chamada de Ambulância', icon: 'local-hospital', route: '/(tabs)/ambulance' },
  { label: 'Compartilhar Localização', icon: 'location-on', route: '/(tabs)/location' },
  { label: 'Configurações', icon: 'settings', route: '/(tabs)/settings' },
];

export function SidebarMenu() {
  const colors = useColors();
  const router = useRouter();
  const { isOpen, closeMenu } = useMenu();

  const translateX = useRef(new Animated.Value(-SIDEBAR_WIDTH)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isOpen) {
      Animated.parallel([
        Animated.timing(translateX, {
          toValue: 0,
          duration: 280,
          useNativeDriver: true,
        }),
        Animated.timing(overlayOpacity, {
          toValue: 0.5,
          duration: 280,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateX, {
          toValue: -SIDEBAR_WIDTH,
          duration: 240,
          useNativeDriver: true,
        }),
        Animated.timing(overlayOpacity, {
          toValue: 0,
          duration: 240,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [isOpen, translateX, overlayOpacity]);

  const handleItemPress = async (route: string) => {
    if (Platform.OS !== 'web') {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    closeMenu();
    setTimeout(() => {
      router.push(route as any);
    }, 50);
  };

  return (
    <>
      {/* Overlay */}
      <Animated.View
        style={[styles.overlay, { opacity: overlayOpacity }]}
        pointerEvents={isOpen ? 'auto' : 'none'}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={closeMenu} />
      </Animated.View>

      {/* Sidebar */}
      <Animated.View
        style={[
          styles.sidebar,
          {
            backgroundColor: colors.background,
            borderRightColor: colors.border,
            transform: [{ translateX }],
          },
        ]}
      >
        {/* Header */}
        <View style={[styles.sidebarHeader, { borderBottomColor: colors.border }]}>
          <View style={styles.logoContainer}>
            <MaterialIcons name="favorite" size={28} color={colors.emergency} />
            <Text style={[styles.sidebarTitle, { color: colors.foreground }]}>
              Vigora Saúde
            </Text>
          </View>
          <Pressable
            onPress={closeMenu}
            style={({ pressed }) => [styles.closeButton, pressed && { opacity: 0.6 }]}
          >
            <MaterialIcons name="close" size={24} color={colors.muted} />
          </Pressable>
        </View>

        {/* Menu Items */}
        <View style={styles.menuItems}>
          {MENU_ITEMS.map((item) => (
            <Pressable
              key={item.route}
              onPress={() => handleItemPress(item.route)}
              style={({ pressed }) => [
                styles.menuItem,
                { borderBottomColor: colors.border },
                pressed && { backgroundColor: colors.surface },
              ]}
            >
              <View
                style={[
                  styles.menuItemIcon,
                  { backgroundColor: (item.color ?? '#0066CC') + '15' },
                ]}
              >
                <MaterialIcons
                  name={item.icon}
                  size={24}
                  color={item.color ?? '#0066CC'}
                />
              </View>
              <Text style={[styles.menuItemLabel, { color: colors.foreground }]}>
                {item.label}
              </Text>
              <MaterialIcons name="chevron-right" size={20} color={colors.muted} />
            </Pressable>
          ))}
        </View>

        {/* Footer */}
        <View style={styles.sidebarFooter}>
          <Text style={[styles.footerText, { color: colors.muted }]}>
            Vigora Saúde v1.0.0
          </Text>
          <Text style={[styles.footerSubtext, { color: colors.muted }]}>
            Sua saúde, sempre protegida
          </Text>
        </View>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000000',
    zIndex: 100,
  },
  sidebar: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: SIDEBAR_WIDTH,
    zIndex: 101,
    borderRightWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 16,
  },
  sidebarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 20,
    borderBottomWidth: 1,
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sidebarTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  closeButton: {
    padding: 4,
  },
  menuItems: {
    flex: 1,
    paddingTop: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  menuItemIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuItemLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
  },
  sidebarFooter: {
    padding: 20,
    paddingBottom: 32,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 13,
    fontWeight: '500',
  },
  footerSubtext: {
    fontSize: 12,
    marginTop: 2,
  },
});
