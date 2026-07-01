import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CaregiverEmptyState } from '@/components/caregiver-empty-state';
import { ScreenContainer } from '@/components/screen-container';
import { useColors } from '@/hooks/use-colors';
import { useFontSize } from '@/lib/font-size-context';
import { useAccessibility } from '@/lib/accessibility-context';
import { BrandFonts } from '@/lib/_core/theme';
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
  const fs = useFontSize();
  const { isAccessibilityMode, a11yColors: ac, a11yFontSize: af } = useAccessibility();
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
      <ScreenContainer containerStyle={isAccessibilityMode ? { backgroundColor: ac.background } : undefined}>
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

  // --- Accessibility Mode ---------------------------------------------------
  if (isAccessibilityMode) {
    const A11ySummary = ({ icon, title, body, mono }: { icon: React.ComponentProps<typeof MaterialIcons>['name']; title: string; body: string; mono?: boolean }) => (
      <View style={{ backgroundColor: ac.surface, borderRadius: 16, borderWidth: 2, borderColor: ac.border, padding: 18, gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View style={{ width: 60, height: 60, borderRadius: 14, backgroundColor: ac.primary + '15', alignItems: 'center', justifyContent: 'center' }}>
            <MaterialIcons name={icon} size={30} color={ac.primary} />
          </View>
          <Text style={{ flex: 1, fontSize: af.md, fontWeight: '800', color: ac.foreground, fontFamily: BrandFonts.body }}>{title}</Text>
        </View>
        <Text style={{ fontSize: mono ? af.base : af.md, color: ac.foreground, fontFamily: mono ? BrandFonts.monoRegular : BrandFonts.body, lineHeight: af.md * 1.4 }}>
          {body}
        </Text>
      </View>
    );

    return (
      <ScreenContainer edges={['left', 'right']} containerStyle={{ backgroundColor: ac.background }}>
        <View style={{ paddingHorizontal: 20, paddingTop: insets.top + 12, paddingBottom: 16, borderBottomWidth: 2, borderBottomColor: ac.border, backgroundColor: ac.bar }}>
          <Text style={{ fontSize: af.sm, color: ac.muted, fontFamily: BrandFonts.body, fontWeight: '600' }}>Acompanhando</Text>
          <Text style={{ fontSize: af['2xl'], fontWeight: '900', color: ac.primary, fontFamily: BrandFonts.body }}>
            {linked.displayName}
          </Text>
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 16, gap: 12 }} showsVerticalScrollIndicator={false}>
          <View style={{ backgroundColor: ac.primary, borderRadius: 20, padding: 20, flexDirection: 'row', alignItems: 'center', gap: 16 }}>
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: ac.onPrimary + '22', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: ac.onPrimary, fontSize: af.xl, fontWeight: '800', fontFamily: BrandFonts.body }}>{initialsOf(linked.displayName)}</Text>
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              {linked.relationship ? (
                <Text style={{ color: ac.onPrimary + 'CC', fontSize: af.sm, fontFamily: BrandFonts.body, fontWeight: '600' }}>{linked.relationship}</Text>
              ) : null}
              <Text style={{ color: ac.onPrimary, fontSize: af.md, fontFamily: BrandFonts.body, fontWeight: '700' }}>{statusLine}</Text>
            </View>
          </View>

          <A11ySummary icon="medication" title="Próxima medicação" body={nextMedBody} />
          <A11ySummary icon="favorite" title="Última métrica registrada" body={latestMetricBody} />
          <A11ySummary icon="wifi" title="Último heartbeat" body={heartbeatBody} mono />

          <Pressable
            onPress={() => router.push('/(caregiver-tabs)/alerts')}
            accessibilityRole="button"
            accessibilityLabel="Alertas recentes"
            style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: ac.surface, borderColor: ac.border, borderWidth: 2, borderRadius: 16, padding: 18, minHeight: 72, opacity: pressed ? 0.85 : 1 }]}
          >
            <View style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: ac.primary + '15', alignItems: 'center', justifyContent: 'center' }}>
              <MaterialIcons name="notifications" size={28} color={ac.primary} />
            </View>
            <Text style={{ flex: 1, color: ac.foreground, fontSize: af.md, fontWeight: '800', fontFamily: BrandFonts.body }}>Alertas recentes</Text>
            <MaterialIcons name="chevron-right" size={28} color={ac.muted} />
          </Pressable>
        </ScrollView>
      </ScreenContainer>
    );
  }

  // --- Normal Mode ----------------------------------------------------------
  return (
    <ScreenContainer edges={['left', 'right']}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 16 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Cabeçalho — Jakub enter: OCCASIONAL (once per app open) */}
        <FadeInView delay={0} duration={320} style={styles.pageHeader}>
          <Text style={[styles.pageLabel, { color: colors.muted, fontSize: fs.sm, fontFamily: BrandFonts.body }]}>
            Acompanhando
          </Text>
          <Text style={[styles.pageTitle, { color: colors.primary, fontSize: fs.scaled(30), fontFamily: BrandFonts.display, fontStyle: 'italic' }]}>
            {linked.displayName}
          </Text>
        </FadeInView>

        {/* Person card — ScaleInView: card "materializa" com escala suave */}
        <ScaleInView delay={60} duration={300}>
          <View style={[styles.personCard, { backgroundColor: colors.primary }]}>
            <View style={styles.avatarRow}>
              <View style={[styles.avatar, { backgroundColor: colors.onPrimary + '33' }]}>
                <Text style={[styles.avatarText, { color: colors.onPrimary, fontSize: fs.lg }]}>
                  {initialsOf(linked.displayName)}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                {linked.relationship ? (
                  <Text style={[styles.relationship, { color: colors.onPrimary + 'BF', fontSize: fs.scaled(12), fontFamily: BrandFonts.body }]}>
                    {linked.relationship}
                  </Text>
                ) : null}
                <Text style={[styles.statusLine, { color: colors.onPrimary + 'D9', fontSize: fs.sm, fontFamily: BrandFonts.body }]}>
                  {statusLine}
                </Text>
              </View>
              <View style={[styles.statusDot, { backgroundColor: colors.onPrimary + '66' }]} />
            </View>
          </View>
        </ScaleInView>

        {/* Summary cards — staggered (3 cards, 80ms apart) */}
        <StaggeredItem index={0} staggerDelay={80}>
          <SummaryCard icon="medication" title="Próxima medicação" body={nextMedBody} colors={colors} fs={fs} />
        </StaggeredItem>
        <StaggeredItem index={1} staggerDelay={80}>
          <SummaryCard icon="favorite" title="Última métrica registrada" body={latestMetricBody} colors={colors} fs={fs} />
        </StaggeredItem>
        <StaggeredItem index={2} staggerDelay={80}>
          <SummaryCard icon="wifi" title="Último heartbeat" body={heartbeatBody} colors={colors} fs={fs} mono />
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
          <Text style={[styles.alertsLinkText, { color: colors.foreground, fontSize: fs.base, fontFamily: BrandFonts.body }]}>
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
  fs: ReturnType<typeof useFontSize>;
  mono?: boolean;
};

function SummaryCard({ icon, title, body, colors, fs, mono }: SummaryCardProps) {
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.cardHeader}>
        <View style={[styles.cardIconWrap, { backgroundColor: colors.primaryLight }]}>
          <MaterialIcons name={icon} size={18} color={colors.primary} />
        </View>
        <Text style={[styles.cardTitle, { color: colors.foreground, fontSize: fs.base, fontFamily: BrandFonts.body }]}>
          {title}
        </Text>
      </View>
      <Text style={[
        styles.cardBody,
        {
          color: colors.muted,
          fontFamily: mono ? BrandFonts.monoRegular : BrandFonts.body,
          fontSize: mono ? fs.sm : fs.scaled(14),
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
    fontWeight: '500',
  },
  pageTitle: {
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
    fontWeight: '700',
  },
  relationship: {
    fontWeight: '500',
    marginBottom: 2,
  },
  statusLine: {
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
    fontWeight: '600',
  },
});
