import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppDialog, useAppDialog } from '@/components/app-dialog';
import { CaregiverEmptyState } from '@/components/caregiver-empty-state';
import { ScreenContainer } from '@/components/screen-container';
import { useColors } from '@/hooks/use-colors';
import { useCaregiverContext } from '@/lib/caregiver-context';
import type { LinkMethod } from '@/lib/caregiver-state';

const METHOD_LABEL: Record<LinkMethod, string> = {
  code: 'código de convite',
  email_phone: 'email/telefone',
  qr: 'QR code',
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
              <View style={[styles.statusDot, { backgroundColor: colors.warning }]} />
              <Text style={[styles.statusText, { color: colors.muted }]}>
                Aguardando sincronização
              </Text>
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

        <SectionCard icon="medication" title="Medicações" />
        <SectionCard icon="favorite" title="Saúde (métricas)" />
        <SectionCard icon="description" title="Anamnese" />
        <SectionCard icon="people" title="Contatos de emergência da pessoa" />
        <SectionCard icon="location-on" title="Última localização compartilhada" />
      </ScrollView>
      <AppDialog {...dialogProps} />
    </ScreenContainer>
  );
}

function SectionCard({ icon, title }: { icon: React.ComponentProps<typeof MaterialIcons>['name']; title: string }) {
  const colors = useColors();
  return (
    <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.sectionHeader}>
        <MaterialIcons name={icon} size={22} color={colors.primary} />
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{title}</Text>
      </View>
      <Text style={[styles.sectionBody, { color: colors.muted }]}>
        Aguardando sincronização com o app da pessoa monitorada.
      </Text>
      <View style={[styles.disabledCta, { borderColor: colors.border }]}>
        <Text style={[styles.disabledCtaText, { color: colors.muted }]}>
          Ver detalhes — disponível quando a sincronização estiver ativa
        </Text>
      </View>
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
  disabledCta: {
    paddingVertical: 10, paddingHorizontal: 12,
    borderRadius: 10, borderWidth: 1, alignItems: 'center', marginTop: 4,
  },
  disabledCtaText: { fontSize: 12, fontWeight: '600', textAlign: 'center' },
});
