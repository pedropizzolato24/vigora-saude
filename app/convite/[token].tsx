/**
 * convite/[token].tsx — monitored-side accept screen for a caregiver's
 * share-link invite.
 *
 * Opening the link never creates the link on its own (LGPD); the monitored
 * person taps "Aceitar". Handles every auth state so a link can be opened cold:
 *   - not logged in            -> stash token, go to /login (resumed after auth)
 *   - registration incomplete  -> stash token, go to /register
 *   - logged in as monitored   -> show "Fulano quer te acompanhar" + Aceitar
 *   - logged in as caregiver   -> explain it's meant for the monitored person
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppDialog, useAppDialog } from '@/components/app-dialog';
import { AppToast, useAppToast } from '@/components/app-toast';
import { ScreenContainer } from '@/components/screen-container';
import { useColors } from '@/hooks/use-colors';
import * as Auth from '@/lib/_core/auth';
import { clearPendingInvite, setPendingInvite } from '@/lib/pending-invite';
import { trpc } from '@/lib/trpc';

type AuthState = 'loading' | 'unauth' | 'incomplete' | 'ready' | 'wrong_role';

const INVALID_MESSAGE: Record<string, string> = {
  invalid: 'Convite inválido.',
  not_found: 'Convite não encontrado.',
  used: 'Este convite já foi utilizado.',
  expired: 'Convite expirado. Peça um novo para a pessoa que te convidou.',
  self: 'Você não pode se vincular a si mesmo.',
};

export default function AcceptInviteScreen() {
  const colors = useColors();
  const router = useRouter();
  const params = useLocalSearchParams<{ token: string }>();
  const token = String(params.token ?? '');
  const { dialogProps, showDialog } = useAppDialog();
  const { toastProps, showToast } = useAppToast();

  const [authState, setAuthState] = useState<AuthState>('loading');

  useEffect(() => {
    (async () => {
      // Stash first so the token survives any redirect through the auth funnel.
      if (token) await setPendingInvite(token);
      const [user, session] = await Promise.all([Auth.getUserInfo(), Auth.getSessionToken()]);
      if (!user || !session) {
        setAuthState('unauth');
        return;
      }
      if (!user.userType) {
        setAuthState('incomplete');
        return;
      }
      // Authenticated and registered — we own the flow now.
      await clearPendingInvite();
      setAuthState(user.userType === 'monitored' ? 'ready' : 'wrong_role');
    })();
  }, [token]);

  useEffect(() => {
    if (authState === 'unauth') router.replace('/login');
    else if (authState === 'incomplete') router.replace('/register');
  }, [authState, router]);

  const info = trpc.link.getInviteInfo.useQuery({ token }, { enabled: authState === 'ready' && !!token });
  const accept = trpc.link.acceptInvite.useMutation();

  const onAccept = async () => {
    try {
      await accept.mutateAsync({ token });
      showToast({ message: 'Vínculo criado! Sua família agora acompanha você.', variant: 'success' });
      setTimeout(() => router.replace('/(tabs)'), 600);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Não foi possível aceitar o convite.';
      showDialog({ title: 'Não foi possível aceitar', message, variant: 'warning', buttons: [{ text: 'OK' }] });
    }
  };

  // Loading / redirecting states render a spinner.
  if (authState === 'loading' || authState === 'unauth' || authState === 'incomplete') {
    return (
      <ScreenContainer>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </ScreenContainer>
    );
  }

  if (authState === 'wrong_role') {
    return (
      <ScreenContainer>
        <View style={styles.center}>
          <MaterialIcons name="info-outline" size={48} color={colors.primary} />
          <Text style={[styles.title, { color: colors.foreground }]}>Convite para a pessoa acompanhada</Text>
          <Text style={[styles.body, { color: colors.muted }]}>
            Este convite deve ser aberto pela pessoa que será acompanhada, no aparelho dela.
          </Text>
          <Pressable
            onPress={() => router.replace('/(caregiver-tabs)')}
            style={({ pressed }) => [styles.primary, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}
          >
            <Text style={[styles.primaryText, { color: colors.onPrimary }]}>Voltar</Text>
          </Pressable>
        </View>
      </ScreenContainer>
    );
  }

  // authState === 'ready' (monitored, authenticated)
  return (
    <ScreenContainer>
      <View style={styles.center}>
        {info.isLoading ? (
          <ActivityIndicator color={colors.primary} size="large" />
        ) : !info.data?.valid ? (
          <>
            <MaterialIcons name="link-off" size={48} color={colors.error} />
            <Text style={[styles.title, { color: colors.foreground }]}>Convite indisponível</Text>
            <Text style={[styles.body, { color: colors.muted }]}>
              {INVALID_MESSAGE[info.data?.reason ?? 'not_found'] ?? 'Convite indisponível.'}
            </Text>
            <Pressable
              onPress={() => router.replace('/(tabs)')}
              style={({ pressed }) => [styles.secondary, { borderColor: colors.border, opacity: pressed ? 0.85 : 1 }]}
            >
              <Text style={[styles.secondaryText, { color: colors.foreground }]}>Voltar</Text>
            </Pressable>
          </>
        ) : (
          <>
            <View style={[styles.iconCircle, { backgroundColor: colors.primaryLight }]}>
              <MaterialIcons name="favorite" size={44} color={colors.primary} />
            </View>
            <Text style={[styles.title, { color: colors.foreground }]}>
              {info.data.caregiverName ?? 'Alguém'} quer acompanhar sua saúde
            </Text>
            <Text style={[styles.body, { color: colors.muted }]}>
              Ao aceitar, essa pessoa poderá ver seus lembretes, métricas e ser avisada se algo acontecer.
              Você pode desfazer isso quando quiser.
            </Text>
            <Pressable
              onPress={onAccept}
              disabled={accept.isPending}
              style={({ pressed }) => [
                styles.primary,
                { backgroundColor: colors.primary, opacity: accept.isPending ? 0.6 : pressed ? 0.85 : 1 },
              ]}
            >
              {accept.isPending ? (
                <ActivityIndicator color={colors.onPrimary} />
              ) : (
                <Text style={[styles.primaryText, { color: colors.onPrimary }]}>Aceitar</Text>
              )}
            </Pressable>
            <Pressable
              onPress={() => router.replace('/(tabs)')}
              disabled={accept.isPending}
              style={({ pressed }) => [styles.secondary, { borderColor: colors.border, opacity: pressed ? 0.85 : 1 }]}
            >
              <Text style={[styles.secondaryText, { color: colors.foreground }]}>Recusar</Text>
            </Pressable>
          </>
        )}
      </View>
      <AppDialog {...dialogProps} />
      <AppToast {...toastProps} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 14 },
  iconCircle: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  title: { fontSize: 22, fontWeight: '800', textAlign: 'center' },
  body: { fontSize: 15, lineHeight: 22, textAlign: 'center', maxWidth: 340 },
  primary: { marginTop: 8, paddingVertical: 16, paddingHorizontal: 28, borderRadius: 14, minWidth: 220, alignItems: 'center', minHeight: 56, justifyContent: 'center' },
  primaryText: { fontSize: 17, fontWeight: '700' },
  secondary: { paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12, borderWidth: 1, minWidth: 160, alignItems: 'center' },
  secondaryText: { fontSize: 15, fontWeight: '600' },
});
