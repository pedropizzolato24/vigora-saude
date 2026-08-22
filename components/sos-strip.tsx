import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { PressableScale } from '@/components/pressable-scale';
import { useColors } from '@/hooks/use-colors';
import { useFontSize } from '@/lib/font-size-context';
import { BrandFonts } from '@/lib/_core/theme';

interface SosStripProps {
  onPress: () => void;
}

export function SosStrip({ onPress }: SosStripProps) {
  const colors = useColors();
  const fs = useFontSize();

  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.98}
      accessibilityRole="button"
      accessibilityLabel="Botão de emergência. Segure três segundos para chamar ajuda."
      style={({ pressed }) => [
        styles.container,
        {
          backgroundColor: colors.emergencySurface,
          borderBottomColor: colors.emergencyDark,
          shadowColor: colors.emergency,
        },
        pressed && { opacity: 0.9 },
      ]}
    >
      <MaterialIcons name="warning" size={36} color={colors.onEmergency} />
      <View style={styles.textWrap}>
        <Text
          style={[
            styles.title,
            { color: colors.onEmergency, fontSize: fs.scaled(32) },
          ]}
        >
          SOS
        </Text>
        <Text
          style={[
            styles.subtitle,
            { color: colors.onEmergency, fontSize: fs.sm },
          ]}
        >
          Toque para chamar ajuda
        </Text>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    borderRadius: 22,
    padding: 18,
    borderBottomWidth: 6,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 12,
  },
  textWrap: {
    flex: 1,
  },
  title: {
    fontFamily: BrandFonts.body,
    fontWeight: '900',
    letterSpacing: 2,
  },
  subtitle: {
    fontFamily: BrandFonts.body,
    fontWeight: '700',
  },
});
