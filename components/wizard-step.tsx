import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PressableScale } from '@/components/pressable-scale';
import { useColors } from '@/hooks/use-colors';
import { useFontSize } from '@/lib/font-size-context';
import { BrandFonts } from '@/lib/_core/theme';

interface WizardStepProps {
  total: number;
  current: number;
  categoryTag?: string;
  tagColor?: string;
  question: string;
  children: React.ReactNode;
  onNext: () => void;
  onBack?: () => void;
  /**
   * Fecha/cancela o wizard. Exibido como botão "Cancelar" na barra inferior
   * quando não há passo anterior (onBack ausente), para que sair do fluxo
   * seja tão visível quanto avançar.
   */
  onCancel?: () => void;
  cancelLabel?: string;
  nextLabel?: string;
  nextDisabled?: boolean;
}

export function WizardStep({
  total,
  current,
  categoryTag,
  tagColor,
  question,
  children,
  onNext,
  onBack,
  onCancel,
  cancelLabel,
  nextLabel,
  nextDisabled,
}: WizardStepProps) {
  const colors = useColors();
  const fs = useFontSize();
  const insets = useSafeAreaInsets();
  const accent = tagColor ?? colors.primary;
  const primaryLabel = nextLabel ?? 'Continuar';
  const secondaryAction = onBack ?? onCancel;
  const secondaryLabel = onBack ? 'Voltar' : (cancelLabel ?? 'Cancelar');
  const secondaryA11yLabel = onBack
    ? 'Voltar para a pergunta anterior'
    : (cancelLabel ?? 'Cancelar e fechar');

  return (
    <View style={styles.container}>
      {/* Stepper */}
      <View style={styles.stepper}>
        {Array.from({ length: total }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.chip,
              { backgroundColor: i <= current ? accent : colors.border },
            ]}
          />
        ))}
      </View>

      {/* Category tag */}
      {categoryTag ? (
        <View style={[styles.tag, { backgroundColor: accent + '20' }]}>
          <Text
            style={[styles.tagText, { color: accent, fontSize: fs.sm }]}
          >
            {categoryTag}
          </Text>
        </View>
      ) : null}

      {/* Question */}
      <Text
        style={[
          styles.question,
          { color: colors.foreground, fontSize: fs.scaled(22) },
        ]}
      >
        {question}
      </Text>

      {/* Body */}
      <View style={styles.body}>{children}</View>

      {/* Buttons — paddingBottom aqui (e não no FormKeyboardView pai): o
          KeyboardAvoidingView behavior="padding" sobrescreve o paddingBottom
          do próprio style, zerando-o com o teclado fechado. */}
      <View style={[styles.buttonRow, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        {secondaryAction ? (
          <PressableScale
            onPress={secondaryAction}
            accessibilityRole="button"
            accessibilityLabel={secondaryA11yLabel}
            style={({ pressed }) => [
              styles.button,
              styles.ghostButton,
              { borderColor: colors.muted, backgroundColor: colors.surface, minHeight: fs.touch(56) },
              pressed && { opacity: 0.8 },
            ]}
          >
            <Text
              style={[
                styles.buttonText,
                { color: colors.foreground, fontSize: fs.md },
              ]}
            >
              {secondaryLabel}
            </Text>
          </PressableScale>
        ) : null}

        <PressableScale
          onPress={onNext}
          disabled={nextDisabled}
          accessibilityRole="button"
          accessibilityLabel={primaryLabel}
          style={({ pressed }) => [
            styles.button,
            styles.primaryButton,
            { backgroundColor: colors.primarySurface, minHeight: fs.touch(56) },
            nextDisabled && { opacity: 0.5 },
            pressed && !nextDisabled && { opacity: 0.9 },
          ]}
        >
          <Text
            style={[
              styles.buttonText,
              { color: colors.onPrimary, fontSize: fs.md },
            ]}
          >
            {primaryLabel}
          </Text>
        </PressableScale>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: 18,
  },
  stepper: {
    flexDirection: 'row',
    gap: 6,
  },
  chip: {
    flex: 1,
    height: 6,
    borderRadius: 3,
  },
  tag: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
  },
  tagText: {
    fontFamily: BrandFonts.body,
    fontWeight: '700',
  },
  question: {
    fontFamily: BrandFonts.body,
    fontWeight: '900',
  },
  body: {
    flex: 1,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    paddingHorizontal: 16,
  },
  ghostButton: {
    borderWidth: 2,
  },
  primaryButton: {
    borderWidth: 0,
    flex: 1.5,
  },
  buttonText: {
    fontFamily: BrandFonts.body,
    fontWeight: '800',
  },
});
