import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CaregiverEmptyState } from '@/components/caregiver-empty-state';
import { ScreenContainer } from '@/components/screen-container';
import { useColors } from '@/hooks/use-colors';
import { useCaregiverContext } from '@/lib/caregiver-context';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FadeInView, ScaleInView, StaggeredItem } from '@/components/animated-components';
import { trpc } from '@/lib/trpc';
import type { Alarm, HealthMetric } from '@/lib/app-context';
import { formatMetricValue, isRecent, latestMetric, metricTypeLabel, nextAlarm, relativeTime } from '@/lib/caregiver-format';

function initialsOf(name: string): string {
  return name
    .split(/\s+/).filter(Boolean).slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? '').join('') || '?';
}

export default function CaregiverHomeScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { state } = useCaregiverContext();
  const linked = state.linkedMonitored;

  const monitored = trpc.link.getMonitoredData.useQuery(undefined, { enabled: !!linked });
  const data = monitored.data;
  const loading = monitored.isLoading;

  const alarms = (data?.alarms ?? []) as Alarm[];
  const metrics = (data?.healthMetrics ?? []) as HealthMetric[];
  const upcoming = nextAlarm(alarms);
  const latest = latestMetric(metrics);
  const hb = data?.lastHeartbeatAt ?? null;

  const nextMedBody = loading
    ? 'Carregando…'
    : upcoming
    ? `${upcoming.time} — ${upcoming.description || 'Medicação'}`
    : 'Nenhum alarme ativo.';
  const latestMetricBody = loading
    ? 'Carregando…'
    : latest
    ? `${metricTypeLabel(latest.type)}: ${formatMetricValue(latest)} · ${relativeTime(latest.timestamp)}`
    : 'Sem registros ainda.';
  const heartbeatBody = loading ? 'Carregando…' : hb ? relativeTime(hb) : 'Sem sinal ainda.';
  const statusLine = hb
    ? isRecent(hb)
      ? 'Ativo recentemente'
      : `Visto ${relativeTime(hb)}`
    : 'Aguardando primeiro sinal';

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
    <ScreenContainer edges={['left', 'right']}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 16 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Cabeçalho — Jakub enter: OCCASIONAL (once per app open) */}
        <FadeInView delay={0} duration={320} style={styles.pageHeader}>
          <Text style={[styles.pageLabel, { color: colors.muted, fontFamily: 'PlusJakartaSans' }]}>
            Acompanhando
          </Text>
          <Text style={[styles.pageTitle, { color: colors.primary, fontFamily: 'Fraunces-Italic', fontStyle: 'italic' }]}>
            {linked.displayName}
          </Text>
        </FadeInView>

        {/* Person card — ScaleInView: card "materializa" com escala suave */}
        <ScaleInView delay={60} duration={300}>
          <View style={[styles.personCard, { backgroundColor: colors.primary }]}>
            <View style={styles.avatarRow}>
              <View style={[styles.avatar, { backgroundColor: 'rgba(244,239,229,0.2)' }]}>
                <Text style={[styles.avatarText, { color: colors.background }]}>
                  {initialsOf(linked.displayName)}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                {linked.relationship ? (
                  <Text style={[styles.relationship, { color: 'rgba(244,239,229,0.75)', fontFamily: 'PlusJakartaSans' }]}>
                    {linked.relationship}
                  </Text>
                ) : null}
                <Text style={[styles.statusLine, { color: 'rgba(244,239,229,0.85)', fontFamily: 'PlusJakartaSans' }]}>
                  {statusLine}
                </Text>
              </View>
              <View style={[styles.statusDot, { backgroundColor: 'rgba(244,239,229,0.4)' }]} />
            </View>
          </View>
        </ScaleInView>

        {/* Summary cards — staggered (3 cards, 80ms apart) */}
        <StaggeredItem index={0} staggerDelay={80}>
          <SummaryCard
            icon="medication"
            title="Próxima medicação"
            body={nextMedBody}
            colors={colors}
          />
        </StaggeredItem>
        <StaggeredItem index={1} staggerDelay={80}>
          <SummaryCard
            icon="favorite"
            title="Última métrica registrada"
            body={latestMetricBody}
            colors={colors}
          />
        </StaggeredItem>
        <StaggeredItem index={2} staggerDelay={80}>
          <SummaryCard
            icon="wifi"
            title="Último heartbeat"
            body={heartbeatBody}
            colors={colors}
            mono
          />
        </StaggeredItem>

        {/* Link para alertas */}
        <Pressable
          onPress={() => router.push('/(caregiver-tabs)/alerts')}
          style={({ pressed }) => [
            styles.alertsLink,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              opacity: pressed ? 0.85 : 1,
              transform: [{ scale: pressed ? 0.98 : 1 }],
            },
          ]}
          accessibilityRole="button"
        >
          <View style={[styles.alertIconWrap, { backgroundColor: colors.primaryLight }]}>
            <MaterialIcons name="notifications" size={20} color={colors.primary} />
          </View>
          <Text style={[styles.alertsLinkText, { color: colors.foreground, fontFamily: 'PlusJakartaSans' }]}>
            Alertas recentes
          </Text>
          <MaterialIcons name="chevron-right" size={20} color={colors.muted} />
        </Pressable>
      </ScrollView>
    </ScreenContainer>
  );
}

type SummaryCardProps = {
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  title: string;
  body: string;
  colors: ReturnType<typeof useColors>;
  mono?: boolean;
};

function SummaryCard({ icon, title, body, colors, mono }: SummaryCardProps) {
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.cardHeader}>
        <View style={[styles.cardIconWrap, { backgroundColor: colors.primaryLight }]}>
          <MaterialIcons name={icon} size={18} color={colors.primary} />
        </View>
        <Text style={[styles.cardTitle, { color: colors.foreground, fontFamily: 'PlusJakartaSans' }]}>
          {title}
        </Text>
      </View>
      <Text style={[
        styles.cardBody,
        {
          color: colors.muted,
          fontFamily: mono ? 'SpaceMono-Regular' : 'PlusJakartaSans',
          fontSize: mono ? 13 : 14,
        },
      ]}>
        {body}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 20,
    paddingBottom: 32,
    gap: 12,
  },
  pageHeader: {
    paddingHorizontal: 4,
    marginBottom: 4,
  },
  pageLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  pageTitle: {
    fontSize: 30,
    fontWeight: '700',
    letterSpacing: -0.3,
    lineHeight: 36,
  },
  personCard: {
    borderRadius: 18,
    padding: 18,
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: 'PlusJakartaSans',
    fontSize: 18,
    fontWeight: '700',
  },
  relationship: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 2,
  },
  statusLine: {
    fontSize: 13,
    fontWeight: '500',
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  card: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    gap: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cardIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  cardBody: {
    lineHeight: 20,
    paddingLeft: 42,
  },
  alertsLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 4,
  },
  alertIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertsLinkText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
  },
});
