import React from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenContainer } from '@/components/screen-container';
import { useColors } from '@/hooks/use-colors';
import { useFontSize } from '@/lib/font-size-context';
import { useAccessibility } from '@/lib/accessibility-context';
import { useAppContext } from '@/lib/app-context';
import { usePurchases } from '@/hooks/use-purchases';
import { BrandFonts } from '@/lib/_core/theme';

// ---------------------------------------------------------------------------
// Tile definition
// ---------------------------------------------------------------------------

interface TileConfig {
  label: string;
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  colorToken: 'emergency' | 'success' | 'primary' | 'muted' | 'warning';
  route: string;
}

const TILES: TileConfig[] = [
  { label: 'Contatos de Emergência', icon: 'people', colorToken: 'emergency', route: '/(tabs)/contacts' },
  { label: 'Ambulância', icon: 'local-hospital', colorToken: 'emergency', route: '/(tabs)/ambulance' },
  { label: 'Localização', icon: 'location-on', colorToken: 'success', route: '/(tabs)/location' },
  { label: 'Histórico Médico', icon: 'description', colorToken: 'primary', route: '/(tabs)/anamnesis' },
  { label: 'Meu Perfil', icon: 'person', colorToken: 'primary', route: '/(tabs)/profile' },
  { label: 'Configurações', icon: 'settings', colorToken: 'muted', route: '/(tabs)/settings' },
  { label: 'Ajuda', icon: 'help-outline', colorToken: 'muted', route: '/(tabs)/help' },
  { label: 'Convidar Cuidador', icon: 'person-add', colorToken: 'warning', route: '/(tabs)/invite-caregiver' },
];

// ---------------------------------------------------------------------------
// TudoTile — vertical grid tile
// ---------------------------------------------------------------------------

interface TudoTileProps {
  tile: TileConfig;
  onPress: () => void;
  isAccessibilityMode: boolean;
}

function TudoTile({ tile, onPress, isAccessibilityMode }: TudoTileProps) {
  const colors = useColors();
  const fs = useFontSize();

  // Map colorToken to icon color and container bg
  const iconColor = (() => {
    switch (tile.colorToken) {
      case 'emergency': return colors.emergency;
      case 'success': return colors.success;
      case 'primary': return colors.primary;
      case 'muted': return colors.muted;
      case 'warning': return colors.warning;
    }
  })();

  const iconBg = (() => {
    switch (tile.colorToken) {
      case 'emergency': return colors.emergencyLight;
      case 'success': return colors.successLight;
      case 'primary': return colors.primaryLight;
      case 'muted': return colors.border;
      case 'warning': return colors.warningLight;
    }
  })();

  const minHeight = isAccessibilityMode ? 130 : 110;
  const iconContainerSize = isAccessibilityMode ? 56 : 46;
  const iconSize = isAccessibilityMode ? 30 : 24;
  const labelSize = isAccessibilityMode ? fs.md : fs.sm;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={tile.label}
      style={({ pressed }) => [
        styles.tile,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          minHeight,
          opacity: pressed ? 0.75 : 1,
        },
      ]}
    >
      <View
        style={[
          styles.iconContainer,
          {
            backgroundColor: iconBg,
            width: iconContainerSize,
            height: iconContainerSize,
            borderRadius: 12,
          },
        ]}
      >
        <MaterialIcons name={tile.icon} size={iconSize} color={iconColor} />
      </View>
      <Text
        style={[
          styles.tileLabel,
          {
            color: colors.foreground,
            fontSize: labelSize,
            fontFamily: BrandFonts.body,
          },
        ]}
        numberOfLines={2}
      >
        {tile.label}
      </Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function TudoScreen() {
  const colors = useColors();
  const fs = useFontSize();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { state } = useAppContext();
  const { isPro } = usePurchases();
  const { isAccessibilityMode, a11yColors: ac, a11yFontSize: af } = useAccessibility();

  const profileName = state.profile.name || 'Configurar Perfil';
  const profilePhone = state.profile.phone || '';
  const initial = profileName.charAt(0).toUpperCase();

  // --- ACCESSIBILITY MODE ---------------------------------------------------
  if (isAccessibilityMode) {
    return (
      <ScreenContainer edges={['left', 'right']} containerClassName="bg-white">
        <View
          style={{
            paddingHorizontal: 20,
            paddingTop: insets.top + 12,
            paddingBottom: 16,
            borderBottomWidth: 2,
            borderBottomColor: ac.border,
            backgroundColor: ac.background,
          }}
        >
          <Text style={{ fontSize: af['2xl'], fontWeight: '900', color: ac.foreground, fontFamily: BrandFonts.body }}>
            Tudo
          </Text>
        </View>

        <ScrollView
          contentContainerStyle={{ padding: 20, paddingBottom: 48, gap: 20 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Identity card — a11y */}
          <View
            style={[
              styles.identityCard,
              {
                backgroundColor: ac.surface,
                borderColor: ac.border,
                borderWidth: 2,
                gap: 10,
              },
            ]}
          >
            <View style={[styles.avatarCircle, { backgroundColor: ac.primary + '20', width: 72, height: 72, borderRadius: 36 }]}>
              <Text style={{ fontSize: af['2xl'], fontWeight: '900', color: ac.primary }}>{initial}</Text>
            </View>
            <View style={styles.identityInfo}>
              <Text style={{ fontSize: af.lg, fontWeight: '900', color: ac.foreground, fontFamily: BrandFonts.body }} numberOfLines={1}>
                {profileName}
              </Text>
              {!!profilePhone && (
                <Text style={{ fontSize: af.sm, color: ac.muted, marginTop: 2, fontFamily: BrandFonts.body }} numberOfLines={1}>
                  {profilePhone}
                </Text>
              )}
              <View
                style={[
                  styles.planBadge,
                  { backgroundColor: isPro ? ac.primary + '20' : ac.border, marginTop: 6 },
                ]}
              >
                <Text style={{ fontSize: af.xs ?? 12, fontWeight: '700', color: isPro ? ac.primary : ac.muted, fontFamily: BrandFonts.body }}>
                  {isPro ? 'Pro' : 'Grátis'}
                </Text>
              </View>
            </View>
          </View>

          {/* Section label */}
          <Text style={{ fontSize: af.sm, color: ac.muted, fontWeight: '600', fontFamily: BrandFonts.body, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Tudo do app
          </Text>

          {/* 2-column grid — a11y */}
          <View style={styles.grid}>
            {TILES.map((tile) => (
              <TudoTile
                key={tile.route}
                tile={tile}
                isAccessibilityMode
                onPress={() => router.push(tile.route as any)}
              />
            ))}
          </View>
        </ScrollView>
      </ScreenContainer>
    );
  }

  // --- NORMAL MODE ----------------------------------------------------------
  return (
    <ScreenContainer edges={['left', 'right']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border, paddingTop: insets.top + 12 }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground, fontSize: fs['2xl'], fontFamily: BrandFonts.body }]}>
          Tudo
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 48 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Identity card */}
        <View style={[styles.identityCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.avatarCircle, { backgroundColor: colors.primaryLight }]}>
            <Text style={{ fontSize: fs['2xl'], fontWeight: '900', color: colors.primary, fontFamily: BrandFonts.body }}>
              {initial}
            </Text>
          </View>
          <View style={styles.identityInfo}>
            <Text
              style={[styles.identityName, { color: colors.foreground, fontSize: fs.md, fontFamily: BrandFonts.body }]}
              numberOfLines={1}
            >
              {profileName}
            </Text>
            {!!profilePhone && (
              <Text
                style={[styles.identityPhone, { color: colors.muted, fontSize: fs.sm, fontFamily: BrandFonts.body }]}
                numberOfLines={1}
              >
                {profilePhone}
              </Text>
            )}
            <View style={[styles.planBadge, { backgroundColor: isPro ? colors.primaryLight : colors.border }]}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: isPro ? colors.primary : colors.muted, fontFamily: BrandFonts.body }}>
                {isPro ? 'Pro' : 'Grátis'}
              </Text>
            </View>
          </View>
        </View>

        {/* Section label */}
        <Text style={[styles.sectionLabel, { color: colors.muted, fontSize: fs.sm, fontFamily: BrandFonts.body }]}>
          Tudo do app
        </Text>

        {/* 2-column grid */}
        <View style={styles.grid}>
          {TILES.map((tile) => (
            <TudoTile
              key={tile.route}
              tile={tile}
              isAccessibilityMode={false}
              onPress={() => router.push(tile.route as any)}
            />
          ))}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
    fontWeight: '800',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    gap: 16,
  },
  // Identity card
  identityCard: {
    borderWidth: 2,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  avatarCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  identityInfo: {
    flex: 1,
  },
  identityName: {
    fontWeight: '800',
  },
  identityPhone: {
    marginTop: 2,
  },
  planBadge: {
    alignSelf: 'flex-start',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginTop: 6,
  },
  // Section label
  sectionLabel: {
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 4,
  },
  // Grid
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  // Tile
  tile: {
    // ~half width minus gap
    width: '47.5%',
    borderWidth: 2,
    borderRadius: 16,
    padding: 14,
    alignItems: 'flex-start',
    gap: 10,
  },
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileLabel: {
    fontWeight: '700',
    lineHeight: 18,
  },
});
