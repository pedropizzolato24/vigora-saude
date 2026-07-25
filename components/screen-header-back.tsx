import React from 'react';
import { Platform, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useColors } from '@/hooks/use-colors';
import { useAccessibility } from '@/lib/accessibility-context';

interface ScreenHeaderBackProps {
  /** Rota usada quando não há histórico para voltar (ex.: deep link direto). */
  fallbackRoute?: string;
}

/**
 * Botão "voltar" padrão do cabeçalho das telas secundárias (as que não estão
 * no menu inferior). Touch target 44px (60px no modo acessível), cores via
 * tokens nos dois temas.
 */
export function ScreenHeaderBack({ fallbackRoute = '/(tabs)' }: ScreenHeaderBackProps) {
  const router = useRouter();
  const colors = useColors();
  const { isAccessibilityMode, a11yColors: ac } = useAccessibility();
  const size = isAccessibilityMode ? 60 : 44;

  const handlePress = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(fallbackRoute as never);
    }
  };

  return (
    <Pressable
      onPress={handlePress}
      accessibilityLabel="Voltar"
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.button,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: isAccessibilityMode ? ac.surface : colors.surface,
          borderWidth: isAccessibilityMode ? 2 : 0,
          borderColor: isAccessibilityMode ? ac.border : undefined,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <MaterialIcons
        name="arrow-back"
        size={isAccessibilityMode ? 32 : 26}
        color={isAccessibilityMode ? ac.foreground : colors.foreground}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
