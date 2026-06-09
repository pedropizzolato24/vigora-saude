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
import { TrialBanner, ExpiredBanner } from '@/components/trial-banner';
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
  /** Tile achatado que ocupa a linha inteira (2 colunas) */
  wide?: boolean;
}

// "Meu Perfil" não tem tile: o card de identidade no topo leva ao perfil.
const TILES: TileConfig[] = [
  { label: 'Contatos de Emergência', icon: 'people', colorToken: 'emergency', route: '/(tabs)/contacts' },
  { label: 'Ambulância', icon: 'local-hospital', colorToken: 'emergency', route: '/(tabs)/ambulance' },
  { label: 'Localização', icon: 'location-on', colorToken: 'success', route: '/(tabs)/location' },
  { label: 'Histórico Médico', icon: 'description', colorToken: 'primary', route: '/(tabs)/anamnesis' },
  { label: 'Convidar Cuidador', icon: 'person-add', colorToken: 'warning', route: '/(tabs)/invite-caregiver' },
  { label: 'Configurações', icon: 'settings', colorToken: 'muted', route: '/(tabs)/settings' },
  { label: 'Ajuda', icon: 'help-outline', colorToken: 'muted', route: '/(tabs)/help', wide: true },
];

// ---------------------------------------------------------------------------
// TudoTile — vertical grid tile (or wide flat tile)
// ---------------------------------------------------------------------------

interface TilePalette {
  surface: string;
  border: string;
  label: string;
  iconColor: string;
  iconBg: string;
}

interface TudoTileProps {
  tile: TileConfig;
  palette: TilePalette;
  onPress: () => void;
  isAccessibilityMode: boolean;
}

function TudoTile({ tile, palette, onPress, isAccessibilityMode }: TudoTileProps) {
  const fs = useFontSize();
  const { a11yFontSize: af } = useAccessibility();

  const minHeight = tile.wide
    ? (isAccessibilityMode ? 84 : 68)
    : (isAccessibilityMode ? 130 : 110);
  const iconContainerSize = isAccessibilityMode ? 56 : 46;
  const iconSize = isAccessibilityMode ? 30 : 24;
  const labelSize = isAccessibilityMode ? af.md : fs.sm;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={tile.label}
      style={({ pressed }) => [
        styles.tile,
        tile.wide && styles.tileWide,
        {
          backgroundColor: palette.surface,
          borderColor: palette.border,
          borderWidth: isAccessibilityMode ? 2 : 2,
          minHeight,
          opacity: pressed ? 0.75 : 1,
        },
      ]}
    >
      <View
        style={[
          styles.iconContainer,
          {
            backgroundColor: palette.iconBg,
            width: iconContainerSize,
            height: iconContainerSize,
            borderRadius: 12,
          },
        ]}
      >
        <MaterialIcons name={tile.icon} size={iconSize} color={palette.iconColor} />
      </View>
      <Text
        style={[
          styles.tileLabel,
          tile.wide && styles.tileLabelWide,
          {
            color: palette.label,
            fontSize: labelSize,
            fontFamily: BrandFonts.body,
          },
        ]}
        numberOfLines={2}
      >
        {tile.label}
      </Text>
      {tile.wide ? (
        <MaterialIcons name="chevron-right" size={24} color={palette.iconColor} />
      ) : null}
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

  const hasProfileName = !!state.profile.name;
  const profileName = state.profile.name || 'Configurar Perfil';
  const profilePhone = state.profile.phone || '';
  const initial = profileName.charAt(0).toUpperCase();

  const goToProfile = () => router.push('/(tabs)/profile' as any);

  // Paleta dos tiles: no modo acessível tudo vem de a11yColors — antes os
  // tiles usavam o tema normal e ficavam "fora" do modo de acessibilidade.
  const tilePalette = (tile: TileConfig): TilePalette => {
    if (isAccessibilityMode) {
      const iconColor = (() => {
        switch (tile.colorToken) {
          case 'emergency': return ac.emergency;
          case 'success': return ac.success;
          case 'primary': return ac.primary;
          case 'muted': return ac.muted;
          case 'warning': return ac.warning;
        }
      })();
      return {
        surface: ac.surface,
        border: ac.border,
        label: ac.foreground,
        iconColor,
        iconBg: iconColor + '18',
      };
    }
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
    return {
      surface: colors.surface,
      border: colors.border,
      label: colors.foreground,
      iconColor,
      iconBg,
    };
  };

  // --- ACCESSIBILITY MODE ---------------------------------------------------
  if (isAccessibilityMode) {
    return (
      <ScreenContainer edges={['left', 'right']} containerStyle={{ backgroundColor: ac.background }}>
        <View
          style={{
            paddingHorizontal: 20,
            paddingTop: insets.top + 12,
            paddingBottom: 16,
            borderBottomWidth: 2,
            borderBottomColor: ac.border,
            backgroundColor: ac.bar,
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
          {/* Identity card — a11y (clicável: leva ao Meu Perfil) */}
          <Pressable
            onPress={goToProfile}
            accessibilityRole="button"
            accessibilityLabel={hasProfileName ? 'Abrir Meu Perfil' : 'Configurar perfil'}
            style={({ pressed }) => [
              styles.identityCard,
              {
                backgroundColor: ac.surface,
                borderColor: ac.border,
                borderWidth: 2,
                gap: 10,
                opacity: pressed ? 0.8 : 1,
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
              <Text style={{ fontSize: af.sm, color: ac.primary, marginTop: 6, fontWeight: '700', fontFamily: BrandFonts.body }}>
                {hasProfileName ? 'Toque para ver seu perfil' : 'Toque para completar seu perfil'}
              </Text>
            </View>
            <MaterialIcons name="chevron-right" size={32} color={ac.muted} />
          </Pressable>

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
                palette={tilePalette(tile)}
                isAccessibilityMode
                onPress={() => router.push(tile.route as any)}
              />
            ))}
          </View>

          {/* Trial / assinatura: nada é exibido para quem já paga */}
          <TrialBanner />
          <ExpiredBanner />
        </ScrollView>
      </ScreenContainer>
    );
  }

  // --- NORMAL MODE ----------------------------------------------------------
  return (
    <ScreenContainer edges={['left', 'right']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.bar, paddingTop: insets.top + 12 }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground, fontSize: fs['2xl'], fontFamily: BrandFonts.body }]}>
          Tudo
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 48 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Identity card — clicável: leva ao Meu Perfil */}
        <Pressable
          onPress={goToProfile}
          accessibilityRole="button"
          accessibilityLabel={hasProfileName ? 'Abrir Meu Perfil' : 'Configurar perfil'}
          style={({ pressed }) => [
            styles.identityCard,
            { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.8 : 1 },
          ]}
        >
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
            <Text style={{ fontSize: fs.xs, color: colors.primary, marginTop: 6, fontWeight: '700', fontFamily: BrandFonts.body }}>
              {hasProfileName ? 'Toque para ver seu perfil' : 'Toque para completar seu perfil'}
            </Text>
          </View>
          {isPro && (
            <View style={[styles.planBadge, { backgroundColor: colors.primaryLight }]}>
              <Text style={{ fontSize: fs.xs, fontWeight: '700', color: colors.primary, fontFamily: BrandFonts.body }}>
                Pro
              </Text>
            </View>
          )}
          <MaterialIcons name="chevron-right" size={26} color={colors.muted} />
        </Pressable>

        {/* Section label */}
        <Text style={[styles.sectionLabel, { color: colors.muted, fontSize: fs.sm, fontFamily: BrandFonts.body }]}>
          Tudo do app
        </Text>

        {/* 2-column grid + tile "Ajuda" achatado de largura dupla no final */}
        <View style={styles.grid}>
          {TILES.map((tile) => (
            <TudoTile
              key={tile.route}
              tile={tile}
              palette={tilePalette(tile)}
              isAccessibilityMode={false}
              onPress={() => router.push(tile.route as any)}
            />
          ))}
        </View>

        {/* Trial / assinatura: nada é exibido para quem já paga */}
        <TrialBanner />
        <ExpiredBanner />
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
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
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
  // "Ajuda": linha inteira, achatado, conteúdo horizontal
  tileWide: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 10,
  },
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileLabel: {
    fontWeight: '700',
    lineHeight: 18,
  },
  tileLabelWide: {
    flex: 1,
  },
});
