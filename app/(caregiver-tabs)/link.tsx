/**
 * link.tsx — caregiver-side wizard for linking a monitored person.
 *
 * Two methods: invite code and QR (the QR just carries the same code). The
 * monitored person generates the code in their app; entering or scanning it
 * here calls `redeemInvite`, which creates the real link on the server. A short
 * details step collects an optional nickname + relationship.
 */
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppDialog, useAppDialog } from '@/components/app-dialog';
import { useColors } from '@/hooks/use-colors';
import { useCaregiverContext } from '@/lib/caregiver-context';
import { trpc } from '@/lib/trpc';
import { buildInviteUrl } from '@/constants/links';

type Mode = 'code' | 'qr';

const RELATIONSHIP_OPTIONS = ['Mãe', 'Pai', 'Filho(a)', 'Avô(ó)', 'Esposo(a)', 'Outro'];

export default function LinkScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { redeemInvite } = useCaregiverContext();
  const { dialogProps, showDialog } = useAppDialog();
  const createShareInvite = trpc.link.createShareInvite.useMutation();

  const shareLink = async () => {
    try {
      const result = await createShareInvite.mutateAsync();
      const url = buildInviteUrl(result.token);
      await Share.share({
        message: `Quero acompanhar sua saúde no Vigora Saúde. Toque para aceitar o convite: ${url}`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Não foi possível gerar o convite.';
      showDialog({ title: 'Não foi possível convidar', message, variant: 'warning', buttons: [{ text: 'OK' }] });
    }
  };

  const [mode, setMode] = useState<Mode | null>(null);
  const [identifier, setIdentifier] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [relationship, setRelationship] = useState<string | null>(null);
  const [step, setStep] = useState<'method' | 'details'>('method');
  const [submitting, setSubmitting] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  // Latch so the QR camera doesn't fire submitMethod repeatedly between the
  // first scan and the re-render that unmounts CameraView.
  const scannedRef = useRef(false);

  const submitMethod = (method: Mode, value: string) => {
    if (!value.trim()) return;
    setMode(method);
    setIdentifier(value.trim());
    setStep('details');
  };

  const confirm = async () => {
    if (!mode || submitting) return;
    setSubmitting(true);
    try {
      await redeemInvite(identifier, {
        displayName: displayName.trim() || undefined,
        relationship: relationship ?? undefined,
        method: mode,
      });
      router.replace('/(caregiver-tabs)/person');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Não foi possível vincular agora.';
      showDialog({
        title: 'Não foi possível vincular',
        message,
        variant: 'warning',
        buttons: [{ text: 'OK' }],
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (step === 'details') {
    return (
      <KeyboardAvoidingView
        style={[styles.container, { backgroundColor: colors.background }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 },
          ]}
        >
          <Text style={[styles.title, { color: colors.foreground }]}>Falta pouco</Text>
          <Text style={[styles.subtitle, { color: colors.muted }]}>
            Como você quer chamar essa pessoa no app?
          </Text>

          <Text style={[styles.label, { color: colors.foreground }]}>Nome de exibição</Text>
          <TextInput
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Ex.: Minha mãe"
            placeholderTextColor={colors.muted}
            style={[styles.input, { color: colors.foreground, backgroundColor: colors.surface, borderColor: colors.border }]}
          />

          <Text style={[styles.label, { color: colors.foreground, marginTop: 16 }]}>Parentesco (opcional)</Text>
          <View style={styles.chipRow}>
            {RELATIONSHIP_OPTIONS.map((r) => {
              const selected = relationship === r;
              return (
                <Pressable
                  key={r}
                  onPress={() => setRelationship(selected ? null : r)}
                  style={({ pressed }) => [
                    styles.chip,
                    {
                      backgroundColor: selected ? colors.primary : colors.surface,
                      borderColor: selected ? colors.primary : colors.border,
                      opacity: pressed ? 0.85 : 1,
                    },
                  ]}
                >
                  <Text style={[styles.chipText, { color: selected ? colors.onPrimary : colors.foreground }]}>{r}</Text>
                </Pressable>
              );
            })}
          </View>

          <Pressable
            onPress={confirm}
            disabled={submitting}
            style={({ pressed }) => [
              styles.primary,
              { backgroundColor: colors.primary, opacity: submitting ? 0.6 : pressed ? 0.85 : 1 },
            ]}
          >
            {submitting ? (
              <ActivityIndicator color={colors.onPrimary} />
            ) : (
              <Text style={[styles.primaryText, { color: colors.onPrimary }]}>Concluir vínculo</Text>
            )}
          </Pressable>
        </ScrollView>
        <AppDialog {...dialogProps} />
      </KeyboardAvoidingView>
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 },
      ]}
    >
      <Text style={[styles.title, { color: colors.foreground }]}>Vincular pessoa monitorada</Text>
      <Text style={[styles.subtitle, { color: colors.muted }]}>
        A pessoa que você vai acompanhar gera um código no app dela (em "Convidar cuidador"). Digite o
        código aqui ou escaneie o QR que aparece na tela dela.
      </Text>

      <MethodCard
        icon="dialpad"
        title="Código de convite"
        description="Digite o código de 6 caracteres que a pessoa monitorada gerou."
        onSubmit={(v) => submitMethod('code', v)}
        placeholder="ABC-DEF"
      />

      <View style={[styles.methodCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.methodHeader}>
          <MaterialIcons name="qr-code-scanner" size={26} color={colors.primary} />
          <Text style={[styles.methodTitle, { color: colors.foreground }]}>Escanear QR code</Text>
        </View>
        <Text style={[styles.methodDesc, { color: colors.muted }]}>
          A pessoa monitorada mostra um QR no app dela; aponte a câmera.
        </Text>

        {permission?.granted ? (
          <View style={styles.cameraBox}>
            <CameraView
              style={{ flex: 1 }}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={({ data }) => {
                if (scannedRef.current) return;
                scannedRef.current = true;
                submitMethod('qr', data);
              }}
            />
          </View>
        ) : (
          <Pressable
            onPress={requestPermission}
            style={({ pressed }) => [styles.secondary, { borderColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}
          >
            <Text style={[styles.secondaryText, { color: colors.primary }]}>Liberar câmera</Text>
          </Pressable>
        )}
      </View>

      <View style={[styles.methodCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.methodHeader}>
          <MaterialIcons name="share" size={26} color={colors.primary} />
          <Text style={[styles.methodTitle, { color: colors.foreground }]}>Convidar por link</Text>
        </View>
        <Text style={[styles.methodDesc, { color: colors.muted }]}>
          Mande um link (WhatsApp, SMS…) para a pessoa. Ela toca em "Aceitar" no aparelho dela e o vínculo é criado.
        </Text>
        <Pressable
          onPress={shareLink}
          disabled={createShareInvite.isPending}
          style={({ pressed }) => [
            styles.primary,
            { backgroundColor: colors.primary, opacity: createShareInvite.isPending ? 0.6 : pressed ? 0.85 : 1 },
          ]}
        >
          {createShareInvite.isPending ? (
            <ActivityIndicator color={colors.onPrimary} />
          ) : (
            <Text style={[styles.primaryText, { color: colors.onPrimary }]}>Gerar e compartilhar link</Text>
          )}
        </Pressable>
      </View>
    </ScrollView>
  );
}

interface MethodCardProps {
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  title: string;
  description: string;
  placeholder: string;
  onSubmit: (value: string) => void;
}

function MethodCard({ icon, title, description, placeholder, onSubmit }: MethodCardProps) {
  const colors = useColors();
  const [value, setValue] = useState('');
  return (
    <View style={[styles.methodCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.methodHeader}>
        <MaterialIcons name={icon} size={26} color={colors.primary} />
        <Text style={[styles.methodTitle, { color: colors.foreground }]}>{title}</Text>
      </View>
      <Text style={[styles.methodDesc, { color: colors.muted }]}>{description}</Text>

      <TextInput
        value={value}
        onChangeText={setValue}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        autoCapitalize="characters"
        autoCorrect={false}
        style={[styles.input, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]}
      />

      <Pressable
        onPress={() => onSubmit(value)}
        disabled={!value.trim()}
        style={({ pressed }) => [
          styles.primary,
          {
            backgroundColor: colors.primary,
            opacity: !value.trim() ? 0.5 : pressed ? 0.85 : 1,
          },
        ]}
      >
        <Text style={[styles.primaryText, { color: colors.onPrimary }]}>Vincular</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, gap: 14 },
  title: { fontSize: 24, fontWeight: '800' },
  subtitle: { fontSize: 14, lineHeight: 20, marginBottom: 10 },
  label: { fontSize: 14, fontWeight: '600' },
  input: {
    paddingHorizontal: 14, paddingVertical: 12,
    borderRadius: 12, borderWidth: 1, fontSize: 16,
  },
  methodCard: { padding: 16, borderRadius: 16, borderWidth: 1, gap: 10 },
  methodHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  methodTitle: { fontSize: 17, fontWeight: '700' },
  methodDesc: { fontSize: 13, lineHeight: 18 },
  primary: { paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginTop: 6, minHeight: 50, justifyContent: 'center' },
  primaryText: { fontSize: 15, fontWeight: '700' },
  secondary: { paddingVertical: 12, borderRadius: 12, alignItems: 'center', borderWidth: 1 },
  secondaryText: { fontSize: 14, fontWeight: '700' },
  cameraBox: { height: 220, borderRadius: 12, overflow: 'hidden' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1 },
  chipText: { fontSize: 14, fontWeight: '600' },
});
