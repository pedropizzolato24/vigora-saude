import * as Haptics from 'expo-haptics';
import React, { useEffect, useState } from 'react';
import { useAccessibility } from '@/lib/accessibility-context';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { ScreenContainer } from '@/components/screen-container';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/use-colors';
import { useFontSize } from '@/lib/font-size-context';
import { useAppContext, type AnamnesesData } from '@/lib/app-context';
import { exportAnamnesisToPDF } from '@/lib/pdf-utils-v2';
import { AppDialog, useAppDialog } from '@/components/app-dialog';

const GENDER_OPTIONS: { value: AnamnesesData['gender']; label: string }[] = [
  { value: 'M', label: 'Masculino' },
  { value: 'F', label: 'Feminino' },
  { value: 'O', label: 'Outro' },
];

const EMPTY_FORM: AnamnesesData = {
  fullName: '',
  birthDate: '',
  gender: 'M',
  allergies: '',
  medications: '',
  diseases: '',
  susNumber: '',
  healthPlanNumber: '',
  healthPlanProvider: '',
};

export default function AnamnesisScreen() {
  const colors = useColors();
  const fs = useFontSize();
  const insets = useSafeAreaInsets();
  const { state, dispatch } = useAppContext();
  const [form, setForm] = useState<AnamnesesData>(state.anamnesis ?? EMPTY_FORM);
  const [saved, setSaved] = useState(false);
  const { dialogProps, showDialog } = useAppDialog();
  const { isAccessibilityMode, a11yFontSize: af, a11yColors: ac, a11ySpacing: as_ } = useAccessibility();

  useEffect(() => {
    if (state.anamnesis) {
      setForm(state.anamnesis);
    }
  }, [state.anamnesis]);

  const handleSave = () => {
    if (!form.fullName.trim()) {
      showDialog({ title: 'Campo obrigatório', message: 'Por favor, informe seu nome completo.', variant: 'warning', buttons: [{ text: 'OK' }] });
      return;
    }
    if (!form.birthDate.trim()) {
      showDialog({ title: 'Campo obrigatório', message: 'Por favor, informe sua data de nascimento.', variant: 'warning', buttons: [{ text: 'OK' }] });
      return;
    }

    dispatch({ type: 'SET_ANAMNESIS', payload: form });

    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }

    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const handleExport = async () => {
    try {
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      await exportAnamnesisToPDF(form);
    } catch (error) {
      showDialog({ title: 'Erro ao exportar', message: 'Não foi possível exportar a ficha médica.', variant: 'error', buttons: [{ text: 'OK' }] });
      console.error('Export error:', error);
    }
  };

  const updateField = <K extends keyof AnamnesesData>(key: K, value: AnamnesesData[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  };

  // ─── ACCESSIBILITY MODE ──────────────────────────────────────────────────
  if (isAccessibilityMode) {
    const a11yFields: { label: string; key: keyof AnamnesesData; placeholder: string; multiline?: boolean; keyboard?: any }[] = [
      { label: 'Nome Completo *', key: 'fullName', placeholder: 'Seu nome completo' },
      { label: 'Data de Nascimento *', key: 'birthDate', placeholder: 'DD/MM/AAAA', keyboard: 'numbers-and-punctuation' },
      { label: 'Alergias', key: 'allergies', placeholder: 'Ex: Penicilina, Amendoim...', multiline: true },
      { label: 'Medicamentos em uso', key: 'medications', placeholder: 'Ex: Losartana 50mg...', multiline: true },
      { label: 'Doenças crônicas', key: 'diseases', placeholder: 'Ex: Diabetes, Hipertensão...', multiline: true },
    ];
    return (
      <>
      <ScreenContainer edges={['left', 'right']} containerClassName="bg-white">
        <View style={{ paddingHorizontal: 20, paddingTop: insets.top + 12, paddingBottom: 16, borderBottomWidth: 2, borderBottomColor: ac.border, backgroundColor: ac.background }}>
          <Text style={{ fontSize: af['2xl'], fontWeight: '900', color: ac.foreground }}>Ficha Médica</Text>
          <Text style={{ fontSize: af.sm, color: ac.muted, marginTop: 4 }}>Histórico médico pessoal</Text>
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 24, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          {a11yFields.map((field) => (
            <View key={field.key} style={{ gap: 10 }}>
              <Text style={{ fontSize: af.lg, fontWeight: '800', color: ac.foreground }}>{field.label}</Text>
              <TextInput
                value={String(form[field.key] ?? '')}
                onChangeText={(v) => updateField(field.key, v as any)}
                placeholder={field.placeholder}
                placeholderTextColor={ac.muted}
                keyboardType={field.keyboard ?? 'default'}
                multiline={field.multiline}
                numberOfLines={field.multiline ? 4 : 1}
                style={{
                  backgroundColor: ac.surface,
                  color: ac.foreground,
                  borderColor: ac.border,
                  borderWidth: 2,
                  borderRadius: 16,
                  padding: 18,
                  fontSize: af.md,
                  fontWeight: '500',
                  minHeight: field.multiline ? 100 : undefined,
                  textAlignVertical: field.multiline ? 'top' : 'center',
                }}
                returnKeyType="done"
              />
            </View>
          ))}
          {/* Save button */}
          <Pressable
            onPress={handleSave}
            style={({ pressed }) => [{ backgroundColor: saved ? ac.success : ac.primary, borderRadius: 20, paddingVertical: as_.buttonPadding, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14, borderWidth: 3, borderColor: saved ? '#004400' : '#003388', opacity: pressed ? 0.85 : 1 }]}
          >
            <MaterialIcons name={saved ? 'check-circle' : 'save'} size={32} color="#FFFFFF" />
            <Text style={{ fontSize: af.xl, fontWeight: '800', color: '#FFFFFF' }}>{saved ? 'Salvo!' : 'Salvar Ficha'}</Text>
          </Pressable>
        </ScrollView>
      </ScreenContainer>
      <AppDialog {...dialogProps} />
      </>
    );
  }

  // ─── NORMAL MODE ──────────────────────────────────────────────────
  return (
    <ScreenContainer edges={["left", "right"]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border, paddingTop: insets.top + 12 }]}>
        <View>
          <Text style={[styles.title, { color: colors.foreground, fontSize: fs['2xl'] }]}>Ficha de Anamnese</Text>
          <Text style={[styles.subtitle, { color: colors.muted, fontSize: fs.sm }]}>
            Histórico médico pessoal
          </Text>
        </View>
        <View style={[styles.headerIcon, { backgroundColor: colors.primaryLight }]}>
          <MaterialIcons name="description" size={24} color="#0066CC" />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Personal Info Section */}
        <SectionHeader title="Informações Pessoais" icon="person" color="#0066CC" colors={colors} />

        <View style={styles.formGroup}>
          <Text style={[styles.formLabel, { color: colors.foreground }]}>Nome completo *</Text>
          <TextInput
            value={form.fullName}
            onChangeText={(v) => updateField('fullName', v)}
            placeholder="Seu nome completo"
            placeholderTextColor={colors.muted}
            style={[styles.textInput, { backgroundColor: colors.surface, color: colors.foreground, borderColor: colors.border }]}
            returnKeyType="next"
            maxLength={80}
          />
        </View>

        <View style={styles.formGroup}>
          <Text style={[styles.formLabel, { color: colors.foreground }]}>Data de Nascimento *</Text>
          <TextInput
            value={form.birthDate}
            onChangeText={(v) => updateField('birthDate', v)}
            placeholder="DD/MM/AAAA"
            placeholderTextColor={colors.muted}
            keyboardType="numbers-and-punctuation"
            style={[styles.textInput, { backgroundColor: colors.surface, color: colors.foreground, borderColor: colors.border }]}
            returnKeyType="done"
            maxLength={10}
          />
        </View>

        <View style={styles.formGroup}>
          <Text style={[styles.formLabel, { color: colors.foreground }]}>Gênero *</Text>
          <View style={styles.genderOptions}>
            {GENDER_OPTIONS.map((opt) => (
              <Pressable
                key={opt.value}
                onPress={() => updateField('gender', opt.value)}
                style={[
                  styles.genderOption,
                  {
                    backgroundColor: form.gender === opt.value ? '#0066CC' : colors.surface,
                    borderColor: form.gender === opt.value ? '#0066CC' : colors.border,
                    flex: 1,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.genderOptionText,
                    { color: form.gender === opt.value ? '#FFFFFF' : colors.foreground },
                  ]}
                >
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Medical Info Section */}
        <SectionHeader title="Informações Médicas" icon="medical-services" color={colors.emergency} colors={colors} />

        <View style={styles.formGroup}>
          <Text style={[styles.formLabel, { color: colors.foreground }]}>Alergias</Text>
          <TextInput
            value={form.allergies}
            onChangeText={(v) => updateField('allergies', v)}
            placeholder="Ex: Penicilina, Dipirona, Amendoim..."
            placeholderTextColor={colors.muted}
            multiline
            numberOfLines={3}
            style={[styles.textArea, { backgroundColor: colors.surface, color: colors.foreground, borderColor: colors.border }]}
            maxLength={300}
          />
        </View>

        <View style={styles.formGroup}>
          <Text style={[styles.formLabel, { color: colors.foreground }]}>Medicamentos em uso</Text>
          <TextInput
            value={form.medications}
            onChangeText={(v) => updateField('medications', v)}
            placeholder="Ex: Losartana 50mg, Metformina 500mg..."
            placeholderTextColor={colors.muted}
            multiline
            numberOfLines={3}
            style={[styles.textArea, { backgroundColor: colors.surface, color: colors.foreground, borderColor: colors.border }]}
            maxLength={300}
          />
        </View>

        <View style={styles.formGroup}>
          <Text style={[styles.formLabel, { color: colors.foreground }]}>Doenças crônicas</Text>
          <TextInput
            value={form.diseases}
            onChangeText={(v) => updateField('diseases', v)}
            placeholder="Ex: Diabetes tipo 2, Hipertensão, Asma..."
            placeholderTextColor={colors.muted}
            multiline
            numberOfLines={3}
            style={[styles.textArea, { backgroundColor: colors.surface, color: colors.foreground, borderColor: colors.border }]}
            maxLength={300}
          />
        </View>

        {/* Health Plan Section */}
        <SectionHeader title="Plano de Saúde" icon="local-hospital" color="#22C55E" colors={colors} />

        <View style={styles.formGroup}>
          <Text style={[styles.formLabel, { color: colors.foreground }]}>Número do SUS (CNS)</Text>
          <TextInput
            value={form.susNumber}
            onChangeText={(v) => updateField('susNumber', v)}
            placeholder="000 0000 0000 0000"
            placeholderTextColor={colors.muted}
            keyboardType="numeric"
            style={[styles.textInput, { backgroundColor: colors.surface, color: colors.foreground, borderColor: colors.border }]}
            returnKeyType="next"
            maxLength={20}
          />
        </View>

        <View style={styles.formGroup}>
          <Text style={[styles.formLabel, { color: colors.foreground }]}>Provedor do plano</Text>
          <TextInput
            value={form.healthPlanProvider}
            onChangeText={(v) => updateField('healthPlanProvider', v)}
            placeholder="Ex: Unimed, Bradesco Saúde, Amil..."
            placeholderTextColor={colors.muted}
            style={[styles.textInput, { backgroundColor: colors.surface, color: colors.foreground, borderColor: colors.border }]}
            returnKeyType="next"
            maxLength={60}
          />
        </View>

        <View style={styles.formGroup}>
          <Text style={[styles.formLabel, { color: colors.foreground }]}>Número do plano</Text>
          <TextInput
            value={form.healthPlanNumber}
            onChangeText={(v) => updateField('healthPlanNumber', v)}
            placeholder="Número da carteirinha"
            placeholderTextColor={colors.muted}
            keyboardType="numeric"
            style={[styles.textInput, { backgroundColor: colors.surface, color: colors.foreground, borderColor: colors.border }]}
            returnKeyType="done"
            maxLength={30}
          />
        </View>

        {/* Save Button */}
        <View style={styles.buttonsRow}>
          <Pressable
            onPress={handleSave}
            style={({ pressed }) => [
              styles.saveButton,
              { flex: 1, marginRight: 8 },
              {
                backgroundColor: saved ? colors.success : colors.primary,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <MaterialIcons
              name={saved ? 'check' : 'save'}
              size={20}
              color={colors.onPrimary}
            />
            <Text style={[styles.saveButtonText, { color: colors.onPrimary }]}>
              {saved ? 'Salvo!' : 'Salvar'}
            </Text>
          </Pressable>

          <Pressable
            onPress={handleExport}
            style={({ pressed }) => [
              styles.exportButton,
              { flex: 1 },
              {
                backgroundColor: colors.primary,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <MaterialIcons name="share" size={20} color={colors.onPrimary} />
            <Text style={[styles.exportButtonText, { color: colors.onPrimary }]}>Compartilhar</Text>
          </Pressable>
        </View>

        {/* Privacy Note */}
        <View style={[styles.privacyNote, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <MaterialIcons name="lock" size={16} color={colors.muted} />
          <Text style={[styles.privacyText, { color: colors.muted }]}>
            Seus dados são armazenados apenas localmente neste dispositivo e nunca são enviados para servidores externos.
          </Text>
        </View>
      </ScrollView>
      <AppDialog {...dialogProps} />
    </ScreenContainer>
  );
}

function SectionHeader({
  title,
  icon,
  color,
  colors,
}: {
  title: string;
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  color: string;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={[styles.sectionIconBadge, { backgroundColor: color + '15' }]}>
        <MaterialIcons name={icon} size={18} color={color} />
      </View>
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: 28, fontWeight: '800' },
  subtitle: { fontSize: 14, marginTop: 2 },
  headerIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { padding: 20, gap: 16, paddingBottom: 40 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
    marginBottom: 4,
  },
  sectionIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: { fontSize: 17, fontWeight: '700' },
  formGroup: { gap: 8 },
  formLabel: { fontSize: 15, fontWeight: '600' },
  textInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
  },
  textArea: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    minHeight: 90,
    textAlignVertical: 'top',
  },
  genderOptions: { flexDirection: 'row', gap: 8 },
  genderOption: {
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  genderOptionText: { fontSize: 15, fontWeight: '500' },
  buttonsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  saveButtonText: { fontSize: 15, fontWeight: '600' },
  exportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  exportButtonText: { fontSize: 15, fontWeight: '600' },
  privacyNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  privacyText: { flex: 1, fontSize: 13, lineHeight: 19 },
});
