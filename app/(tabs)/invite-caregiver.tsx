/**
 * invite-caregiver.tsx — monitored-side screen to invite a caregiver.
 *
 * The monitored person generates a short-lived, single-use code (also shown as
 * a QR the caregiver can scan). Generating and sharing the code is the
 * monitored person's consent, so redeeming it creates an `active` link with no
 * extra confirmation step.
 *
 * Also lists "quem me acompanha" with a revoke action — the data subject must
 * be able to see and remove a caregiver's access at any time (LGPD Art. 18).
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppDialog, useAppDialog } from '@/components/app-dialog';
import { AppToast, useAppToast } from '@/components/app-toast';
import { ScreenContainer } from '@/components/screen-container';
import { useColors } from '@/hooks/use-colors';
import { trpc } from '@/lib/trpc';

/** Display form with a dash in the middle: "ABCDEF" -> "ABC-DEF". */
function formatCode(code: string): string {
  return code.length === 6 ? `${code.slice(0, 3)}-${code.slice(3)}` : code;
}

function formatCountdown(secondsLeft: number): string {
  const m = Math.floor(secondsLeft / 60);
  const s = secondsLeft % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function InviteCaregiverScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { dialogProps, showDialog } = useAppDialog();
  const { toastProps, showToast } = useAppToast();

  const [code, setCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);

  const createInvite = trpc.link.createInvite.useMutation();
  const caregivers = trpc.link.getMyCaregivers.useQuery();
  const revoke = trpc.link.revokeLink.useMutation();

  // Tick the countdown once per second; clear the code when it expires.
  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => {
      const left = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
      setSecondsLeft(left);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  const generate = useCallback(async () => {
    try {
      const result = await createInvite.mutateAsync();
      setCode(result.code);
      setExpiresAt(new Date(result.expiresAt));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Não foi possível gerar o código.';
      showDialog({ title: 'Erro', message, variant: 'warning', buttons: [{ text: 'OK' }] });
    }
  }, [createInvite, showDialog]);

  const confirmRevoke = useCallback(
    (caregiverOpenId: string, name: string) => {
      showDialog({
        title: 'Remover acesso',
        message: `Remover o acesso de ${name}? Essa pessoa deixará de acompanhar você.`,
        variant: 'confirm',
        buttons: [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Remover',
            style: 'destructive',
            onPress: async () => {
              try {
                await revoke.mutateAsync({ otherOpenId: caregiverOpenId });
                showToast({ message: 'Acesso removido.', variant: 'success' });
                caregivers.refetch();
              } catch {
                showToast({ message: 'Não foi possível remover agora.', variant: 'error' });
              }
            },
          },
        ],
      });
    },
    [revoke, caregivers, showDialog, showToast],
  );

  const expired = code !== null && secondsLeft <= 0;
  const list = caregivers.data ?? [];

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} hitSlop={10} style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}>
            <MaterialIcons name="arrow-back" size={26} color={colors.foreground} />
          </Pressable>
          <Text style={[styles.title, { color: colors.foreground }]}>Convidar cuidador</Text>
        </View>

        <Text style={[styles.subtitle, { color: colors.muted }]}>
          Gere um código e mostre (ou leia em voz alta) para a pessoa que vai te acompanhar. Ela digita
          o código — ou escaneia o QR — no app dela. O código vale por 10 minutos e só pode ser usado uma vez.
        </Text>

        {/* Code card */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {code ? (
            <>
              <Text style={[styles.codeLabel, { color: colors.muted }]}>Código de convite</Text>
              <Text style={[styles.code, { color: expired ? colors.muted : colors.primary }]}>
                {formatCode(code)}
              </Text>

              {expired ? (
                <Text style={[styles.expiredText, { color: colors.error }]}>
                  Código expirado. Gere um novo.
                </Text>
              ) : (
                <>
                  <View style={styles.qrWrap}>
                    <View style={styles.qrBox}>
                      <QRCode value={code} size={180} backgroundColor="#FFFFFF" color="#000000" />
                    </View>
                  </View>
                  <Text style={[styles.countdown, { color: colors.muted }]}>
                    Expira em {formatCountdown(secondsLeft)}
                  </Text>
                </>
              )}

              <Pressable
                onPress={generate}
                disabled={createInvite.isPending}
                style={({ pressed }) => [
                  styles.secondaryBtn,
                  { borderColor: colors.primary, opacity: createInvite.isPending ? 0.6 : pressed ? 0.85 : 1 },
                ]}
              >
                {createInvite.isPending ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <Text style={[styles.secondaryBtnText, { color: colors.primary }]}>Gerar novo código</Text>
                )}
              </Pressable>
            </>
          ) : (
            <>
              <MaterialIcons name="qr-code-2" size={48} color={colors.primary} />
              <Text style={[styles.cardHint, { color: colors.muted }]}>
                Toque abaixo para gerar um código de convite.
              </Text>
              <Pressable
                onPress={generate}
                disabled={createInvite.isPending}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  { backgroundColor: colors.primary, opacity: createInvite.isPending ? 0.6 : pressed ? 0.85 : 1 },
                ]}
              >
                {createInvite.isPending ? (
                  <ActivityIndicator color={colors.onPrimary} />
                ) : (
                  <Text style={[styles.primaryBtnText, { color: colors.onPrimary }]}>Gerar código de convite</Text>
                )}
              </Pressable>
            </>
          )}
        </View>

        {/* Quem me acompanha */}
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Quem me acompanha</Text>
        {caregivers.isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 8 }} />
        ) : list.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.emptyText, { color: colors.muted }]}>
              Ninguém te acompanha ainda. Gere um código para convidar um cuidador.
            </Text>
          </View>
        ) : (
          list.map((c) => (
            <View
              key={c.caregiverOpenId}
              style={[styles.caregiverRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
                <MaterialIcons name="person" size={22} color={colors.onPrimary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.caregiverName, { color: colors.foreground }]}>
                  {c.caregiverName ?? 'Cuidador'}
                </Text>
                {c.relationship ? (
                  <Text style={[styles.caregiverRel, { color: colors.muted }]}>{c.relationship}</Text>
                ) : null}
              </View>
              <Pressable
                onPress={() => confirmRevoke(c.caregiverOpenId, c.caregiverName ?? 'esse cuidador')}
                hitSlop={8}
                style={({ pressed }) => [styles.removeBtn, { opacity: pressed ? 0.6 : 1 }]}
              >
                <MaterialIcons name="link-off" size={20} color={colors.error} />
                <Text style={[styles.removeText, { color: colors.error }]}>Remover</Text>
              </Pressable>
            </View>
          ))
        )}
      </ScrollView>
      <AppDialog {...dialogProps} />
      <AppToast {...toastProps} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 14 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontSize: 22, fontWeight: '800' },
  subtitle: { fontSize: 15, lineHeight: 22 },
  card: { padding: 20, borderRadius: 18, borderWidth: 1, alignItems: 'center', gap: 12 },
  cardHint: { fontSize: 15, textAlign: 'center', lineHeight: 22 },
  codeLabel: { fontSize: 13, fontWeight: '600' },
  code: { fontSize: 44, fontWeight: '900', letterSpacing: 4 },
  qrWrap: { alignItems: 'center', marginTop: 4 },
  qrBox: { padding: 12, borderRadius: 12, backgroundColor: '#FFFFFF' },
  countdown: { fontSize: 14, fontWeight: '600' },
  expiredText: { fontSize: 15, fontWeight: '700', textAlign: 'center' },
  primaryBtn: { paddingVertical: 16, paddingHorizontal: 24, borderRadius: 14, alignItems: 'center', minHeight: 56, justifyContent: 'center', alignSelf: 'stretch' },
  primaryBtnText: { fontSize: 16, fontWeight: '700' },
  secondaryBtn: { paddingVertical: 14, paddingHorizontal: 24, borderRadius: 14, alignItems: 'center', borderWidth: 1, minHeight: 52, justifyContent: 'center', alignSelf: 'stretch' },
  secondaryBtnText: { fontSize: 15, fontWeight: '700' },
  sectionTitle: { fontSize: 18, fontWeight: '800', marginTop: 8 },
  emptyCard: { padding: 16, borderRadius: 14, borderWidth: 1 },
  emptyText: { fontSize: 14, lineHeight: 20 },
  caregiverRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, borderWidth: 1 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  caregiverName: { fontSize: 16, fontWeight: '700' },
  caregiverRel: { fontSize: 13, marginTop: 2 },
  removeBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 8, paddingHorizontal: 6 },
  removeText: { fontSize: 14, fontWeight: '700' },
});
