import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import React from 'react';
import { Platform, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useColors } from '@/hooks/use-colors';

interface MicFabProps {
  bottomOffset: number;
  onPress?: () => void;
}

export function MicFab({ bottomOffset, onPress }: MicFabProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const handlePress = onPress ?? (() => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      Speech.speak('Diga o que você precisa', { language: 'pt-BR' });
    }
  });

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel="Assistente de voz. Toque e diga o que você precisa."
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
      <MaterialIcons name="mic" size={28} color={colors.onPrimary} />
    </Pressable>
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
});
