/**
 * PinKeypad / PinDots — teclado numérico e indicador de dígitos do PIN.
 *
 * Usados pela tela de bloqueio (components/app-lock-screen.tsx) e pelo fluxo
 * de criação de PIN (app/app-lock-setup.tsx). Sem TextInput de propósito:
 * teclado próprio com botões grandes para idosos (≥72px; maior no modo
 * acessível) e sem teclado do sistema sobrepondo a tela.
 */
import * as Haptics from 'expo-haptics';
import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useAccessibility } from '@/lib/accessibility-context';
import { useColors } from '@/hooks/use-colors';
import { BrandFonts } from '@/lib/_core/theme';
import { PIN_LENGTH } from '@/lib/app-lock-core';

// --- PinDots ------------------------------------------------------------------

export function PinDots({ filled, error = false }: { filled: number; error?: boolean }) {
  const colors = useColors();
  const { isAccessibilityMode } = useAccessibility();
  const size = isAccessibilityMode ? 22 : 16;

  return (
    <View style={styles.dotsRow} accessibilityLabel={`${filled} de ${PIN_LENGTH} dígitos`}>
      {Array.from({ length: PIN_LENGTH }).map((_, i) => {
        const isFilled = i < filled;
        return (
          <View
            key={i}
            style={{
              width: size,
              height: size,
              borderRadius: size / 2,
              borderWidth: 2,
              borderColor: error ? colors.error : isFilled ? colors.primary : colors.border,
              backgroundColor: error
                ? colors.error
                : isFilled
                  ? colors.primary
                  : 'transparent',
            }}
          />
        );
      })}
    </View>
  );
}

// --- PinKeypad ------------------------------------------------------------------

interface PinKeypadProps {
  onDigit: (digit: string) => void;
  onBackspace: () => void;
  /** Quando definido, mostra a tecla de biometria no canto inferior esquerdo. */
  onBiometric?: () => void;
  disabled?: boolean;
}

export function PinKeypad({ onDigit, onBackspace, onBiometric, disabled = false }: PinKeypadProps) {
  const colors = useColors();
  const { isAccessibilityMode, a11yFontSize: af } = useAccessibility();

  const keySize = isAccessibilityMode ? 84 : 72;
  const digitFontSize = isAccessibilityMode ? af.xl : 28;

  const pressKey = (action: () => void) => {
    if (disabled) return;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    action();
  };

  const renderDigit = (digit: string) => (
    <Pressable
      key={digit}
      onPress={() => pressKey(() => onDigit(digit))}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`Dígito ${digit}`}
      style={({ pressed }) => [
        styles.key,
        {
          width: keySize,
          height: keySize,
          borderRadius: keySize / 2,
          backgroundColor: colors.surface,
          borderColor: colors.border,
          opacity: disabled ? 0.4 : pressed ? 0.6 : 1,
        },
      ]}
    >
      <Text
        style={{
          fontSize: digitFontSize,
          fontWeight: '700',
          color: colors.foreground,
          fontFamily: BrandFonts.monoBold,
        }}
      >
        {digit}
      </Text>
    </Pressable>
  );

  return (
    <View style={styles.keypad}>
      {[
        ['1', '2', '3'],
        ['4', '5', '6'],
        ['7', '8', '9'],
      ].map((row) => (
        <View key={row[0]} style={styles.keypadRow}>
          {row.map(renderDigit)}
        </View>
      ))}
      <View style={styles.keypadRow}>
        {onBiometric ? (
          <Pressable
            onPress={() => pressKey(onBiometric)}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel="Desbloquear com biometria"
            style={({ pressed }) => [
              styles.key,
              {
                width: keySize,
                height: keySize,
                borderRadius: keySize / 2,
                backgroundColor: 'transparent',
                borderColor: 'transparent',
                opacity: disabled ? 0.4 : pressed ? 0.6 : 1,
              },
            ]}
          >
            <MaterialIcons
              name={Platform.OS === 'ios' ? 'face' : 'fingerprint'}
              size={isAccessibilityMode ? 44 : 36}
              color={colors.primary}
            />
          </Pressable>
        ) : (
          <View style={{ width: keySize, height: keySize }} />
        )}
        {renderDigit('0')}
        <Pressable
          onPress={() => pressKey(onBackspace)}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel="Apagar dígito"
          style={({ pressed }) => [
            styles.key,
            {
              width: keySize,
              height: keySize,
              borderRadius: keySize / 2,
              backgroundColor: 'transparent',
              borderColor: 'transparent',
              opacity: disabled ? 0.4 : pressed ? 0.6 : 1,
            },
          ]}
        >
          <MaterialIcons
            name="backspace"
            size={isAccessibilityMode ? 36 : 28}
            color={colors.muted}
          />
        </Pressable>
      </View>
    </View>
  );
}

// --- Estilos ------------------------------------------------------------------

const styles = StyleSheet.create({
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 18,
  },
  keypad: {
    gap: 14,
    alignItems: 'center',
  },
  keypadRow: {
    flexDirection: 'row',
    gap: 22,
  },
  key: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
});
