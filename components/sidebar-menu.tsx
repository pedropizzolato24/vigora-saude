import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Dimensions,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/use-colors';
import { useMenu } from '@/lib/menu-context';
import { useAppContext } from '@/lib/app-context';
import { useAccessibility } from '@/lib/accessibility-context';

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
  { label: 'Convidar Cuidador', icon: 'person-add', route: '/(tabs)/invite-caregiver' },
  { label: 'Configurações', icon: 'settings', route: '/(tabs)/settings' },
  { label: 'Ajuda e FAQ', icon: 'help-outline', route: '/(tabs)/help' },
];

export function SidebarMenu() {
  const colors = useColors();
  const router = useRouter();
  const { isOpen, closeMenu } = useMenu();
  const { state } = useAppContext();
  const insets = useSafeAreaInsets();
  const { isAccessibilityMode, a11yColors: ac } = useAccessibility();

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

  const profileName = state.profile.name || 'Configurar Perfil';
  const profilePhoto = state.profile.photoUri;

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
            backgroundColor: isAccessibilityMode ? ac.background : colors.background,
            borderRightColor: isAccessibilityMode ? ac.border : colors.border,
            borderRightWidth: isAccessibilityMode ? 2 : StyleSheet.hairlineWidth,
            transform: [{ translateX }],
          },
        ]}
      >
        {/* Profile Header */}
        <View style={[styles.profileSection, { backgroundColor: colors.primary, paddingTop: Math.max(insets.top, 20) + 12 }]}>
          <Pressable
            onPress={() => handleItemPress('/(tabs)/profile')}
            style={({ pressed }) => [styles.profileContent, pressed && { opacity: 0.8 }]}
          >
            {profilePhoto ? (
              <Image source={{ uri: profilePhoto }} style={[styles.profileAvatar, isAccessibilityMode && { width: 64, height: 64, borderRadius: 32 }]} />
            ) : (
              <View style={[styles.profileAvatarPlaceholder, { backgroundColor: 'rgba(255,255,255,0.25)' }, isAccessibilityMode && { width: 64, height: 64, borderRadius: 32 }]}>
                <MaterialIcons name="person" size={isAccessibilityMode ? 44 : 36} color={colors.onPrimary} />
              </View>
            )}
            <View style={styles.profileInfo}>
              <Text style={[styles.profileName, isAccessibilityMode && { fontSize: 20, fontWeight: '900' }]} numberOfLines={1}>
                {profileName}
              </Text>
              {state.profile.phone ? (
                <Text style={[styles.profilePhone, isAccessibilityMode && { fontSize: 16 }]} numberOfLines={1}>
                  {state.profile.phone}
                </Text>
              ) : (
                <Text style={[styles.profilePhone, isAccessibilityMode && { fontSize: 16 }]}>Toque para editar</Text>
              )}
            </View>
            <Pressable
              onPress={(e) => { e.stopPropagation(); closeMenu(); }}
              style={({ pressed }) => [styles.closeButton, isAccessibilityMode && { width: 44, height: 44, borderRadius: 22 }, pressed && { opacity: 0.6 }]}
            >
              <MaterialIcons name="close" size={isAccessibilityMode ? 30 : 24} color={colors.onPrimary} />
            </Pressable>
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
                isAccessibilityMode && { paddingVertical: 18, minHeight: 72 },
                { borderBottomColor: isAccessibilityMode ? ac.border : colors.border },
                pressed && { backgroundColor: isAccessibilityMode ? ac.surface : colors.surface },
              ]}
            >
              <View
                style={[
                  styles.menuItemIcon,
                  isAccessibilityMode && { width: 52, height: 52, borderRadius: 16 },
                  { backgroundColor: (item.color ?? (isAccessibilityMode ? ac.primary : colors.primary)) + '20' },
                ]}
              >
                <MaterialIcons
                  name={item.icon}
                  size={isAccessibilityMode ? 30 : 24}
                  color={item.color ?? (isAccessibilityMode ? ac.primary : colors.primary)}
                />
              </View>
              <Text style={[styles.menuItemLabel, { color: isAccessibilityMode ? ac.foreground : colors.foreground }, isAccessibilityMode && { fontSize: 18, fontWeight: '700' }]}>
                {item.label}
              </Text>
              <MaterialIcons name="chevron-right" size={isAccessibilityMode ? 28 : 20} color={isAccessibilityMode ? ac.muted : colors.muted} />
            </Pressable>
          ))}
        </View>

        {/* Footer */}
        <View style={styles.sidebarFooter}>
          <Text style={[styles.footerText, { color: isAccessibilityMode ? ac.muted : colors.muted }, isAccessibilityMode && { fontSize: 15 }]}>
            Vigora v1.0.0
          </Text>
          <Text style={[styles.footerSubtext, { color: isAccessibilityMode ? ac.muted : colors.muted }, isAccessibilityMode && { fontSize: 14 }]}>
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
  profileSection: {
    paddingBottom: 20,
    paddingHorizontal: 20,
  },
  closeButton: {
    padding: 6,
    marginLeft: 4,
  },
  profileContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  profileAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  profileAvatarPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  profilePhone: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.75)',
    marginTop: 2,
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
