import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useColors } from '@/hooks/use-colors';
import { useFontSize } from '@/lib/font-size-context';
import { BrandFonts } from '@/lib/_core/theme';

interface MicFabProps {
  bottomOffset: number;
  onPress?: () => void;
}

interface QuickAction {
  label: string;
  spoken: string;
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  colorToken: 'primary' | 'success' | 'warning' | 'emergency';
  route: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  { label: 'Meus remédios', spoken: 'Abrindo seus remédios', icon: 'medication', colorToken: 'warning', route: '/(tabs)/alarms' },
  { label: 'Anotar saúde', spoken: 'Abrindo anotações de saúde', icon: 'favorite', colorToken: 'success', route: '/(tabs)/health' },
  { label: 'Chamar ambulância', spoken: 'Abrindo chamada de ambulância', icon: 'local-hospital', colorToken: 'primary', route: '/(tabs)/ambulance' },
  { label: 'Avisar família', spoken: 'Abrindo contatos de emergência', icon: 'people', colorToken: 'emergency', route: '/(tabs)/contacts' },
];

/**
 * Assistente rápido: abre um painel com as ações mais usadas, guiado por voz
 * (TTS). O ícone é de atendimento/ajuda, não de microfone: o botão nunca
 * escutou comando de voz, e o microfone prometia uma função que não existe
 * (feedback do teste). Reconhecimento de fala real exigiria um módulo nativo
 * (ex: expo-speech-recognition) e um novo build.
 */
export function MicFab({ bottomOffset, onPress }: MicFabProps) {
  const colors = useColors();
  const fs = useFontSize();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [sheetVisible, setSheetVisible] = useState(false);

  const openSheet = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      Speech.speak('O que você precisa? Toque em uma opção.', { language: 'pt-BR' });
    }
    setSheetVisible(true);
  };

  const closeSheet = () => {
    Speech.stop();
    setSheetVisible(false);
  };

  const handleAction = (action: QuickAction) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      Speech.stop();
      Speech.speak(action.spoken, { language: 'pt-BR' });
    }
    setSheetVisible(false);
    router.push(action.route as any);
  };

  const tokenColors = {
    primary: { fg: colors.primary, bg: colors.primaryLight },
    success: { fg: colors.success, bg: colors.successLight },
    warning: { fg: colors.warning, bg: colors.warningLight },
    emergency: { fg: colors.emergency, bg: colors.emergencyLight },
  } as const;

  return (
    <>
      <Pressable
        onPress={onPress ?? openSheet}
        accessibilityRole="button"
        accessibilityLabel="Assistente rápido. Toque para ver atalhos do app."
        style={({ pressed }) => [
          styles.fab,
          {
            bottom: bottomOffset + insets.bottom + 12,
            backgroundColor: colors.primary,
            shadowColor: colors.primary,
            borderColor: colors.onPrimary,
          },
          pressed && { opacity: 0.9, transform: [{ scale: 0.95 }] },
        ]}
      >
        <MaterialIcons name="support-agent" size={30} color={colors.onPrimary} />
      </Pressable>

      <Modal
        visible={sheetVisible}
        transparent
        animationType="fade"
        onRequestClose={closeSheet}
        statusBarTranslucent
      >
        <Pressable style={styles.overlay} onPress={closeSheet}>
          <Pressable
            style={[styles.sheet, { backgroundColor: colors.background, borderColor: colors.border }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
              <View style={[styles.micBadge, { backgroundColor: colors.primaryLight }]}>
                <MaterialIcons name="support-agent" size={26} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.sheetTitle, { color: colors.foreground, fontSize: fs.lg }]}>
                  O que você precisa?
                </Text>
                <Text style={[styles.sheetSubtitle, { color: colors.muted, fontSize: fs.sm }]}>
                  Toque em uma opção para ir direto
                </Text>
              </View>
            </View>

            <View style={styles.actionsList}>
              {QUICK_ACTIONS.map((action) => {
                const tone = tokenColors[action.colorToken];
                return (
                  <Pressable
                    key={action.route}
                    onPress={() => handleAction(action)}
                    accessibilityRole="button"
                    accessibilityLabel={action.label}
                    style={({ pressed }) => [
                      styles.actionRow,
                      { backgroundColor: colors.surface, borderColor: colors.border },
                      pressed && { opacity: 0.8 },
                    ]}
                  >
                    <View style={[styles.actionIcon, { backgroundColor: tone.bg }]}>
                      <MaterialIcons name={action.icon} size={26} color={tone.fg} />
                    </View>
                    <Text style={[styles.actionLabel, { color: colors.foreground, fontSize: fs.md }]}>
                      {action.label}
                    </Text>
                    <MaterialIcons name="chevron-right" size={24} color={colors.muted} />
                  </Pressable>
                );
              })}
            </View>

            <Pressable
              onPress={closeSheet}
              accessibilityRole="button"
              accessibilityLabel="Fechar assistente"
              style={({ pressed }) => [
                styles.closeBtn,
                { borderColor: colors.muted, backgroundColor: colors.surface },
                pressed && { opacity: 0.8 },
              ]}
            >
              <Text style={[styles.closeBtnText, { color: colors.foreground, fontSize: fs.md }]}>
                Fechar
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    padding: 20,
    paddingBottom: 36,
    gap: 16,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  micBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetTitle: {
    fontFamily: BrandFonts.body,
    fontWeight: '800',
  },
  sheetSubtitle: {
    fontFamily: BrandFonts.body,
    marginTop: 2,
  },
  actionsList: {
    gap: 10,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1.5,
    borderRadius: 16,
    padding: 12,
    minHeight: 64,
  },
  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    flex: 1,
    fontFamily: BrandFonts.body,
    fontWeight: '700',
  },
  closeBtn: {
    minHeight: 54,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    fontFamily: BrandFonts.body,
    fontWeight: '800',
  },
});
