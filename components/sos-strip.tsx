import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
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
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Botão de emergência. Segure três segundos para chamar ajuda."
      style={({ pressed }) => [
        styles.container,
        {
          backgroundColor: colors.emergency,
          borderBottomColor: colors.emergencyDark,
          shadowColor: colors.emergency,
        },
        pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
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
    </Pressable>
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
