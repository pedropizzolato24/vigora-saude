import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CaregiverEmptyState } from '@/components/caregiver-empty-state';
import { ScreenContainer } from '@/components/screen-container';
import { useColors } from '@/hooks/use-colors';
import { useCaregiverContext } from '@/lib/caregiver-context';

function initialsOf(name: string): string {
  return name
    .split(/\s+/).filter(Boolean).slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? '').join('') || '?';
}

export default function CaregiverHomeScreen() {
  const colors = useColors();
  const router = useRouter();
  const { state } = useCaregiverContext();
  const linked = state.linkedMonitored;

  if (!linked) {
    return (
      <ScreenContainer>
        <CaregiverEmptyState
          icon="link"
          title="Vincule uma pessoa monitorada para começar"
          description="Você vai acompanhar a saúde dessa pessoa e receber alertas importantes."
          ctaLabel="Vincular agora"
          onCtaPress={() => router.push('/(caregiver-tabs)/link')}
        />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.hero, { backgroundColor: colors.primary }]}>
          <View style={styles.heroAvatar}>
            <Text style={styles.heroAvatarText}>{initialsOf(linked.displayName)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroName}>{linked.displayName}</Text>
            {linked.relationship ? (
              <Text style={styles.heroRel}>{linked.relationship}</Text>
            ) : null}
            <Text style={styles.heroStatus}>Aguardando sincronização com o app</Text>
          </View>
        </View>

        <SummaryCard icon="medication" title="Próxima medicação" body="Sem dados ainda." />
        <SummaryCard icon="favorite" title="Última métrica" body="Sem dados ainda." />
        <SummaryCard icon="wifi" title="Último heartbeat" body="Sem dados ainda." />

        <Pressable
          onPress={() => router.push('/(caregiver-tabs)/alerts')}
          style={({ pressed }) => [
            styles.alertsLink,
            { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <MaterialIcons name="notifications" size={22} color={colors.primary} />
          <Text style={[styles.alertsLinkText, { color: colors.foreground }]}>Alertas recentes</Text>
          <MaterialIcons name="chevron-right" size={22} color={colors.muted} />
        </Pressable>
      </ScrollView>
    </ScreenContainer>
  );
}

function SummaryCard({
  icon, title, body,
}: { icon: React.ComponentProps<typeof MaterialIcons>['name']; title: string; body: string }) {
  const colors = useColors();
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.cardHeader}>
        <MaterialIcons name={icon} size={22} color={colors.primary} />
        <Text style={[styles.cardTitle, { color: colors.foreground }]}>{title}</Text>
      </View>
      <Text style={[styles.cardBody, { color: colors.muted }]}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  hero: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    padding: 16, borderRadius: 18,
  },
  heroAvatar: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  heroAvatarText: { color: '#FFFFFF', fontSize: 20, fontWeight: '800' },
  heroName: { color: '#FFFFFF', fontSize: 19, fontWeight: '800' },
  heroRel: { color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: 2 },
  heroStatus: { color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 6 },
  card: { padding: 14, borderRadius: 14, borderWidth: 1, gap: 6 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { fontSize: 16, fontWeight: '700' },
  cardBody: { fontSize: 13, lineHeight: 18 },
  alertsLink: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 14, borderRadius: 14, borderWidth: 1,
  },
  alertsLinkText: { flex: 1, fontSize: 15, fontWeight: '700' },
});
