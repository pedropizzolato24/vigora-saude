import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppDialog, useAppDialog } from '@/components/app-dialog';
import { CaregiverEmptyState } from '@/components/caregiver-empty-state';
import { ScreenContainer } from '@/components/screen-container';
import { useColors } from '@/hooks/use-colors';
import { useFontSize } from '@/lib/font-size-context';
import { useAccessibility } from '@/lib/accessibility-context';
import { BrandFonts } from '@/lib/_core/theme';
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

/** Paleta e tamanhos resolvidos conforme o modo, para os helpers desta tela. */
type Skin = {
  a11y: boolean;
  c: { surface: string; border: string; foreground: string; muted: string; primary: string; onPrimary: string; success: string; warning: string; error: string };
  bw: number;
  sz: Record<'avatar' | 'name' | 'relationship' | 'status' | 'menuItem' | 'linkInfo' | 'sectionTitle' | 'body' | 'rowLeft' | 'rowSub' | 'rowRight' | 'fieldLabel' | 'fieldValue' | 'mapCta', number>;
  icon: { section: number; avatar: number; more: number; map: number };
};

export default function CaregiverPersonScreen() {
  const colors = useColors();
  const fs = useFontSize();
  const insets = useSafeAreaInsets();
  const { isAccessibilityMode, a11yColors: ac, a11yFontSize: af } = useAccessibility();
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
      <ScreenContainer containerStyle={isAccessibilityMode ? { backgroundColor: ac.background } : undefined}>
        <CaregiverEmptyState
          icon="person-add"
          title="Nenhuma pessoa acompanhada ainda"
          description="Adicione a pessoa que você cuida para começar a acompanhar."
          ctaLabel="Vincular agora"
          onCtaPress={() => router.push('/(caregiver-tabs)/link')}
        />
      </ScreenContainer>
    );
  }

  const skin: Skin = {
    a11y: isAccessibilityMode,
    c: isAccessibilityMode
      ? { surface: ac.surface, border: ac.border, foreground: ac.foreground, muted: ac.muted, primary: ac.primary, onPrimary: ac.onPrimary, success: ac.success, warning: ac.warning, error: ac.error }
      : { surface: colors.surface, border: colors.border, foreground: colors.foreground, muted: colors.muted, primary: colors.primary, onPrimary: colors.onPrimary, success: colors.success, warning: colors.warning, error: colors.error },
    bw: isAccessibilityMode ? 2 : 1,
    sz: isAccessibilityMode
      ? { avatar: af.xl, name: af.xl, relationship: af.sm, status: af.xs, menuItem: af.md, linkInfo: af.xs, sectionTitle: af.md, body: af.sm, rowLeft: af.sm, rowSub: af.xs, rowRight: af.sm, fieldLabel: af.xs, fieldValue: af.sm, mapCta: af.sm }
      : { avatar: fs.scaled(22), name: fs.scaled(19), relationship: fs.scaled(14), status: fs.xs, menuItem: fs.base, linkInfo: fs.xs, sectionTitle: fs.md, body: fs.sm, rowLeft: fs.scaled(14), rowSub: fs.xs, rowRight: fs.sm, fieldLabel: fs.xs, fieldValue: fs.scaled(14), mapCta: fs.scaled(14) },
    icon: isAccessibilityMode ? { section: 28, avatar: 76, more: 30, map: 24 } : { section: 22, avatar: 64, more: 24, map: 18 },
  };
  const { c, sz, bw, icon } = skin;

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
  const statusColor = hb && isRecent(hb) ? c.success : c.warning;

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

  const avatarSide = isAccessibilityMode ? 76 : 64;

  return (
    <ScreenContainer
      edges={['top', 'left', 'right']}
      containerStyle={isAccessibilityMode ? { backgroundColor: ac.background } : undefined}
    >
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 8 }]}>
        {/* Header */}
        <View style={[styles.header, { backgroundColor: c.surface, borderColor: c.border, borderWidth: bw }]}>
          <View style={[styles.avatar, { width: avatarSide, height: avatarSide, borderRadius: avatarSide / 2, backgroundColor: c.primary }]}>
            <Text style={[styles.avatarText, { color: c.onPrimary, fontSize: sz.avatar, fontFamily: BrandFonts.body }]}>{initialsOf(linked.displayName)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.name, { color: c.foreground, fontSize: sz.name, fontFamily: BrandFonts.body }]}>{linked.displayName}</Text>
            {linked.relationship ? (
              <Text style={[styles.relationship, { color: c.muted, fontSize: sz.relationship, fontFamily: BrandFonts.body }]}>{linked.relationship}</Text>
            ) : null}
            <View style={styles.statusRow}>
              <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
              <Text style={[styles.statusText, { color: c.muted, fontSize: sz.status, fontFamily: BrandFonts.body }]}>{statusText}</Text>
            </View>
          </View>
          <Pressable
            onPress={() => setMenuOpen((v) => !v)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Mais opções"
            style={({ pressed }) => [{ padding: isAccessibilityMode ? 12 : 8, opacity: pressed ? 0.6 : 1 }]}
          >
            <MaterialIcons name="more-vert" size={icon.more} color={c.foreground} />
          </Pressable>
        </View>

        {menuOpen ? (
          <View style={[styles.menu, { backgroundColor: c.surface, borderColor: c.border, borderWidth: bw }]}>
            <Pressable
              onPress={confirmUnlink}
              accessibilityRole="button"
              style={[styles.menuItem, { minHeight: isAccessibilityMode ? 60 : undefined }]}
            >
              <MaterialIcons name="link-off" size={icon.map} color={c.error} />
              <Text style={[styles.menuItemText, { color: c.error, fontSize: sz.menuItem, fontFamily: BrandFonts.body }]}>Desvincular</Text>
            </Pressable>
          </View>
        ) : null}

        <Text style={[styles.linkInfo, { color: c.muted, fontSize: sz.linkInfo, fontFamily: BrandFonts.body }]}>
          Vinculado via {METHOD_LABEL[linked.method]} em {formatDate(linked.linkedAt)}
        </Text>

        <Section icon="medication" title="Medicações" skin={skin}>
          {loading ? (
            <Muted skin={skin} text="Carregando…" />
          ) : enabledAlarms.length === 0 ? (
            <Muted skin={skin} text="Nenhum alarme ativo cadastrado." />
          ) : (
            enabledAlarms.slice(0, 6).map((a) => (
              <Row key={a.id} skin={skin} left={a.time} right={a.description || 'Medicação'} />
            ))
          )}
        </Section>

        <Section icon="favorite" title="Saúde (métricas)" skin={skin}>
          {loading ? (
            <Muted skin={skin} text="Carregando…" />
          ) : metrics.length === 0 ? (
            <Muted skin={skin} text="Nenhuma métrica registrada ainda." />
          ) : (
            metrics.map((m) => (
              <Row
                key={m.id}
                skin={skin}
                left={`${metricTypeLabel(m.type)}: ${formatMetricValue(m)}`}
                right={relativeTime(m.timestamp)}
              />
            ))
          )}
        </Section>

        <Section icon="description" title="Anamnese" skin={skin}>
          {loading ? (
            <Muted skin={skin} text="Carregando…" />
          ) : anamnesis ? (
            <>
              <Field skin={skin} label="Alergias" value={anamnesis.allergies} />
              <Field skin={skin} label="Medicamentos" value={anamnesis.medications} />
              <Field skin={skin} label="Doenças" value={anamnesis.diseases} />
            </>
          ) : (
            <Muted skin={skin} text="Sem ficha de anamnese preenchida." />
          )}
        </Section>

        <Section icon="people" title="Contatos de emergência da pessoa" skin={skin}>
          {loading ? (
            <Muted skin={skin} text="Carregando…" />
          ) : contacts.length === 0 ? (
            <Muted skin={skin} text="Nenhum contato cadastrado." />
          ) : (
            contacts.slice(0, 6).map((ct) => (
              <Row key={ct.id} skin={skin} left={ct.name} right={ct.phone} sub={ct.relation} />
            ))
          )}
        </Section>

        <Section icon="location-on" title="Última localização compartilhada" skin={skin}>
          {loading ? (
            <Muted skin={skin} text="Carregando…" />
          ) : loc ? (
            <>
              <Text style={[styles.sectionBody, { color: c.muted, fontSize: sz.body, fontFamily: BrandFonts.body }]}>
                {loc}
                {locAt ? ` · ${relativeTime(locAt)}` : ''}
              </Text>
              <Pressable
                onPress={openLocation}
                accessibilityRole="button"
                style={({ pressed }) => [styles.mapCta, { borderColor: c.primary, borderWidth: bw, minHeight: isAccessibilityMode ? 60 : undefined, opacity: pressed ? 0.85 : 1 }]}
              >
                <MaterialIcons name="map" size={icon.map} color={c.primary} />
                <Text style={[styles.mapCtaText, { color: c.primary, fontSize: sz.mapCta, fontFamily: BrandFonts.body }]}>Abrir no mapa</Text>
              </Pressable>
            </>
          ) : (
            <Muted skin={skin} text="Sem localização compartilhada." />
          )}
        </Section>
      </ScrollView>
      <AppDialog {...dialogProps} />
    </ScreenContainer>
  );
}

function Section({
  icon, title, skin, children,
}: { icon: React.ComponentProps<typeof MaterialIcons>['name']; title: string; skin: Skin; children: React.ReactNode }) {
  const { c, sz, bw } = skin;
  return (
    <View style={[styles.section, { backgroundColor: c.surface, borderColor: c.border, borderWidth: bw }]}>
      <View style={styles.sectionHeader}>
        <MaterialIcons name={icon} size={skin.icon.section} color={c.primary} />
        <Text style={[styles.sectionTitle, { color: c.foreground, fontSize: sz.sectionTitle, fontFamily: BrandFonts.body }]}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function Muted({ skin, text }: { skin: Skin; text: string }) {
  return <Text style={[styles.sectionBody, { color: skin.c.muted, fontSize: skin.sz.body, fontFamily: BrandFonts.body }]}>{text}</Text>;
}

function Row({
  skin, left, right, sub,
}: { skin: Skin; left: string; right?: string; sub?: string }) {
  const { c, sz } = skin;
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLeft, { color: c.foreground, fontSize: sz.rowLeft, fontFamily: BrandFonts.body }]}>{left}</Text>
        {sub ? <Text style={[styles.rowSub, { color: c.muted, fontSize: sz.rowSub, fontFamily: BrandFonts.body }]}>{sub}</Text> : null}
      </View>
      {right ? <Text style={[styles.rowRight, { color: c.muted, fontSize: sz.rowRight, fontFamily: BrandFonts.body }]}>{right}</Text> : null}
    </View>
  );
}

function Field({ skin, label, value }: { skin: Skin; label: string; value?: string }) {
  const { c, sz } = skin;
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: c.muted, fontSize: sz.fieldLabel, fontFamily: BrandFonts.body }]}>{label}</Text>
      <Text style={[styles.fieldValue, { color: c.foreground, fontSize: sz.fieldValue, fontFamily: BrandFonts.body }]}>{value?.trim() ? value : '—'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    padding: 14, borderRadius: 16,
  },
  avatar: {
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontWeight: '800' },
  name: { fontWeight: '800' },
  relationship: { marginTop: 2 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: {},
  menu: { borderRadius: 12, padding: 4 },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10 },
  menuItemText: { fontWeight: '600' },
  linkInfo: { paddingHorizontal: 4 },
  section: { padding: 14, borderRadius: 14, gap: 8 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { fontWeight: '700' },
  sectionBody: { lineHeight: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  rowLeft: { fontWeight: '600' },
  rowSub: { marginTop: 1 },
  rowRight: {},
  field: { paddingVertical: 3 },
  fieldLabel: { fontWeight: '600' },
  fieldValue: { marginTop: 1 },
  mapCta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderRadius: 10, marginTop: 4,
  },
  mapCtaText: { fontWeight: '700' },
});
