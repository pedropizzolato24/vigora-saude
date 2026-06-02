import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CaregiverEmptyState } from '@/components/caregiver-empty-state';
import { ScreenContainer } from '@/components/screen-container';
import { useColors } from '@/hooks/use-colors';
import { useCaregiverContext } from '@/lib/caregiver-context';
import { trpc } from '@/lib/trpc';
import { relativeTime } from '@/lib/caregiver-format';

type Filter = 'all' | 'critical' | 'warning';

interface AlertItem {
  id: string;
  severity: 'critical' | 'warning';
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  title: string;
  subtitle: string;
  ts: number;
}

export default function CaregiverAlertsScreen() {
  const colors = useColors();
  const router = useRouter();
  const { state } = useCaregiverContext();
  const linked = state.linkedMonitored;
  const [filter, setFilter] = useState<Filter>('all');

  const alerts = trpc.link.getMonitoredAlerts.useQuery(undefined, { enabled: !!linked });

  if (!linked) {
    return (
      <ScreenContainer>
        <CaregiverEmptyState
          icon="notifications-none"
          title="Sem vínculo ativo"
          description="Vincule uma pessoa monitorada para receber alertas."
          ctaLabel="Vincular agora"
          onCtaPress={() => router.push('/(caregiver-tabs)/link')}
        />
      </ScreenContainer>
    );
  }

  const events = alerts.data?.events ?? [];
  const warnings = alerts.data?.warnings ?? [];

  const items: AlertItem[] = [
    ...events.map((e) => ({
      id: `event-${e.alarmId}-${e.scheduledAt}`,
      severity: 'critical' as const,
      icon: (e.status === 'missed' ? 'notification-important' : 'mobile-off') as AlertItem['icon'],
      title: e.status === 'missed' ? 'Alarme não respondido' : 'Alarme não enviado (offline)',
      subtitle: `${e.alarmDescription || 'Medicação'} · ${relativeTime(e.scheduledAt)}`,
      ts: e.scheduledAt,
    })),
    ...warnings.map((w) => ({
      id: `warning-${w.sentAt}-${w.level}`,
      severity: 'warning' as const,
      icon: 'warning' as AlertItem['icon'],
      title: `Alerta enviado aos contatos (nível ${w.level})`,
      subtitle: `${w.contactsReached} contato(s) avisado(s) · ${relativeTime(w.sentAt)}`,
      ts: w.sentAt,
    })),
  ].sort((a, b) => b.ts - a.ts);

  const filtered = items.filter((i) => filter === 'all' || i.severity === filter);

  return (
    <ScreenContainer>
      <View style={styles.filters}>
        {(['all', 'critical', 'warning'] as Filter[]).map((f) => {
          const selected = filter === f;
          const label = f === 'all' ? 'Todos' : f === 'critical' ? 'Críticos' : 'Avisos';
          return (
            <Pressable
              key={f}
              onPress={() => setFilter(f)}
              style={({ pressed }) => [
                styles.filter,
                {
                  backgroundColor: selected ? colors.primary : colors.surface,
                  borderColor: selected ? colors.primary : colors.border,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <Text style={[styles.filterText, { color: selected ? colors.onPrimary : colors.foreground }]}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {alerts.isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
        ) : filtered.length === 0 ? (
          <View style={[styles.explainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <MaterialIcons name="check-circle" size={28} color={colors.success} />
            <Text style={[styles.explainerTitle, { color: colors.foreground }]}>Nenhum alerta recente</Text>
            <Text style={[styles.explainerBody, { color: colors.muted }]}>
              Você verá aqui medicação perdida, alarmes não enviados e avisos do dead man&apos;s switch da pessoa
              que você acompanha.
            </Text>
          </View>
        ) : (
          filtered.map((item) => {
            const accent = item.severity === 'critical' ? colors.error : colors.warning;
            return (
              <View
                key={item.id}
                style={[styles.alertCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <View style={[styles.alertIcon, { backgroundColor: accent + '20' }]}>
                  <MaterialIcons name={item.icon} size={22} color={accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.alertTitle, { color: colors.foreground }]}>{item.title}</Text>
                  <Text style={[styles.alertSubtitle, { color: colors.muted }]}>{item.subtitle}</Text>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  filters: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 12 },
  filter: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1 },
  filterText: { fontSize: 13, fontWeight: '600' },
  body: { padding: 16, gap: 12 },
  explainer: { padding: 18, borderRadius: 14, borderWidth: 1, alignItems: 'center', gap: 10 },
  explainerTitle: { fontSize: 17, fontWeight: '700', textAlign: 'center' },
  explainerBody: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  alertCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, borderWidth: 1 },
  alertIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  alertTitle: { fontSize: 15, fontWeight: '700' },
  alertSubtitle: { fontSize: 13, marginTop: 2 },
});
