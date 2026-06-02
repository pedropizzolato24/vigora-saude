import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppDialog, useAppDialog } from '@/components/app-dialog';
import { CaregiverEmptyState } from '@/components/caregiver-empty-state';
import { ScreenContainer } from '@/components/screen-container';
import { useColors } from '@/hooks/use-colors';
import { useCaregiverContext } from '@/lib/caregiver-context';
import type { LinkMethod } from '@/lib/caregiver-state';
import { trpc } from '@/lib/trpc';
import type { Alarm, AnamnesesData, EmergencyContact, HealthMetric } from '@/lib/app-context';
import { formatMetricValue, isRecent, metricTypeLabel, relativeTime } from '@/lib/caregiver-format';

const METHOD_LABEL: Record<LinkMethod, string> = {
  code: 'código de convite',
  email_phone: 'email/telefone',
  qr: 'QR code',
  invite_link: 'link de convite',
};

function formatDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/).filter(Boolean).slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? '').join('') || '?';
}

export default function CaregiverPersonScreen() {
  const colors = useColors();
  const router = useRouter();
  const { state, clearLinkedMonitored } = useCaregiverContext();
  const linked = state.linkedMonitored;
  const { dialogProps, showDialog } = useAppDialog();
  const [menuOpen, setMenuOpen] = useState(false);

  const monitored = trpc.link.getMonitoredData.useQuery(undefined, { enabled: !!linked });
  const data = monitored.data;
  const loading = monitored.isLoading;

  if (!linked) {
    return (
      <ScreenContainer>
        <CaregiverEmptyState
          icon="person-add"
          title="Nenhuma pessoa monitorada ainda"
          description="Adicione a pessoa que você cuida para começar a acompanhar."
          ctaLabel="Vincular agora"
          onCtaPress={() => router.push('/(caregiver-tabs)/link')}
        />
      </ScreenContainer>
    );
  }

  const enabledAlarms = ((data?.alarms ?? []) as Alarm[]).filter((a) => a.enabled);
  const metrics = ([...((data?.healthMetrics ?? []) as HealthMetric[])])
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 5);
  const anamnesis = (data?.anamnesis ?? null) as AnamnesesData | null;
  const contacts = (data?.emergencyContacts ?? []) as EmergencyContact[];
  const hb = data?.lastHeartbeatAt ?? null;
  const loc = data?.lastLocation ?? null;
  const locAt = data?.lastLocationAt ?? null;

  const statusText = loading
    ? 'Carregando…'
    : hb
    ? isRecent(hb)
      ? 'Ativo recentemente'
      : `Visto ${relativeTime(hb)}`
    : 'Aguardando primeiro sinal';
  const statusColor = hb && isRecent(hb) ? colors.success : colors.warning;

  const openLocation = () => {
    if (!loc) return;
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(loc)}`;
    Linking.openURL(url).catch(() => {});
  };

  const confirmUnlink = () => {
    setMenuOpen(false);
    showDialog({
      title: 'Desvincular pessoa',
      message: `Você quer mesmo desvincular ${linked.displayName}? Você poderá vincular de novo a qualquer momento.`,
      variant: 'confirm',
      buttons: [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Desvincular', style: 'destructive', onPress: () => clearLinkedMonitored() },
      ],
    });
  };

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={[styles.header, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
            <Text style={[styles.avatarText, { color: colors.onPrimary }]}>{initialsOf(linked.displayName)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.name, { color: colors.foreground }]}>{linked.displayName}</Text>
            {linked.relationship ? (
              <Text style={[styles.relationship, { color: colors.muted }]}>{linked.relationship}</Text>
            ) : null}
            <View style={styles.statusRow}>
              <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
              <Text style={[styles.statusText, { color: colors.muted }]}>{statusText}</Text>
            </View>
          </View>
          <Pressable
            onPress={() => setMenuOpen((v) => !v)}
            hitSlop={8}
            style={({ pressed }) => [{ padding: 8, opacity: pressed ? 0.6 : 1 }]}
          >
            <MaterialIcons name="more-vert" size={24} color={colors.foreground} />
          </Pressable>
        </View>

        {menuOpen ? (
          <View style={[styles.menu, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Pressable onPress={confirmUnlink} style={styles.menuItem}>
              <MaterialIcons name="link-off" size={20} color={colors.error} />
              <Text style={[styles.menuItemText, { color: colors.error }]}>Desvincular</Text>
            </Pressable>
          </View>
        ) : null}

        <Text style={[styles.linkInfo, { color: colors.muted }]}>
          Vinculado via {METHOD_LABEL[linked.method]} em {formatDate(linked.linkedAt)}
        </Text>

        <Section icon="medication" title="Medicações" colors={colors}>
          {loading ? (
            <Muted colors={colors} text="Carregando…" />
          ) : enabledAlarms.length === 0 ? (
            <Muted colors={colors} text="Nenhum alarme ativo cadastrado." />
          ) : (
            enabledAlarms.slice(0, 6).map((a) => (
              <Row key={a.id} colors={colors} left={a.time} right={a.description || 'Medicação'} />
            ))
          )}
        </Section>

        <Section icon="favorite" title="Saúde (métricas)" colors={colors}>
          {loading ? (
            <Muted colors={colors} text="Carregando…" />
          ) : metrics.length === 0 ? (
            <Muted colors={colors} text="Nenhuma métrica registrada ainda." />
          ) : (
            metrics.map((m) => (
              <Row
                key={m.id}
                colors={colors}
                left={`${metricTypeLabel(m.type)}: ${formatMetricValue(m)}`}
                right={relativeTime(m.timestamp)}
              />
            ))
          )}
        </Section>

        <Section icon="description" title="Anamnese" colors={colors}>
          {loading ? (
            <Muted colors={colors} text="Carregando…" />
          ) : anamnesis ? (
            <>
              <Field colors={colors} label="Alergias" value={anamnesis.allergies} />
              <Field colors={colors} label="Medicamentos" value={anamnesis.medications} />
              <Field colors={colors} label="Doenças" value={anamnesis.diseases} />
            </>
          ) : (
            <Muted colors={colors} text="Sem ficha de anamnese preenchida." />
          )}
        </Section>

        <Section icon="people" title="Contatos de emergência da pessoa" colors={colors}>
          {loading ? (
            <Muted colors={colors} text="Carregando…" />
          ) : contacts.length === 0 ? (
            <Muted colors={colors} text="Nenhum contato cadastrado." />
          ) : (
            contacts.slice(0, 6).map((c) => (
              <Row key={c.id} colors={colors} left={c.name} right={c.phone} sub={c.relation} />
            ))
          )}
        </Section>

        <Section icon="location-on" title="Última localização compartilhada" colors={colors}>
          {loading ? (
            <Muted colors={colors} text="Carregando…" />
          ) : loc ? (
            <>
              <Text style={[styles.sectionBody, { color: colors.muted }]}>
                {loc}
                {locAt ? ` · ${relativeTime(locAt)}` : ''}
              </Text>
              <Pressable
                onPress={openLocation}
                style={({ pressed }) => [styles.mapCta, { borderColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}
              >
                <MaterialIcons name="map" size={18} color={colors.primary} />
                <Text style={[styles.mapCtaText, { color: colors.primary }]}>Abrir no mapa</Text>
              </Pressable>
            </>
          ) : (
            <Muted colors={colors} text="Sem localização compartilhada." />
          )}
        </Section>
      </ScrollView>
      <AppDialog {...dialogProps} />
    </ScreenContainer>
  );
}

type Colors = ReturnType<typeof useColors>;

function Section({
  icon, title, colors, children,
}: { icon: React.ComponentProps<typeof MaterialIcons>['name']; title: string; colors: Colors; children: React.ReactNode }) {
  return (
    <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.sectionHeader}>
        <MaterialIcons name={icon} size={22} color={colors.primary} />
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function Muted({ colors, text }: { colors: Colors; text: string }) {
  return <Text style={[styles.sectionBody, { color: colors.muted }]}>{text}</Text>;
}

function Row({
  colors, left, right, sub,
}: { colors: Colors; left: string; right?: string; sub?: string }) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLeft, { color: colors.foreground }]}>{left}</Text>
        {sub ? <Text style={[styles.rowSub, { color: colors.muted }]}>{sub}</Text> : null}
      </View>
      {right ? <Text style={[styles.rowRight, { color: colors.muted }]}>{right}</Text> : null}
    </View>
  );
}

function Field({ colors, label, value }: { colors: Colors; label: string; value?: string }) {
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: colors.muted }]}>{label}</Text>
      <Text style={[styles.fieldValue, { color: colors.foreground }]}>{value?.trim() ? value : '—'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    padding: 14, borderRadius: 16, borderWidth: 1,
  },
  avatar: {
    width: 64, height: 64, borderRadius: 32,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 22, fontWeight: '800' },
  name: { fontSize: 19, fontWeight: '800' },
  relationship: { fontSize: 14, marginTop: 2 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 12 },
  menu: { borderRadius: 12, borderWidth: 1, padding: 4 },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10 },
  menuItemText: { fontSize: 15, fontWeight: '600' },
  linkInfo: { fontSize: 12, paddingHorizontal: 4 },
  section: { padding: 14, borderRadius: 14, borderWidth: 1, gap: 8 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '700' },
  sectionBody: { fontSize: 13, lineHeight: 18 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  rowLeft: { fontSize: 14, fontWeight: '600' },
  rowSub: { fontSize: 12, marginTop: 1 },
  rowRight: { fontSize: 13 },
  field: { paddingVertical: 3 },
  fieldLabel: { fontSize: 12, fontWeight: '600' },
  fieldValue: { fontSize: 14, marginTop: 1 },
  mapCta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderRadius: 10, borderWidth: 1, marginTop: 4,
  },
  mapCtaText: { fontSize: 14, fontWeight: '700' },
});
