import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenContainer } from '@/components/screen-container';
import { useColors } from '@/hooks/use-colors';
import { useFontSize } from '@/lib/font-size-context';
import { useAccessibility } from '@/lib/accessibility-context';
import { useAppContext } from '@/lib/app-context';
import { alarmHubStatus } from '@/lib/alarm-kind';
import { BrandFonts } from '@/lib/_core/theme';

// ---------------------------------------------------------------------------
// Cartão do hub — uma porta grande para cada lista (Remédios / Check-in)
// ---------------------------------------------------------------------------

interface HubCardConfig {
  title: string;
  description: string;
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  colorToken: 'warning' | 'primary';
  route: string;
}

const HUB_CARDS: HubCardConfig[] = [
  {
    title: 'Remédios',
    description: 'Lembretes para tomar seus remédios na hora certa.',
    icon: 'medication',
    colorToken: 'warning',
    route: '/(tabs)/alarms',
  },
  {
    title: 'Check-in diário',
    description: 'Todo dia o Vigora pergunta se está tudo bem. Se você não responder, seus contatos de emergência são avisados.',
    icon: 'check-circle',
    colorToken: 'primary',
    route: '/(tabs)/checkin',
  },
];

interface Tone {
  icon: string;
  iconBg: string;
}

interface HubCardPalette {
  surface: string;
  border: string;
  title: string;
  description: string;
  chevron: string;
  status: string;
  tones: Record<HubCardConfig['colorToken'], Tone>;
}

interface HubCardProps {
  card: HubCardConfig;
  status: string;
  palette: HubCardPalette;
  onPress: () => void;
  isAccessibilityMode: boolean;
}

function HubCard({ card, status, palette, onPress, isAccessibilityMode }: HubCardProps) {
  const fs = useFontSize();
  const { a11yFontSize: af, a11ySpacing: as_ } = useAccessibility();
  const tone = palette.tones[card.colorToken];

  const titleSize = isAccessibilityMode ? af.xl : fs.xl;
  const descriptionSize = isAccessibilityMode ? af.md : fs.base;
  const statusSize = isAccessibilityMode ? af.md : fs.md;
  const iconBoxSize = isAccessibilityMode ? 72 : 60;
  const iconSize = isAccessibilityMode ? 40 : 34;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${card.title}. ${status}. Toque para abrir.`}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: palette.surface,
          borderColor: palette.border,
          minHeight: isAccessibilityMode ? as_.touchTarget * 2 : fs.touch(150),
          opacity: pressed ? 0.8 : 1,
        },
      ]}
    >
      <View style={styles.cardTop}>
        <View style={[styles.iconBox, { backgroundColor: tone.iconBg, width: iconBoxSize, height: iconBoxSize }]}>
          <MaterialIcons name={card.icon} size={iconSize} color={tone.icon} />
        </View>
        <Text
          style={[
            styles.cardTitle,
            { color: palette.title, fontSize: titleSize, lineHeight: Math.round(titleSize * 1.3), fontFamily: BrandFonts.body },
          ]}
        >
          {card.title}
        </Text>
        <MaterialIcons name="chevron-right" size={isAccessibilityMode ? 36 : 28} color={palette.chevron} />
      </View>
      <Text
        style={{
          color: palette.description,
          fontSize: descriptionSize,
          lineHeight: Math.round(descriptionSize * 1.45),
          fontFamily: BrandFonts.body,
        }}
      >
        {card.description}
      </Text>
      <Text
        style={{
          color: palette.status,
          fontSize: statusSize,
          lineHeight: Math.round(statusSize * 1.3),
          fontFamily: BrandFonts.body,
          fontWeight: '800',
        }}
      >
        {status}
      </Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Tela
// ---------------------------------------------------------------------------

export default function AlarmHubScreen() {
  const colors = useColors();
  const fs = useFontSize();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { state } = useAppContext();
  const { isAccessibilityMode, a11yColors: ac, a11yFontSize: af } = useAccessibility();

  const { medicationText, checkinText } = alarmHubStatus(state.alarms);
  const statusFor = (card: HubCardConfig) => (card.route === '/(tabs)/alarms' ? medicationText : checkinText);
  const open = (route: string) => router.push(route as never);

  // --- MODO ACESSÍVEL -------------------------------------------------------
  if (isAccessibilityMode) {
    const palette: HubCardPalette = {
      surface: ac.surface,
      border: ac.border,
      title: ac.foreground,
      description: ac.foreground,
      chevron: ac.muted,
      status: ac.primary,
      tones: {
        warning: { icon: ac.warning, iconBg: ac.warning + '18' },
        primary: { icon: ac.primary, iconBg: ac.primary + '18' },
      },
    };
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
            Alarmes
          </Text>
          <Text style={{ fontSize: af.sm, color: ac.muted, marginTop: 4, fontFamily: BrandFonts.body }}>
            Escolha o que você quer ver
          </Text>
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 120, gap: 20 }} showsVerticalScrollIndicator={false}>
          {HUB_CARDS.map((card) => (
            <HubCard
              key={card.route}
              card={card}
              status={statusFor(card)}
              palette={palette}
              isAccessibilityMode
              onPress={() => open(card.route)}
            />
          ))}
        </ScrollView>
      </ScreenContainer>
    );
  }

  // --- MODO NORMAL ----------------------------------------------------------
  const palette: HubCardPalette = {
    surface: colors.surface,
    border: colors.border,
    title: colors.foreground,
    description: colors.muted,
    chevron: colors.muted,
    status: colors.primary,
    tones: {
      warning: { icon: colors.warning, iconBg: colors.warningLight },
      primary: { icon: colors.primary, iconBg: colors.primaryLight },
    },
  };
  return (
    <ScreenContainer edges={['left', 'right']}>
      <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.bar, paddingTop: insets.top + 12 }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground, fontSize: fs['2xl'], fontFamily: BrandFonts.body }]}>
          Alarmes
        </Text>
        <Text style={{ color: colors.muted, fontSize: fs.base, marginTop: 2, fontFamily: BrandFonts.body }}>
          Escolha o que você quer ver
        </Text>
      </View>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {HUB_CARDS.map((card) => (
          <HubCard
            key={card.route}
            card={card}
            status={statusFor(card)}
            palette={palette}
            isAccessibilityMode={false}
            onPress={() => open(card.route)}
          />
        ))}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
    fontWeight: '800',
  },
  // paddingBottom folga o botão "?" (MicFab), que flutua sobre o fim da lista.
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 120,
    gap: 16,
  },
  card: {
    width: '100%',
    borderWidth: 2,
    borderRadius: 20,
    padding: 20,
    gap: 12,
    justifyContent: 'center',
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  iconBox: {
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    flex: 1,
    fontWeight: '800',
  },
});
