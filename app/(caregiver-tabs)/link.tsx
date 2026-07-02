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
  ActivityIndicator, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppDialog, useAppDialog } from '@/components/app-dialog';
import { FormKeyboardView } from '@/components/form-keyboard-view';
import { useColors } from '@/hooks/use-colors';
import { useFontSize } from '@/lib/font-size-context';
import { useAccessibility } from '@/lib/accessibility-context';
import { BrandFonts } from '@/lib/_core/theme';
import { useCaregiverContext } from '@/lib/caregiver-context';
import { trpc } from '@/lib/trpc';
import { buildInviteUrl } from '@/constants/links';

type Mode = 'code' | 'qr';

const RELATIONSHIP_OPTIONS = ['Mãe', 'Pai', 'Filho(a)', 'Avô(ó)', 'Esposo(a)', 'Outro'];

/** Paleta + tamanhos resolvidos conforme o modo (normal vs acessível). */
function useLinkSkin() {
  const colors = useColors();
  const fs = useFontSize();
  const { isAccessibilityMode: a11y, a11yColors: ac, a11yFontSize: af, a11ySpacing: as_ } = useAccessibility();
  const c = a11y
    ? { bg: ac.background, surface: ac.surface, border: ac.border, foreground: ac.foreground, muted: ac.muted, primary: ac.primary, onPrimary: ac.onPrimary }
    : { bg: colors.background, surface: colors.surface, border: colors.border, foreground: colors.foreground, muted: colors.muted, primary: colors.primary, onPrimary: colors.onPrimary };
  const sz = a11y
    ? { title: af['2xl'], subtitle: af.sm, label: af.md, input: af.md, methodTitle: af.md, methodDesc: af.sm, primary: af.md, secondary: af.sm, chip: af.sm }
    : { title: fs.scaled(24), subtitle: fs.scaled(14), label: fs.scaled(14), input: fs.md, methodTitle: fs.lg, methodDesc: fs.sm, primary: fs.base, secondary: fs.scaled(14), chip: fs.scaled(14) };
  return { a11y, c, sz, bw: a11y ? 2 : 1, iconSize: a11y ? 32 : 26, touch: a11y ? as_.touchTarget : 50 };
}

export default function LinkScreen() {
  const { c, sz, bw, iconSize, touch, a11y } = useLinkSkin();
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
        message: `Quero acompanhar sua saúde no Vigora. Toque para aceitar o convite: ${url}`,
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
      <FormKeyboardView style={[styles.container, { backgroundColor: c.bg }]}>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 },
          ]}
        >
          <Text style={[styles.title, { color: c.foreground, fontSize: sz.title, fontFamily: BrandFonts.body }]}>Falta pouco</Text>
          <Text style={[styles.subtitle, { color: c.muted, fontSize: sz.subtitle, fontFamily: BrandFonts.body }]}>
            Como você quer chamar essa pessoa no app?
          </Text>

          <Text style={[styles.label, { color: c.foreground, fontSize: sz.label, fontFamily: BrandFonts.body }]}>Nome de exibição</Text>
          <TextInput
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Ex.: Minha mãe"
            placeholderTextColor={c.muted}
            style={[styles.input, { color: c.foreground, backgroundColor: c.surface, borderColor: c.border, borderWidth: bw, fontSize: sz.input, minHeight: touch, fontFamily: BrandFonts.body }]}
          />

          <Text style={[styles.label, { color: c.foreground, marginTop: 16, fontSize: sz.label, fontFamily: BrandFonts.body }]}>Parentesco (opcional)</Text>
          <View style={styles.chipRow}>
            {RELATIONSHIP_OPTIONS.map((r) => {
              const selected = relationship === r;
              return (
                <Pressable
                  key={r}
                  onPress={() => setRelationship(selected ? null : r)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  style={({ pressed }) => [
                    styles.chip,
                    {
                      backgroundColor: selected ? c.primary : c.surface,
                      borderColor: selected ? c.primary : c.border,
                      borderWidth: bw,
                      minHeight: a11y ? 56 : undefined,
                      justifyContent: 'center',
                      opacity: pressed ? 0.85 : 1,
                    },
                  ]}
                >
                  <Text style={[styles.chipText, { color: selected ? c.onPrimary : c.foreground, fontSize: sz.chip, fontFamily: BrandFonts.body }]}>{r}</Text>
                </Pressable>
              );
            })}
          </View>

          <Pressable
            onPress={confirm}
            disabled={submitting}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.primary,
              { backgroundColor: c.primary, minHeight: touch, opacity: submitting ? 0.6 : pressed ? 0.85 : 1 },
            ]}
          >
            {submitting ? (
              <ActivityIndicator color={c.onPrimary} />
            ) : (
              <Text style={[styles.primaryText, { color: c.onPrimary, fontSize: sz.primary, fontFamily: BrandFonts.body }]}>Concluir vínculo</Text>
            )}
          </Pressable>
        </ScrollView>
        <AppDialog {...dialogProps} />
      </FormKeyboardView>
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: c.bg }}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 },
      ]}
    >
      <Text style={[styles.title, { color: c.foreground, fontSize: sz.title, fontFamily: BrandFonts.body }]}>Vincular pessoa monitorada</Text>
      <Text style={[styles.subtitle, { color: c.muted, fontSize: sz.subtitle, fontFamily: BrandFonts.body }]}>
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

      <View style={[styles.methodCard, { backgroundColor: c.surface, borderColor: c.border, borderWidth: bw }]}>
        <View style={styles.methodHeader}>
          <MaterialIcons name="qr-code-scanner" size={iconSize} color={c.primary} />
          <Text style={[styles.methodTitle, { color: c.foreground, fontSize: sz.methodTitle, fontFamily: BrandFonts.body }]}>Escanear QR code</Text>
        </View>
        <Text style={[styles.methodDesc, { color: c.muted, fontSize: sz.methodDesc, fontFamily: BrandFonts.body }]}>
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
            accessibilityRole="button"
            style={({ pressed }) => [styles.secondary, { borderColor: c.primary, borderWidth: bw, minHeight: a11y ? touch : undefined, opacity: pressed ? 0.85 : 1 }]}
          >
            <Text style={[styles.secondaryText, { color: c.primary, fontSize: sz.secondary, fontFamily: BrandFonts.body }]}>Liberar câmera</Text>
          </Pressable>
        )}
      </View>

      <View style={[styles.methodCard, { backgroundColor: c.surface, borderColor: c.border, borderWidth: bw }]}>
        <View style={styles.methodHeader}>
          <MaterialIcons name="share" size={iconSize} color={c.primary} />
          <Text style={[styles.methodTitle, { color: c.foreground, fontSize: sz.methodTitle, fontFamily: BrandFonts.body }]}>Convidar por link</Text>
        </View>
        <Text style={[styles.methodDesc, { color: c.muted, fontSize: sz.methodDesc, fontFamily: BrandFonts.body }]}>
          Mande um link (WhatsApp, SMS…) para a pessoa. Ela toca em "Aceitar" no aparelho dela e o vínculo é criado.
        </Text>
        <Pressable
          onPress={shareLink}
          disabled={createShareInvite.isPending}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.primary,
            { backgroundColor: c.primary, minHeight: touch, opacity: createShareInvite.isPending ? 0.6 : pressed ? 0.85 : 1 },
          ]}
        >
          {createShareInvite.isPending ? (
            <ActivityIndicator color={c.onPrimary} />
          ) : (
            <Text style={[styles.primaryText, { color: c.onPrimary, fontSize: sz.primary, fontFamily: BrandFonts.body }]}>Gerar e compartilhar link</Text>
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
  const { c, sz, bw, iconSize, touch } = useLinkSkin();
  const [value, setValue] = useState('');
  return (
    <View style={[styles.methodCard, { backgroundColor: c.surface, borderColor: c.border, borderWidth: bw }]}>
      <View style={styles.methodHeader}>
        <MaterialIcons name={icon} size={iconSize} color={c.primary} />
        <Text style={[styles.methodTitle, { color: c.foreground, fontSize: sz.methodTitle, fontFamily: BrandFonts.body }]}>{title}</Text>
      </View>
      <Text style={[styles.methodDesc, { color: c.muted, fontSize: sz.methodDesc, fontFamily: BrandFonts.body }]}>{description}</Text>

      <TextInput
        value={value}
        onChangeText={setValue}
        placeholder={placeholder}
        placeholderTextColor={c.muted}
        autoCapitalize="characters"
        autoCorrect={false}
        style={[styles.input, { color: c.foreground, backgroundColor: c.bg, borderColor: c.border, borderWidth: bw, fontSize: sz.input, minHeight: touch, fontFamily: BrandFonts.body }]}
      />

      <Pressable
        onPress={() => onSubmit(value)}
        disabled={!value.trim()}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.primary,
          {
            backgroundColor: c.primary,
            minHeight: touch,
            opacity: !value.trim() ? 0.5 : pressed ? 0.85 : 1,
          },
        ]}
      >
        <Text style={[styles.primaryText, { color: c.onPrimary, fontSize: sz.primary, fontFamily: BrandFonts.body }]}>Vincular</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, gap: 14 },
  title: { fontWeight: '800' },
  subtitle: { lineHeight: 20, marginBottom: 10 },
  label: { fontWeight: '600' },
  input: {
    paddingHorizontal: 14, paddingVertical: 12,
    borderRadius: 12,
  },
  methodCard: { padding: 16, borderRadius: 16, gap: 10 },
  methodHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  methodTitle: { fontWeight: '700' },
  methodDesc: { lineHeight: 18 },
  primary: { paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginTop: 6, justifyContent: 'center' },
  primaryText: { fontWeight: '700' },
  secondary: { paddingVertical: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontWeight: '700' },
  cameraBox: { height: 220, borderRadius: 12, overflow: 'hidden' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10 },
  chipText: { fontWeight: '600' },
});
