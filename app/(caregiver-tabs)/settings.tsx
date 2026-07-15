import AsyncStorage from '@react-native-async-storage/async-storage';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View,
} from 'react-native';
import { AppDialog, useAppDialog } from '@/components/app-dialog';
import { ProtectAccountBanner } from '@/components/protect-account-banner';
import { ScreenContainer } from '@/components/screen-container';
import { useColors } from '@/hooks/use-colors';
import { useFontSize } from '@/lib/font-size-context';
import { useAccessibility } from '@/lib/accessibility-context';
import { BrandFonts } from '@/lib/_core/theme';
import { useAuth } from '@/hooks/use-auth';
import { useDeleteAccount } from '@/hooks/use-delete-account';
import * as Auth from '@/lib/_core/auth';
import { useAppLock } from '@/lib/app-lock-context';
import { useCaregiverContext } from '@/lib/caregiver-context';
import { trpc } from '@/lib/trpc';

/** Paleta + tamanhos resolvidos conforme o modo (normal vs acessível). */
function useSettingsSkin() {
  const colors = useColors();
  const fs = useFontSize();
  const { isAccessibilityMode: a11y, a11yColors: ac, a11yFontSize: af, a11ySpacing: as_ } = useAccessibility();
  const c = a11y
    ? { bg: ac.background, surface: ac.surface, border: ac.border, foreground: ac.foreground, muted: ac.muted, primary: ac.primary, onPrimary: ac.onPrimary, error: ac.error }
    : { bg: colors.background, surface: colors.surface, border: colors.border, foreground: colors.foreground, muted: colors.muted, primary: colors.primary, onPrimary: colors.onPrimary, error: colors.error };
  const sz = a11y
    ? { sectionTitle: af.md, kv: af.md, kvSub: af.sm, editLink: af.sm, label: af.sm, input: af.md, btn: af.md, note: af.xs, toggle: af.md, logout: af.md }
    : { sectionTitle: fs.md, kv: fs.md, kvSub: fs.sm, editLink: fs.scaled(14), label: fs.sm, input: fs.base, btn: fs.base, note: fs.xs, toggle: fs.base, logout: fs.base };
  return { a11y, c, sz, bw: a11y ? 2 : 1, touch: a11y ? as_.touchTarget : 48 };
}

export default function CaregiverSettingsScreen() {
  const { a11y, c, sz, bw, touch } = useSettingsSkin();
  const router = useRouter();
  const { logout } = useAuth();
  const { state, clearLinkedMonitored, updateNotificationPrefs } = useCaregiverContext();
  const { dialogProps, showDialog } = useAppDialog();
  const appLock = useAppLock();
  const { runDeleteAccount, isDeleting } = useDeleteAccount(async () => {
    clearLinkedMonitored();
    await AsyncStorage.multiRemove(['vigora_caregiver_state']);
  });

  const updateProfile = trpc.auth.updateProfile.useMutation();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Auth.getUserInfo().then((u) => {
      setName(u?.name ?? '');
      setPhone(u?.phone ?? '');
    });
  }, []);

  const saveProfile = async () => {
    setSaving(true);
    try {
      const updated = await updateProfile.mutateAsync({
        name: name.trim() || undefined,
        phone: phone.replace(/\D/g, '') || undefined,
      });
      const existing = await Auth.getUserInfo();
      if (existing) {
        await Auth.setUserInfo({
          ...existing,
          name: updated.name,
          phone: updated.phone,
        });
      }
      setEditing(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao salvar.';
      showDialog({ title: 'Erro', message, variant: 'warning', buttons: [{ text: 'OK' }] });
    } finally {
      setSaving(false);
    }
  };

  const confirmUnlink = () => {
    if (!state.linkedMonitored) return;
    showDialog({
      title: 'Desvincular pessoa',
      message: `Desvincular ${state.linkedMonitored.displayName}?`,
      variant: 'confirm',
      buttons: [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Desvincular', style: 'destructive', onPress: () => clearLinkedMonitored() },
      ],
    });
  };

  const confirmLogout = () => {
    showDialog({
      title: 'Sair da conta',
      message: 'Você terá que entrar de novo para usar o app.',
      variant: 'confirm',
      buttons: [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sair',
          style: 'destructive',
          onPress: async () => {
            await logout();
            // Limpa o vínculo local para não vazar entre contas. NÃO apaga a flag
            // de onboarding: ela é por conta (openId), então a mesma conta não
            // re-onboarda ao relogar e uma conta diferente ainda vê o onboarding.
            await AsyncStorage.multiRemove(['vigora_caregiver_state']);
            router.replace('/login');
          },
        },
      ],
    });
  };

  const confirmDeleteAccount = () => {
    if (isDeleting) return;
    showDialog({
      title: 'Excluir minha conta',
      message:
        'Esta ação é PERMANENTE. Apaga sua conta e todos os seus dados dos nossos servidores — perfil, vínculos com quem você acompanha e notificações. Não há como desfazer.',
      variant: 'confirm',
      buttons: [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir conta',
          style: 'destructive',
          onPress: async () => {
            try {
              await runDeleteAccount();
            } catch {
              showDialog({
                title: 'Não foi possível excluir',
                message:
                  'Houve um erro ao excluir sua conta no servidor. Seus dados não foram apagados. Tente novamente em instantes.',
                variant: 'error',
                buttons: [{ text: 'OK' }],
              });
            }
          },
        },
      ],
    });
  };

  return (
    <ScreenContainer containerStyle={a11y ? { backgroundColor: c.bg } : undefined}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Upgrade da conta anônima — só aparece para quem entrou sem login */}
        <ProtectAccountBanner />

        {/* Perfil do Cuidador */}
        <Section title="Perfil do Cuidador">
          {editing ? (
            <View style={{ gap: 10 }}>
              <Text style={[styles.label, { color: c.muted, fontSize: sz.label, fontFamily: BrandFonts.body }]}>Nome</Text>
              <TextInput
                value={name} onChangeText={setName}
                style={[styles.input, { color: c.foreground, backgroundColor: c.surface, borderColor: c.border, borderWidth: bw, fontSize: sz.input, minHeight: touch, fontFamily: BrandFonts.body }]}
              />
              <Text style={[styles.label, { color: c.muted, fontSize: sz.label, fontFamily: BrandFonts.body }]}>Telefone</Text>
              <TextInput
                value={phone} onChangeText={setPhone} keyboardType="phone-pad"
                style={[styles.input, { color: c.foreground, backgroundColor: c.surface, borderColor: c.border, borderWidth: bw, fontSize: sz.input, minHeight: touch, fontFamily: BrandFonts.body }]}
              />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Pressable
                  onPress={async () => {
                    // Discard in-progress edits by re-reading the server-authoritative
                    // values, so the next "Editar" tap starts clean.
                    const u = await Auth.getUserInfo();
                    setName(u?.name ?? '');
                    setPhone(u?.phone ?? '');
                    setEditing(false);
                  }}
                  style={({ pressed }) => [styles.secondaryBtn, { borderColor: c.border, borderWidth: bw, minHeight: touch, opacity: pressed ? 0.85 : 1 }]}
                >
                  <Text style={{ color: c.foreground, fontWeight: '600', fontSize: sz.btn, fontFamily: BrandFonts.body }}>Cancelar</Text>
                </Pressable>
                <Pressable
                  onPress={saveProfile} disabled={saving}
                  style={({ pressed }) => [styles.primaryBtn, { backgroundColor: c.primary, minHeight: touch, opacity: saving ? 0.6 : pressed ? 0.85 : 1 }]}
                >
                  {saving ? <ActivityIndicator color={c.onPrimary} /> : <Text style={[styles.primaryBtnText, { color: c.onPrimary, fontSize: sz.btn, fontFamily: BrandFonts.body }]}>Salvar</Text>}
                </Pressable>
              </View>
            </View>
          ) : (
            <View>
              <Text style={[styles.kv, { color: c.foreground, fontSize: sz.kv, fontFamily: BrandFonts.body }]}>{name || '—'}</Text>
              <Text style={[styles.kvSub, { color: c.muted, fontSize: sz.kvSub, fontFamily: BrandFonts.body }]}>{phone || 'Sem telefone'}</Text>
              <Pressable onPress={() => setEditing(true)} hitSlop={6} accessibilityRole="button">
                <Text style={[styles.editLink, { color: c.primary, fontSize: sz.editLink, fontFamily: BrandFonts.body }]}>Editar</Text>
              </Pressable>
            </View>
          )}
        </Section>

        {/* Pessoa monitorada */}
        <Section title="Pessoa acompanhada">
          {state.linkedMonitored ? (
            <View style={{ gap: 8 }}>
              <Text style={[styles.kv, { color: c.foreground, fontSize: sz.kv, fontFamily: BrandFonts.body }]}>{state.linkedMonitored.displayName}</Text>
              <Text style={[styles.kvSub, { color: c.muted, fontSize: sz.kvSub, fontFamily: BrandFonts.body }]}>
                {state.linkedMonitored.relationship ?? 'Sem parentesco'}
              </Text>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                <Pressable onPress={confirmUnlink} accessibilityRole="button">
                  <Text style={[styles.editLink, { color: c.error, fontSize: sz.editLink, fontFamily: BrandFonts.body }]}>Desvincular</Text>
                </Pressable>
                <Pressable onPress={() => router.push('/(caregiver-tabs)/link')} accessibilityRole="button">
                  <Text style={[styles.editLink, { color: c.primary, fontSize: sz.editLink, fontFamily: BrandFonts.body }]}>Trocar</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable
              onPress={() => router.push('/(caregiver-tabs)/link')}
              style={({ pressed }) => [styles.primaryBtn, { backgroundColor: c.primary, minHeight: touch, opacity: pressed ? 0.85 : 1 }]}
            >
              <Text style={[styles.primaryBtnText, { color: c.onPrimary, fontSize: sz.btn, fontFamily: BrandFonts.body }]}>Vincular agora</Text>
            </Pressable>
          )}
        </Section>

        {/* Notificações */}
        <Section title="Notificações">
          <ToggleRow
            label="Medicação perdida"
            value={state.notificationPrefs.missedMedication}
            onChange={(v) => updateNotificationPrefs({ missedMedication: v })}
          />
          <ToggleRow
            label="SOS acionado"
            value={state.notificationPrefs.sosTriggered}
            onChange={(v) => updateNotificationPrefs({ sosTriggered: v })}
          />
          <ToggleRow
            label="Dead man's switch"
            value={state.notificationPrefs.deadManSwitch}
            onChange={(v) => updateNotificationPrefs({ deadManSwitch: v })}
          />
          <Text style={[styles.note, { color: c.muted, fontSize: sz.note, fontFamily: BrandFonts.body }]}>
            As notificações começarão a chegar quando a sincronização estiver ativa.
          </Text>
        </Section>

        {/* Aparência — tela compartilhada no Stack raiz (app/appearance-settings).
            Antes apontava para /(tabs)/settings, jogando o cuidador no grupo de
            abas do monitorado sem volta. A tela compartilhada usa router.back()
            e preserva o fluxo do cuidador. */}
        <Section title="Aparência e acessibilidade">
          <Text style={[styles.note, { color: c.muted, fontSize: sz.note, fontFamily: BrandFonts.body }]}>
            Tema, tamanho de fonte e modo acessibilidade são configurados no app
            todo. Toque abaixo para abrir os controles.
          </Text>
          <Pressable
            onPress={() => router.push('/appearance-settings')}
            style={({ pressed }) => [styles.secondaryBtn, { borderColor: c.border, borderWidth: bw, minHeight: touch, opacity: pressed ? 0.85 : 1 }]}
          >
            <Text style={{ color: c.foreground, fontWeight: '600', fontSize: sz.btn, fontFamily: BrandFonts.body }}>Abrir configurações de aparência</Text>
          </Pressable>
        </Section>

        {/* Vigora Pro — link to existing paywall */}
        <Section title="Vigora Pro">
          <Pressable
            onPress={() => router.push('/(modal)/paywall')}
            style={({ pressed }) => [styles.primaryBtn, { backgroundColor: c.primary, minHeight: touch, opacity: pressed ? 0.85 : 1 }]}
          >
            <Text style={[styles.primaryBtnText, { color: c.onPrimary, fontSize: sz.btn, fontFamily: BrandFonts.body }]}>Ver planos</Text>
          </Pressable>
        </Section>

        {/* Segurança — bloqueio de app (só nativo: SecureStore/biometria) */}
        {Platform.OS !== 'web' && (
          <Section title="Segurança">
            <ToggleRow
              label="Bloquear app ao sair"
              value={appLock.enabled}
              onChange={(v) =>
                v
                  ? router.push('/app-lock-setup')
                  : router.push({ pathname: '/app-lock-setup', params: { mode: 'disable' } })
              }
            />
            {appLock.enabled && appLock.biometricAvailable && (
              <ToggleRow
                label="Desbloquear com biometria"
                value={appLock.biometricEnabled}
                onChange={(v) => appLock.setBiometricEnabled(v)}
              />
            )}
            <Text style={[styles.note, { color: c.muted, fontSize: sz.note, fontFamily: BrandFonts.body }]}>
              Com o bloqueio ativo, o app pede PIN ou biometria sempre que é aberto.
            </Text>
          </Section>
        )}

        {/* Ajuda */}
        <Section title="Ajuda e FAQ">
          <Pressable
            onPress={() => router.push('/help')}
            style={({ pressed }) => [styles.secondaryBtn, { borderColor: c.border, borderWidth: bw, minHeight: touch, opacity: pressed ? 0.85 : 1 }]}
          >
            <Text style={{ color: c.foreground, fontWeight: '600', fontSize: sz.btn, fontFamily: BrandFonts.body }}>Abrir ajuda</Text>
          </Pressable>
        </Section>

        {/* Logout */}
        <Pressable
          onPress={confirmLogout}
          accessibilityRole="button"
          style={({ pressed }) => [styles.logoutBtn, { borderColor: c.error, borderWidth: bw, minHeight: touch, opacity: pressed ? 0.85 : 1 }]}
        >
          <MaterialIcons name="logout" size={a11y ? 26 : 20} color={c.error} />
          <Text style={[styles.logoutText, { color: c.error, fontSize: sz.logout, fontFamily: BrandFonts.body }]}>Sair da conta</Text>
        </Pressable>

        {/* Exclusão definitiva da conta (LGPD Art. 18, VI) */}
        <Pressable
          onPress={confirmDeleteAccount}
          disabled={isDeleting}
          accessibilityRole="button"
          accessibilityLabel="Excluir minha conta e todos os dados do servidor"
          style={({ pressed }) => [styles.logoutBtn, { borderColor: c.error, borderWidth: bw, minHeight: touch, opacity: isDeleting ? 0.6 : pressed ? 0.85 : 1 }]}
        >
          <MaterialIcons name="no-accounts" size={a11y ? 26 : 20} color={c.error} />
          <Text style={[styles.logoutText, { color: c.error, fontSize: sz.logout, fontFamily: BrandFonts.body }]}>
            {isDeleting ? 'Excluindo...' : 'Excluir minha conta'}
          </Text>
        </Pressable>
        <Text style={[styles.note, { color: c.muted, textAlign: 'center', fontSize: sz.note, fontFamily: BrandFonts.body }]}>
          Apaga sua conta e todos os dados dos nossos servidores (LGPD, Art. 18). Permanente.
        </Text>
      </ScrollView>
      <AppDialog {...dialogProps} />
    </ScreenContainer>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { c, sz, bw } = useSettingsSkin();
  return (
    <View style={[styles.section, { backgroundColor: c.surface, borderColor: c.border, borderWidth: bw }]}>
      <Text style={[styles.sectionTitle, { color: c.foreground, fontSize: sz.sectionTitle, fontFamily: BrandFonts.body }]}>{title}</Text>
      {children}
    </View>
  );
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  const { c, sz, a11y } = useSettingsSkin();
  return (
    <View style={[styles.toggleRow, a11y && { minHeight: 56 }]}>
      <Text style={{ color: c.foreground, fontSize: sz.toggle, flex: 1, fontFamily: BrandFonts.body }}>{label}</Text>
      <Switch value={value} onValueChange={onChange} />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  section: { padding: 14, borderRadius: 14, gap: 10 },
  sectionTitle: { fontWeight: '700' },
  kv: { fontWeight: '600' },
  kvSub: { marginTop: 2 },
  editLink: { fontWeight: '700', marginTop: 6 },
  label: { fontWeight: '600' },
  input: { paddingHorizontal: 14, paddingVertical: 12, borderRadius: 10 },
  primaryBtn: { paddingVertical: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flex: 1 },
  primaryBtnText: { fontWeight: '700' },
  secondaryBtn: { paddingVertical: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flex: 1 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  note: { lineHeight: 18 },
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, padding: 14, borderRadius: 12, marginTop: 12,
  },
  logoutText: { fontWeight: '700' },
});
