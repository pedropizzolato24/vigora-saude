import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CaregiverEmptyState } from '@/components/caregiver-empty-state';
import { ScreenContainer } from '@/components/screen-container';
import { useColors } from '@/hooks/use-colors';
import { useFontSize } from '@/lib/font-size-context';
import { useAccessibility } from '@/lib/accessibility-context';
import { BrandFonts } from '@/lib/_core/theme';
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

const FILTERS: Filter[] = ['all', 'critical', 'warning'];
const filterLabel = (f: Filter) => (f === 'all' ? 'Todos' : f === 'critical' ? 'Críticos' : 'Avisos');

export default function CaregiverAlertsScreen() {
  const colors = useColors();
  const fs = useFontSize();
  const insets = useSafeAreaInsets();
  const { isAccessibilityMode, a11yColors: ac, a11yFontSize: af } = useAccessibility();
  const router = useRouter();
  const { state } = useCaregiverContext();
  const linked = state.linkedMonitored;
  const [filter, setFilter] = useState<Filter>('all');

  const alerts = trpc.link.getMonitoredAlerts.useQuery(undefined, { enabled: !!linked });

  if (!linked) {
    return (
      <ScreenContainer containerStyle={isAccessibilityMode ? { backgroundColor: ac.background } : undefined}>
        <CaregiverEmptyState
          icon="notifications-none"
          title="Sem vínculo ativo"
          description="Vincule uma pessoa acompanhada para receber alertas."
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

  // --- Accessibility Mode ---------------------------------------------------
  if (isAccessibilityMode) {
    return (
      <ScreenContainer edges={['left', 'right']} containerStyle={{ backgroundColor: ac.background }}>
        <View style={{ paddingHorizontal: 20, paddingTop: insets.top + 12, paddingBottom: 16, borderBottomWidth: 2, borderBottomColor: ac.border, backgroundColor: ac.bar }}>
          <Text style={{ fontSize: af['2xl'], fontWeight: '900', color: ac.foreground, fontFamily: BrandFonts.body }}>Alertas</Text>
          <Text style={{ fontSize: af.sm, color: ac.muted, marginTop: 4, fontFamily: BrandFonts.body }}>{items.length} recente(s)</Text>
        </View>

        <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingTop: 14 }}>
          {FILTERS.map((f) => {
            const selected = filter === f;
            return (
              <Pressable
                key={f}
                onPress={() => setFilter(f)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                style={({ pressed }) => [{ paddingVertical: 12, paddingHorizontal: 16, borderRadius: 14, borderWidth: 2, minHeight: 56, justifyContent: 'center', backgroundColor: selected ? ac.primary : ac.surface, borderColor: selected ? ac.primary : ac.border, opacity: pressed ? 0.85 : 1 }]}
              >
                <Text style={{ fontSize: af.sm, fontWeight: '800', color: selected ? ac.onPrimary : ac.foreground, fontFamily: BrandFonts.body }}>{filterLabel(f)}</Text>
              </Pressable>
            );
          })}
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, gap: 12 }} showsVerticalScrollIndicator={false}>
          {alerts.isLoading ? (
            <ActivityIndicator color={ac.primary} style={{ marginTop: 24 }} />
          ) : filtered.length === 0 ? (
            <View style={{ padding: 20, borderRadius: 16, borderWidth: 2, backgroundColor: ac.surface, borderColor: ac.border, alignItems: 'center', gap: 12 }}>
              <MaterialIcons name="check-circle" size={40} color={ac.success} />
              <Text style={{ fontSize: af.md, fontWeight: '800', color: ac.foreground, textAlign: 'center', fontFamily: BrandFonts.body }}>Nenhum alerta recente</Text>
              <Text style={{ fontSize: af.sm, color: ac.muted, lineHeight: af.sm * 1.5, textAlign: 'center', fontFamily: BrandFonts.body }}>
                Você verá aqui medicação perdida, alarmes não enviados e avisos do dead man&apos;s switch.
              </Text>
            </View>
          ) : (
            filtered.map((item) => {
              const accent = item.severity === 'critical' ? ac.error : ac.warning;
              return (
                <View key={item.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18, borderRadius: 16, borderWidth: 2, backgroundColor: ac.surface, borderColor: ac.border }}>
                  <View style={{ width: 56, height: 56, borderRadius: 14, backgroundColor: accent + '20', alignItems: 'center', justifyContent: 'center' }}>
                    <MaterialIcons name={item.icon} size={30} color={accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: af.md, fontWeight: '800', color: ac.foreground, fontFamily: BrandFonts.body }}>{item.title}</Text>
                    <Text style={{ fontSize: af.sm, color: ac.muted, marginTop: 2, fontFamily: BrandFonts.body }}>{item.subtitle}</Text>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      </ScreenContainer>
    );
  }

  // --- Normal Mode ----------------------------------------------------------
  return (
    <ScreenContainer edges={['left', 'right']}>
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground, fontSize: fs.scaled(26), fontFamily: BrandFonts.body }]}>Alertas</Text>
        <Text style={[styles.headerSub, { color: colors.muted, fontSize: fs.sm, fontFamily: BrandFonts.body }]}>{items.length} recente(s)</Text>
      </View>

      <View style={styles.filters}>
        {FILTERS.map((f) => {
          const selected = filter === f;
          return (
            <Pressable
              key={f}
              onPress={() => setFilter(f)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              style={({ pressed }) => [
                styles.filter,
                {
                  backgroundColor: selected ? colors.primary : colors.surface,
                  borderColor: selected ? colors.primary : colors.border,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <Text style={[styles.filterText, { color: selected ? colors.onPrimary : colors.foreground, fontSize: fs.sm, fontFamily: BrandFonts.body }]}>
                {filterLabel(f)}
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
            <Text style={[styles.explainerTitle, { color: colors.foreground, fontSize: fs.lg, fontFamily: BrandFonts.body }]}>Nenhum alerta recente</Text>
            <Text style={[styles.explainerBody, { color: colors.muted, fontSize: fs.scaled(14), fontFamily: BrandFonts.body }]}>
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
                  <Text style={[styles.alertTitle, { color: colors.foreground, fontSize: fs.base, fontFamily: BrandFonts.body }]}>{item.title}</Text>
                  <Text style={[styles.alertSubtitle, { color: colors.muted, fontSize: fs.sm, fontFamily: BrandFonts.body }]}>{item.subtitle}</Text>
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
  header: { paddingHorizontal: 20, paddingBottom: 4 },
  headerTitle: { fontWeight: '800' },
  headerSub: { fontWeight: '500', marginTop: 2 },
  filters: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingTop: 12 },
  filter: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1 },
  filterText: { fontWeight: '600' },
  body: { padding: 20, gap: 12 },
  explainer: { padding: 18, borderRadius: 14, borderWidth: 1, alignItems: 'center', gap: 10 },
  explainerTitle: { fontWeight: '700', textAlign: 'center' },
  explainerBody: { lineHeight: 20, textAlign: 'center' },
  alertCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, borderWidth: 1 },
  alertIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  alertTitle: { fontWeight: '700' },
  alertSubtitle: { marginTop: 2 },
});
