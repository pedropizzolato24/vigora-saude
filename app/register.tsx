import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/use-colors';
import * as Auth from '@/lib/_core/auth';
import { trpc } from '@/lib/trpc';
import { clearPendingInvite, getPendingInvite } from '@/lib/pending-invite';

type UserType = 'caregiver' | 'monitored';

const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

function formatPhone(input: string): string {
  const digits = input.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits.length ? `(${digits}` : digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function formatBirthDate(input: string): string {
  const digits = input.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

export default function RegisterScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [bloodType, setBloodType] = useState<string | null>(null);
  const [userType, setUserType] = useState<UserType | null>(null);
  const [error, setError] = useState<string | null>(null);

  const completeRegistration = trpc.auth.completeRegistration.useMutation();

  useEffect(() => {
    Auth.getUserInfo().then((u) => {
      if (u?.name) setName(u.name);
      if (u?.phone) setPhone(formatPhone(u.phone));
      if (u?.birthDate) setBirthDate(u.birthDate);
      if (u?.bloodType) setBloodType(u.bloodType);
    });
  }, []);

  const handleSubmit = async () => {
    setError(null);
    const phoneDigits = phone.replace(/\D/g, '');
    if (!name.trim()) {
      setError('Por favor, informe seu nome.');
      return;
    }
    if (phoneDigits.length < 10) {
      setError('Informe um telefone válido com DDD.');
      return;
    }
    if (!userType) {
      setError('Selecione se você é cuidador ou monitorado.');
      return;
    }

    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    try {
      const updated = await completeRegistration.mutateAsync({
        name: name.trim(),
        phone: phoneDigits,
        userType,
        birthDate: birthDate.trim() || undefined,
        bloodType: bloodType ?? undefined,
      });

      const existing = await Auth.getUserInfo();
      if (existing) {
        await Auth.setUserInfo({
          ...existing,
          name: updated.name,
          phone: updated.phone,
          userType: updated.userType,
          birthDate: updated.birthDate,
          bloodType: updated.bloodType,
        });
      }

      // Resume a pending invite link (the monitored just finished registering).
      const pendingInvite = await getPendingInvite();
      if (pendingInvite) {
        await clearPendingInvite();
        router.replace(`/convite/${pendingInvite}`);
        return;
      }

      router.replace('/(tabs)');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao salvar cadastro.';
      setError(message);
    }
  };

  const loading = completeRegistration.isPending;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: Math.max(insets.top, 40) + 20,
            paddingBottom: Math.max(insets.bottom, 20) + 20,
          },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.iconCircle, { backgroundColor: colors.primary }]}>
          <MaterialIcons name="person-add" size={48} color={colors.onPrimary} />
        </View>

        <Text style={[styles.title, { color: colors.foreground }]}>Vamos te conhecer</Text>
        <Text style={[styles.subtitle, { color: colors.muted }]}>
          Para personalizar sua experiência, precisamos de algumas informações.
        </Text>

        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.foreground }]}>Nome completo</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Como devemos te chamar?"
            placeholderTextColor={colors.muted}
            style={[
              styles.input,
              { color: colors.foreground, backgroundColor: colors.surface, borderColor: colors.border },
            ]}
            autoCapitalize="words"
            autoCorrect={false}
          />
        </View>

        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.foreground }]}>Telefone com DDD</Text>
          <TextInput
            value={phone}
            onChangeText={(t) => setPhone(formatPhone(t))}
            placeholder="(11) 99999-9999"
            placeholderTextColor={colors.muted}
            keyboardType="phone-pad"
            style={[
              styles.input,
              { color: colors.foreground, backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          />
        </View>

        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.foreground }]}>Data de nascimento (opcional)</Text>
          <TextInput
            value={birthDate}
            onChangeText={(t) => setBirthDate(formatBirthDate(t))}
            placeholder="DD/MM/AAAA"
            placeholderTextColor={colors.muted}
            keyboardType="numeric"
            maxLength={10}
            style={[
              styles.input,
              { color: colors.foreground, backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          />
        </View>

        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.foreground }]}>Tipo sanguíneo (opcional)</Text>
          <View style={styles.bloodGrid}>
            {BLOOD_TYPES.map((bt) => {
              const selected = bloodType === bt;
              return (
                <Pressable
                  key={bt}
                  onPress={() => setBloodType(selected ? null : bt)}
                  style={({ pressed }) => [
                    styles.bloodOption,
                    {
                      backgroundColor: selected ? colors.primary : colors.surface,
                      borderColor: selected ? colors.primary : colors.border,
                      opacity: pressed ? 0.85 : 1,
                    },
                  ]}
                >
                  <Text style={[styles.bloodOptionText, { color: selected ? colors.onPrimary : colors.foreground }]}>
                    {bt}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.foreground }]}>Você é:</Text>
          <View style={styles.typeRow}>
            <TypeOption
              icon="favorite"
              title="Monitorado"
              description="Quero usar o app para minha própria saúde e segurança"
              selected={userType === 'monitored'}
              onPress={() => setUserType('monitored')}
              colors={colors}
            />
            <TypeOption
              icon="shield"
              title="Cuidador"
              description="Quero acompanhar a saúde de outra pessoa"
              selected={userType === 'caregiver'}
              onPress={() => setUserType('caregiver')}
              colors={colors}
            />
          </View>
        </View>

        {error && (
          <View style={[styles.errorBox, { backgroundColor: colors.errorLight, borderColor: colors.error }]}>
            <MaterialIcons name="error-outline" size={18} color={colors.error} />
            <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
          </View>
        )}

        <Pressable
          onPress={handleSubmit}
          disabled={loading}
          style={({ pressed }) => [
            styles.submit,
            {
              backgroundColor: colors.primary,
              opacity: pressed || loading ? 0.7 : 1,
            },
          ]}
        >
          {loading ? (
            <ActivityIndicator size="small" color={colors.onPrimary} />
          ) : (
            <Text style={[styles.submitText, { color: colors.onPrimary }]}>Concluir cadastro</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function TypeOption({
  icon,
  title,
  description,
  selected,
  onPress,
  colors,
}: {
  icon: 'favorite' | 'shield';
  title: string;
  description: string;
  selected: boolean;
  onPress: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.typeOption,
        {
          backgroundColor: selected ? colors.primary : colors.surface,
          borderColor: selected ? colors.primary : colors.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <MaterialIcons name={icon} size={28} color={selected ? colors.onPrimary : colors.primary} />
      <Text style={[styles.typeTitle, { color: selected ? colors.onPrimary : colors.foreground }]}>
        {title}
      </Text>
      <Text style={[styles.typeDescription, { color: selected ? colors.onPrimary + 'CC' : colors.muted }]}>
        {description}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    paddingHorizontal: 24,
    alignItems: 'center',
    gap: 16,
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 8,
  },
  field: {
    width: '100%',
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
  },
  input: {
    width: '100%',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    fontSize: 16,
  },
  typeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  typeOption: {
    flex: 1,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    gap: 6,
    alignItems: 'flex-start',
  },
  typeTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  typeDescription: {
    fontSize: 12,
    lineHeight: 16,
  },
  bloodGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  bloodOption: {
    minWidth: 64,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
  },
  bloodOptionText: {
    fontSize: 15,
    fontWeight: '700',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    width: '100%',
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  submit: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  submitText: {
    fontSize: 16,
    fontWeight: '700',
  },
});
