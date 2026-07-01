/**
 * caregiver-empty-state.tsx
 *
 * Reusable "aguardando vínculo" empty state shown on caregiver tabs when
 * no monitored person is linked yet. Optionally renders a primary CTA.
 *
 * Segue as convenções das telas do monitorado: tokens useColors, escala de
 * fonte (useFontSize), BrandFonts e variante de modo acessível (paleta ac,
 * fontes af e touch target ampliado).
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/use-colors';
import { useFontSize } from '@/lib/font-size-context';
import { useAccessibility } from '@/lib/accessibility-context';
import { BrandFonts } from '@/lib/_core/theme';

interface Props {
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  title: string;
  description?: string;
  ctaLabel?: string;
  onCtaPress?: () => void;
}

export function CaregiverEmptyState({ icon, title, description, ctaLabel, onCtaPress }: Props) {
  const colors = useColors();
  const fs = useFontSize();
  const { isAccessibilityMode, a11yColors: ac, a11yFontSize: af, a11ySpacing: as_ } = useAccessibility();

  const c = isAccessibilityMode
    ? { surface: ac.surface, border: ac.border, foreground: ac.foreground, muted: ac.muted, primary: ac.primary, onPrimary: ac.onPrimary }
    : { surface: colors.surface, border: colors.border, foreground: colors.foreground, muted: colors.muted, primary: colors.primary, onPrimary: colors.onPrimary };

  const iconCircleSize = isAccessibilityMode ? 140 : 112;
  const iconSize = isAccessibilityMode ? 72 : 56;
  const borderWidth = isAccessibilityMode ? 2 : 1;

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.iconCircle,
          { width: iconCircleSize, height: iconCircleSize, borderRadius: iconCircleSize / 2, backgroundColor: c.surface, borderColor: c.border, borderWidth },
        ]}
      >
        <MaterialIcons name={icon} size={iconSize} color={c.primary} />
      </View>
      <Text style={[styles.title, { color: c.foreground, fontSize: isAccessibilityMode ? af['2xl'] : fs.scaled(22), fontFamily: BrandFonts.body }]}>
        {title}
      </Text>
      {description ? (
        <Text style={[styles.description, { color: c.muted, fontSize: isAccessibilityMode ? af.md : fs.base, lineHeight: (isAccessibilityMode ? af.md : fs.base) * 1.45, fontFamily: BrandFonts.body }]}>
          {description}
        </Text>
      ) : null}
      {ctaLabel && onCtaPress ? (
        <Pressable
          onPress={onCtaPress}
          accessibilityRole="button"
          accessibilityLabel={ctaLabel}
          style={({ pressed }) => [
            styles.cta,
            { backgroundColor: c.primary, opacity: pressed ? 0.8 : 1, minHeight: isAccessibilityMode ? as_.touchTarget : 48 },
          ]}
        >
          <Text style={[styles.ctaText, { color: c.onPrimary, fontSize: isAccessibilityMode ? af.md : fs.md, fontFamily: BrandFonts.body }]}>
            {ctaLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 14 },
  iconCircle: {
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 8,
  },
  title: { fontWeight: '800', textAlign: 'center' },
  description: { textAlign: 'center', maxWidth: 340 },
  cta: {
    marginTop: 12, paddingVertical: 14, paddingHorizontal: 28,
    borderRadius: 14, minWidth: 200, alignItems: 'center', justifyContent: 'center',
  },
  ctaText: { fontWeight: '700' },
});
