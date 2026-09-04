import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { PressableScale } from '@/components/pressable-scale';
import { useColors } from '@/hooks/use-colors';
import { useFontSize } from '@/lib/font-size-context';
import { BrandFonts } from '@/lib/_core/theme';

interface BigTileProps {
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  iconColor: string;
  iconBg: string;
  title: string;
  subtitle: string;
  badge?: string;
  onPress: () => void;
}

export function BigTile({
  icon,
  iconColor,
  iconBg,
  title,
  subtitle,
  badge,
  onPress,
}: BigTileProps) {
  const colors = useColors();
  const fs = useFontSize();

  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.98}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => [
        styles.container,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          shadowColor: colors.foreground,
          minHeight: fs.touch(132),
        },
        pressed && { opacity: 0.9 },
      ]}
    >
      <View style={styles.topRow}>
        <View style={[styles.iconWrap, { backgroundColor: iconBg }]}>
          <MaterialIcons name={icon} size={28} color={iconColor} />
        </View>
        {badge ? (
          <View style={[styles.badge, { backgroundColor: colors.emergencySurface }]}>
            <Text
              style={[
                styles.badgeText,
                { color: colors.onEmergency, fontSize: fs.xs },
              ]}
            >
              {badge}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.textWrap}>
        <Text
          style={[styles.title, { color: colors.foreground, fontSize: fs.md }]}
          numberOfLines={2}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text
            style={[styles.subtitle, { color: colors.muted, fontSize: fs.sm }]}
            numberOfLines={2}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
    </PressableScale>
  );
}

// Layout vertical (ícone acima do texto): os rótulos têm a largura inteira do
// tile e podem quebrar em 2 linhas — nada de "Meus re..." truncado.
const styles = StyleSheet.create({
  container: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 12,
    borderWidth: 2,
    borderRadius: 18,
    padding: 14,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrap: {
    alignSelf: 'stretch',
    gap: 2,
  },
  title: {
    fontFamily: BrandFonts.body,
    fontWeight: '800',
  },
  subtitle: {
    fontFamily: BrandFonts.body,
    fontWeight: '600',
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  badgeText: {
    fontFamily: BrandFonts.body,
    fontWeight: '800',
  },
});
