/**
 * caregiver-empty-state.tsx
 *
 * Reusable "aguardando vínculo" empty state shown on caregiver tabs when
 * no monitored person is linked yet. Optionally renders a primary CTA.
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/use-colors';

interface Props {
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  title: string;
  description?: string;
  ctaLabel?: string;
  onCtaPress?: () => void;
}

export function CaregiverEmptyState({ icon, title, description, ctaLabel, onCtaPress }: Props) {
  const colors = useColors();
  return (
    <View style={styles.container}>
      <View style={[styles.iconCircle, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <MaterialIcons name={icon} size={56} color={colors.primary} />
      </View>
      <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
      {description ? (
        <Text style={[styles.description, { color: colors.muted }]}>{description}</Text>
      ) : null}
      {ctaLabel && onCtaPress ? (
        <Pressable
          onPress={onCtaPress}
          style={({ pressed }) => [
            styles.cta,
            { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <Text style={[styles.ctaText, { color: colors.onPrimary }]}>{ctaLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 14 },
  iconCircle: {
    width: 112, height: 112, borderRadius: 56,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, marginBottom: 8,
  },
  title: { fontSize: 22, fontWeight: '800', textAlign: 'center' },
  description: { fontSize: 15, textAlign: 'center', lineHeight: 22, maxWidth: 320 },
  cta: {
    marginTop: 12, paddingVertical: 14, paddingHorizontal: 28,
    borderRadius: 14, minWidth: 200, alignItems: 'center',
  },
  ctaText: { fontSize: 16, fontWeight: '700' },
});
