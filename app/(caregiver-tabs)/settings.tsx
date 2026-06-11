import AsyncStorage from '@react-native-async-storage/async-storage';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View,
} from 'react-native';
import { AppDialog, useAppDialog } from '@/components/app-dialog';
import { ScreenContainer } from '@/components/screen-container';
import { useColors } from '@/hooks/use-colors';
import { useAuth } from '@/hooks/use-auth';
import { useDeleteAccount } from '@/hooks/use-delete-account';
import * as Auth from '@/lib/_core/auth';
import { useAppLock } from '@/lib/app-lock-context';
import { useCaregiverContext } from '@/lib/caregiver-context';
import { trpc } from '@/lib/trpc';

export default function CaregiverSettingsScreen() {
  const colors = useColors();
  const router = useRouter();
  const { logout } = useAuth();
  const { state, clearLinkedMonitored, updateNotificationPrefs } = useCaregiverContext();
  const { dialogProps, showDialog } = useAppDialog();
  const appLock = useAppLock();
  const { runDeleteAccount, isDeleting } = useDeleteAccount(async () => {
    clearLinkedMonitored();
    await AsyncStorage.multiRemove([
      'vigora_caregiver_state',
      'vigora_caregiver_onboarding_completed',
    ]);
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
            // Clear caregiver-scoped local data so a different caregiver
            // signing in on the same device starts fresh (sees the
            // onboarding slideshow and has no leftover link stub).
            await AsyncStorage.multiRemove([
              'vigora_caregiver_state',
              'vigora_caregiver_onboarding_completed',
            ]);
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
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Perfil do Cuidador */}
        <Section title="Perfil do Cuidador">
          {editing ? (
            <View style={{ gap: 10 }}>
              <Text style={[styles.label, { color: colors.muted }]}>Nome</Text>
              <TextInput
                value={name} onChangeText={setName}
                style={[styles.input, { color: colors.foreground, backgroundColor: colors.surface, borderColor: colors.border }]}
              />
              <Text style={[styles.label, { color: colors.muted }]}>Telefone</Text>
              <TextInput
                value={phone} onChangeText={setPhone} keyboardType="phone-pad"
                style={[styles.input, { color: colors.foreground, backgroundColor: colors.surface, borderColor: colors.border }]}
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
                  style={({ pressed }) => [styles.secondaryBtn, { borderColor: colors.border, opacity: pressed ? 0.85 : 1 }]}
                >
                  <Text style={{ color: colors.foreground, fontWeight: '600' }}>Cancelar</Text>
                </Pressable>
                <Pressable
                  onPress={saveProfile} disabled={saving}
                  style={({ pressed }) => [styles.primaryBtn, { backgroundColor: colors.primary, opacity: saving ? 0.6 : pressed ? 0.85 : 1 }]}
                >
                  {saving ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={[styles.primaryBtnText, { color: colors.onPrimary }]}>Salvar</Text>}
                </Pressable>
              </View>
            </View>
          ) : (
            <View>
              <Text style={[styles.kv, { color: colors.foreground }]}>{name || '—'}</Text>
              <Text style={[styles.kvSub, { color: colors.muted }]}>{phone || 'Sem telefone'}</Text>
              <Pressable onPress={() => setEditing(true)} hitSlop={6}>
                <Text style={[styles.editLink, { color: colors.primary }]}>Editar</Text>
              </Pressable>
            </View>
          )}
        </Section>

        {/* Pessoa monitorada */}
        <Section title="Pessoa monitorada">
          {state.linkedMonitored ? (
            <View style={{ gap: 8 }}>
              <Text style={[styles.kv, { color: colors.foreground }]}>{state.linkedMonitored.displayName}</Text>
              <Text style={[styles.kvSub, { color: colors.muted }]}>
                {state.linkedMonitored.relationship ?? 'Sem parentesco'}
              </Text>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                <Pressable onPress={confirmUnlink}>
                  <Text style={[styles.editLink, { color: colors.error }]}>Desvincular</Text>
                </Pressable>
                <Pressable onPress={() => router.push('/(caregiver-tabs)/link')}>
                  <Text style={[styles.editLink, { color: colors.primary }]}>Trocar</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable
              onPress={() => router.push('/(caregiver-tabs)/link')}
              style={({ pressed }) => [styles.primaryBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}
            >
              <Text style={[styles.primaryBtnText, { color: colors.onPrimary }]}>Vincular agora</Text>
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
          <Text style={[styles.note, { color: colors.muted }]}>
            As notificações começarão a chegar quando a sincronização estiver ativa.
          </Text>
        </Section>

        {/* Aparência — link to monitored settings deep links would be ideal, but
            those controls live in app/(tabs)/settings.tsx and are tightly coupled
            there. For the shell, show a hint and a Pressable that takes them to
            the monitored settings tab (still accessible via deep link). */}
        <Section title="Aparência e acessibilidade">
          <Text style={[styles.note, { color: colors.muted }]}>
            Tema, tamanho de fonte e modo acessibilidade são configurados no app
            todo. Toque abaixo para abrir os controles existentes.
          </Text>
          <Pressable
            onPress={() => router.push('/(tabs)/settings')}
            style={({ pressed }) => [styles.secondaryBtn, { borderColor: colors.border, opacity: pressed ? 0.85 : 1 }]}
          >
            <Text style={{ color: colors.foreground, fontWeight: '600' }}>Abrir configurações de aparência</Text>
          </Pressable>
        </Section>

        {/* Vigora Pro — link to existing paywall */}
        <Section title="Vigora Pro">
          <Pressable
            onPress={() => router.push('/(modal)/paywall')}
            style={({ pressed }) => [styles.primaryBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}
          >
            <Text style={[styles.primaryBtnText, { color: colors.onPrimary }]}>Ver planos</Text>
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
            <Text style={[styles.note, { color: colors.muted }]}>
              Com o bloqueio ativo, o app pede PIN ou biometria sempre que é aberto.
            </Text>
          </Section>
        )}

        {/* Ajuda */}
        <Section title="Ajuda e FAQ">
          <Pressable
            onPress={() => router.push('/(tabs)/help')}
            style={({ pressed }) => [styles.secondaryBtn, { borderColor: colors.border, opacity: pressed ? 0.85 : 1 }]}
          >
            <Text style={{ color: colors.foreground, fontWeight: '600' }}>Abrir ajuda</Text>
          </Pressable>
        </Section>

        {/* Logout */}
        <Pressable
          onPress={confirmLogout}
          style={({ pressed }) => [styles.logoutBtn, { borderColor: colors.error, opacity: pressed ? 0.85 : 1 }]}
        >
          <MaterialIcons name="logout" size={20} color={colors.error} />
          <Text style={[styles.logoutText, { color: colors.error }]}>Sair da conta</Text>
        </Pressable>

        {/* Exclusão definitiva da conta (LGPD Art. 18, VI) */}
        <Pressable
          onPress={confirmDeleteAccount}
          disabled={isDeleting}
          accessibilityRole="button"
          accessibilityLabel="Excluir minha conta e todos os dados do servidor"
          style={({ pressed }) => [styles.logoutBtn, { borderColor: colors.error, opacity: isDeleting ? 0.6 : pressed ? 0.85 : 1 }]}
        >
          <MaterialIcons name="no-accounts" size={20} color={colors.error} />
          <Text style={[styles.logoutText, { color: colors.error }]}>
            {isDeleting ? 'Excluindo...' : 'Excluir minha conta'}
          </Text>
        </Pressable>
        <Text style={[styles.note, { color: colors.muted, textAlign: 'center' }]}>
          Apaga sua conta e todos os dados dos nossos servidores (LGPD, Art. 18). Permanente.
        </Text>
      </ScrollView>
      <AppDialog {...dialogProps} />
    </ScreenContainer>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const colors = useColors();
  return (
    <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{title}</Text>
      {children}
    </View>
  );
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  const colors = useColors();
  return (
    <View style={styles.toggleRow}>
      <Text style={{ color: colors.foreground, fontSize: 15, flex: 1 }}>{label}</Text>
      <Switch value={value} onValueChange={onChange} />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  section: { padding: 14, borderRadius: 14, borderWidth: 1, gap: 10 },
  sectionTitle: { fontSize: 16, fontWeight: '700' },
  kv: { fontSize: 16, fontWeight: '600' },
  kvSub: { fontSize: 13, marginTop: 2 },
  editLink: { fontSize: 14, fontWeight: '700', marginTop: 6 },
  label: { fontSize: 13, fontWeight: '600' },
  input: { paddingHorizontal: 14, paddingVertical: 12, borderRadius: 10, borderWidth: 1, fontSize: 15 },
  primaryBtn: { paddingVertical: 12, borderRadius: 12, alignItems: 'center', flex: 1 },
  primaryBtnText: { fontSize: 15, fontWeight: '700' },
  secondaryBtn: { paddingVertical: 12, borderRadius: 12, alignItems: 'center', borderWidth: 1, flex: 1 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  note: { fontSize: 12, lineHeight: 18 },
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, padding: 14, borderRadius: 12, borderWidth: 1, marginTop: 12,
  },
  logoutText: { fontSize: 15, fontWeight: '700' },
});
