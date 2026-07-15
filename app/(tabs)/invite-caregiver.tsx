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
import { useAccessibility } from '@/lib/accessibility-context';
import * as Auth from '@/lib/_core/auth';
import { useFontSize } from '@/lib/font-size-context';
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
  const fs = useFontSize();
  const { isAccessibilityMode, a11yFontSize: af, a11yColors: ac, a11ySpacing } = useAccessibility();
  const { dialogProps, showDialog } = useAppDialog();
  const { toastProps, showToast } = useAppToast();

  const [code, setCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  // Conta anônima não pode vincular (o vínculo precisa sobreviver a
  // reinstalação; o servidor também bloqueia) — mostra o caminho do upgrade.
  const [anonymous, setAnonymous] = useState(false);
  useEffect(() => {
    Auth.getUserInfo()
      .then((u) => setAnonymous(u?.loginMethod === 'anonymous'))
      .catch(() => {});
  }, []);

  const createInvite = trpc.link.createInvite.useMutation();
  const caregivers = trpc.link.getMyCaregivers.useQuery();
  const revoke = trpc.link.revokeLink.useMutation();

  // Tipografia escalada: preferência de fonte no modo normal, 1.8× no acessível.
  const sz = (size: number) => (isAccessibilityMode ? af.scaled(size) : fs.scaled(size));
  // Contraste aumentado no modo acessível.
  const fg = isAccessibilityMode ? ac.foreground : colors.foreground;
  const muted = isAccessibilityMode ? ac.muted : colors.muted;
  const border = isAccessibilityMode ? ac.cardBorder : colors.border;
  const minTouch = isAccessibilityMode ? a11ySpacing.touchTarget : 56;

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

  if (anonymous) {
    return (
      <ScreenContainer containerStyle={isAccessibilityMode ? { backgroundColor: ac.background } : undefined}>
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}>
          <View style={styles.headerRow}>
            <Pressable
              onPress={() => router.back()}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Voltar"
              style={({ pressed }) => [
                { opacity: pressed ? 0.6 : 1 },
                isAccessibilityMode && { minWidth: 60, minHeight: 60, justifyContent: 'center' },
              ]}
            >
              <MaterialIcons name="arrow-back" size={isAccessibilityMode ? 34 : 26} color={fg} />
            </Pressable>
            <Text style={[styles.title, { color: fg, fontSize: sz(22) }]}>Convidar cuidador</Text>
          </View>

          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: border, alignItems: 'center', gap: 12 }]}>
            <MaterialIcons name="shield" size={44} color={colors.primary} />
            <Text style={[styles.title, { color: fg, fontSize: sz(18), textAlign: 'center' }]}>
              Proteja sua conta primeiro
            </Text>
            <Text style={[styles.subtitle, { color: muted, fontSize: sz(15), lineHeight: sz(15) * 1.5, textAlign: 'center' }]}>
              Para convidar um cuidador, sua conta precisa de um login (Google, e-mail ou telefone).
              Assim o vínculo com sua família não se perde se você trocar de celular.
            </Text>
            <Pressable
              onPress={() => router.push('/login')}
              accessibilityRole="button"
              accessibilityLabel="Proteger minha conta"
              style={({ pressed }) => [
                {
                  backgroundColor: colors.primary,
                  minHeight: minTouch,
                  borderRadius: 14,
                  alignItems: 'center',
                  justifyContent: 'center',
                  alignSelf: 'stretch',
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <Text style={{ color: colors.onPrimary, fontSize: sz(16), fontWeight: '700' }}>
                Proteger minha conta
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer containerStyle={isAccessibilityMode ? { backgroundColor: ac.background } : undefined}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}>
        <View style={styles.headerRow}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Voltar"
            style={({ pressed }) => [
              { opacity: pressed ? 0.6 : 1 },
              isAccessibilityMode && { minWidth: 60, minHeight: 60, justifyContent: 'center' },
            ]}
          >
            <MaterialIcons name="arrow-back" size={isAccessibilityMode ? 34 : 26} color={fg} />
          </Pressable>
          <Text style={[styles.title, { color: fg, fontSize: sz(22) }]}>Convidar cuidador</Text>
        </View>

        <Text style={[styles.subtitle, { color: muted, fontSize: sz(15), lineHeight: sz(15) * 1.5 }]}>
          Gere um código e mostre (ou leia em voz alta) para a pessoa que vai te acompanhar. Ela digita
          o código — ou escaneia o QR — no app dela. O código vale por 10 minutos e só pode ser usado uma vez.
        </Text>

        {/* Code card */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: border }]}>
          {code ? (
            <>
              <Text style={[styles.codeLabel, { color: muted, fontSize: sz(13) }]}>Código de convite</Text>
              <Text style={[styles.code, { color: expired ? muted : colors.primary, fontSize: isAccessibilityMode ? af['4xl'] : fs.scaled(44) }]}>
                {formatCode(code)}
              </Text>

              {expired ? (
                <Text style={[styles.expiredText, { color: colors.error, fontSize: sz(15) }]}>
                  Código expirado. Gere um novo.
                </Text>
              ) : (
                <>
                  <View style={styles.qrWrap}>
                    <View style={styles.qrBox}>
                      <QRCode value={code} size={180} backgroundColor="#FFFFFF" color="#000000" />
                    </View>
                  </View>
                  <Text style={[styles.countdown, { color: muted, fontSize: sz(14) }]}>
                    Expira em {formatCountdown(secondsLeft)}
                  </Text>
                </>
              )}

              <Pressable
                onPress={generate}
                disabled={createInvite.isPending}
                style={({ pressed }) => [
                  styles.secondaryBtn,
                  { borderColor: colors.primary, minHeight: minTouch, opacity: createInvite.isPending ? 0.6 : pressed ? 0.85 : 1 },
                ]}
              >
                {createInvite.isPending ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <Text style={[styles.secondaryBtnText, { color: colors.primary, fontSize: sz(15) }]}>Gerar novo código</Text>
                )}
              </Pressable>
            </>
          ) : (
            <>
              <MaterialIcons name="qr-code-2" size={isAccessibilityMode ? 64 : 48} color={colors.primary} />
              <Text style={[styles.cardHint, { color: muted, fontSize: sz(15), lineHeight: sz(15) * 1.5 }]}>
                Toque abaixo para gerar um código de convite.
              </Text>
              <Pressable
                onPress={generate}
                disabled={createInvite.isPending}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  { backgroundColor: colors.primary, minHeight: minTouch, opacity: createInvite.isPending ? 0.6 : pressed ? 0.85 : 1 },
                ]}
              >
                {createInvite.isPending ? (
                  <ActivityIndicator color={colors.onPrimary} />
                ) : (
                  <Text style={[styles.primaryBtnText, { color: colors.onPrimary, fontSize: sz(16) }]}>Gerar código de convite</Text>
                )}
              </Pressable>
            </>
          )}
        </View>

        {/* Quem me acompanha */}
        <Text style={[styles.sectionTitle, { color: fg, fontSize: sz(18) }]}>Quem me acompanha</Text>
        {caregivers.isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 8 }} />
        ) : list.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: border }]}>
            <Text style={[styles.emptyText, { color: muted, fontSize: sz(14), lineHeight: sz(14) * 1.5 }]}>
              Ninguém te acompanha ainda. Gere um código para convidar um cuidador.
            </Text>
          </View>
        ) : (
          list.map((c) => (
            <View
              key={c.caregiverOpenId}
              style={[styles.caregiverRow, { backgroundColor: colors.surface, borderColor: border }]}
            >
              <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
                <MaterialIcons name="person" size={22} color={colors.onPrimary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.caregiverName, { color: fg, fontSize: sz(16) }]}>
                  {c.caregiverName ?? 'Cuidador'}
                </Text>
                {c.relationship ? (
                  <Text style={[styles.caregiverRel, { color: muted, fontSize: sz(13) }]}>{c.relationship}</Text>
                ) : null}
              </View>
              <Pressable
                onPress={() => confirmRevoke(c.caregiverOpenId, c.caregiverName ?? 'esse cuidador')}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`Remover acesso de ${c.caregiverName ?? 'esse cuidador'}`}
                style={({ pressed }) => [
                  styles.removeBtn,
                  isAccessibilityMode && { minHeight: 60, justifyContent: 'center' },
                  { opacity: pressed ? 0.6 : 1 },
                ]}
              >
                <MaterialIcons name="link-off" size={isAccessibilityMode ? 26 : 20} color={colors.error} />
                <Text style={[styles.removeText, { color: colors.error, fontSize: sz(14) }]}>Remover</Text>
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
  title: { fontWeight: '800' },
  subtitle: {},
  card: { padding: 20, borderRadius: 18, borderWidth: 1, alignItems: 'center', gap: 12 },
  cardHint: { textAlign: 'center' },
  codeLabel: { fontWeight: '600' },
  code: { fontWeight: '900', letterSpacing: 4 },
  qrWrap: { alignItems: 'center', marginTop: 4 },
  qrBox: { padding: 12, borderRadius: 12, backgroundColor: '#FFFFFF' },
  countdown: { fontWeight: '600' },
  expiredText: { fontWeight: '700', textAlign: 'center' },
  primaryBtn: { paddingVertical: 16, paddingHorizontal: 24, borderRadius: 14, alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch' },
  primaryBtnText: { fontWeight: '700' },
  secondaryBtn: { paddingVertical: 14, paddingHorizontal: 24, borderRadius: 14, alignItems: 'center', borderWidth: 1, justifyContent: 'center', alignSelf: 'stretch' },
  secondaryBtnText: { fontWeight: '700' },
  sectionTitle: { fontWeight: '800', marginTop: 8 },
  emptyCard: { padding: 16, borderRadius: 14, borderWidth: 1 },
  emptyText: {},
  caregiverRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, borderWidth: 1 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  caregiverName: { fontWeight: '700' },
  caregiverRel: { marginTop: 2 },
  removeBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 8, paddingHorizontal: 6 },
  removeText: { fontWeight: '700' },
});
