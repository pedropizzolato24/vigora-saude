import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
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
  nextLabel,
  nextDisabled,
}: WizardStepProps) {
  const colors = useColors();
  const fs = useFontSize();
  const accent = tagColor ?? colors.primary;
  const primaryLabel = nextLabel ?? 'Continuar';

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

      {/* Buttons */}
      <View style={styles.buttonRow}>
        {onBack ? (
          <Pressable
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel="Voltar para a pergunta anterior"
            style={({ pressed }) => [
              styles.button,
              styles.ghostButton,
              { borderColor: colors.border },
              pressed && { opacity: 0.8 },
            ]}
          >
            <Text
              style={[
                styles.buttonText,
                { color: colors.foreground, fontSize: fs.md },
              ]}
            >
              Voltar
            </Text>
          </Pressable>
        ) : null}

        <Pressable
          onPress={onNext}
          disabled={nextDisabled}
          accessibilityRole="button"
          accessibilityLabel={primaryLabel}
          style={({ pressed }) => [
            styles.button,
            styles.primaryButton,
            { backgroundColor: colors.primary },
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
        </Pressable>
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
    minHeight: 56,
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
  },
  buttonText: {
    fontFamily: BrandFonts.body,
    fontWeight: '800',
  },
});
