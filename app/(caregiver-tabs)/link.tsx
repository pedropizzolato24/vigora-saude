/**
 * link.tsx — caregiver-side wizard for linking a monitored person.
 *
 * Three methods (code, email/phone, QR). In the shell, all three converge to
 * `setLinkedMonitored` with whatever the user entered/scanned — no validation
 * against a real server. Replaced by a real handshake when sync is built.
 */
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import {
  KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/use-colors';
import { useCaregiverContext } from '@/lib/caregiver-context';
import type { LinkMethod } from '@/lib/caregiver-state';

type Mode = 'code' | 'email_phone' | 'qr';

const RELATIONSHIP_OPTIONS = ['Mãe', 'Pai', 'Filho(a)', 'Avô(ó)', 'Esposo(a)', 'Outro'];

export default function LinkScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { setLinkedMonitored } = useCaregiverContext();

  const [mode, setMode] = useState<Mode | null>(null);
  const [identifier, setIdentifier] = useState('');
  const [emailPhone, setEmailPhone] = useState<'email' | 'phone'>('phone');
  const [displayName, setDisplayName] = useState('');
  const [relationship, setRelationship] = useState<string | null>(null);
  const [step, setStep] = useState<'method' | 'details'>('method');
  const [permission, requestPermission] = useCameraPermissions();
  // Latch so the QR camera doesn't fire submitMethod repeatedly between the
  // first scan and the re-render that unmounts CameraView.
  const scannedRef = useRef(false);

  const submitMethod = (method: LinkMethod, value: string) => {
    if (!value.trim()) return;
    setMode(method);
    setIdentifier(value.trim());
    setStep('details');
  };

  const confirm = () => {
    if (!mode) return;
    const finalName = displayName.trim() || identifier;
    setLinkedMonitored({
      method: mode,
      identifier,
      displayName: finalName,
      relationship: relationship ?? undefined,
    });
    router.replace('/(caregiver-tabs)/person');
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
            placeholder={identifier}
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
            style={({ pressed }) => [styles.primary, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}
          >
            <Text style={[styles.primaryText, { color: colors.onPrimary }]}>Concluir vínculo</Text>
          </Pressable>
        </ScrollView>
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
        Escolha como você quer vincular agora. Você sempre pode trocar o método nas configurações.
      </Text>

      <MethodCard
        icon="dialpad"
        title="Código de convite"
        description="A pessoa monitorada gera um código de 6 dígitos no app dela."
        onSubmit={(v) => submitMethod('code', v)}
        placeholder="123-456"
        keyboard="number-pad"
      />

      <MethodCard
        // Remount when the toggle changes so the input value resets — prevents
        // a user from typing a phone, switching to Email, and submitting the
        // stale phone string.
        key={emailPhone}
        icon="alternate-email"
        title="Email ou telefone"
        description="Envie um pedido de vínculo para o email ou telefone cadastrado."
        onSubmit={(v) => submitMethod('email_phone', v)}
        placeholder={emailPhone === 'email' ? 'email@exemplo.com' : '(11) 99999-9999'}
        keyboard={emailPhone === 'email' ? 'email-address' : 'phone-pad'}
        toggle={{
          options: [
            { label: 'Telefone', value: 'phone' },
            { label: 'Email', value: 'email' },
          ],
          selected: emailPhone,
          onSelect: (v) => setEmailPhone(v as 'email' | 'phone'),
        }}
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
    </ScrollView>
  );
}

interface MethodCardProps {
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  title: string;
  description: string;
  placeholder: string;
  keyboard?: 'default' | 'email-address' | 'phone-pad' | 'number-pad';
  onSubmit: (value: string) => void;
  toggle?: {
    options: { label: string; value: string }[];
    selected: string;
    onSelect: (value: string) => void;
  };
}

function MethodCard({ icon, title, description, placeholder, keyboard, onSubmit, toggle }: MethodCardProps) {
  const colors = useColors();
  const [value, setValue] = useState('');
  return (
    <View style={[styles.methodCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.methodHeader}>
        <MaterialIcons name={icon} size={26} color={colors.primary} />
        <Text style={[styles.methodTitle, { color: colors.foreground }]}>{title}</Text>
      </View>
      <Text style={[styles.methodDesc, { color: colors.muted }]}>{description}</Text>

      {toggle ? (
        <View style={styles.toggleRow}>
          {toggle.options.map((opt) => {
            const selected = toggle.selected === opt.value;
            return (
              <Pressable
                key={opt.value}
                onPress={() => toggle.onSelect(opt.value)}
                style={[
                  styles.toggleBtn,
                  {
                    backgroundColor: selected ? colors.primary : 'transparent',
                    borderColor: selected ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text style={{ color: selected ? colors.onPrimary : colors.foreground, fontWeight: '600', fontSize: 13 }}>
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <TextInput
        value={value}
        onChangeText={setValue}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        keyboardType={keyboard ?? 'default'}
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
  toggleRow: { flexDirection: 'row', gap: 8 },
  toggleBtn: {
    paddingVertical: 8, paddingHorizontal: 14,
    borderRadius: 10, borderWidth: 1,
  },
  primary: { paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginTop: 6 },
  primaryText: { fontSize: 15, fontWeight: '700' },
  secondary: { paddingVertical: 12, borderRadius: 12, alignItems: 'center', borderWidth: 1 },
  secondaryText: { fontSize: 14, fontWeight: '700' },
  cameraBox: { height: 220, borderRadius: 12, overflow: 'hidden' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1 },
  chipText: { fontSize: 14, fontWeight: '600' },
});
