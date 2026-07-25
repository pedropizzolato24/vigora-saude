import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
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
import { useRouter } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { ScreenHeaderBack } from '@/components/screen-header-back';
import { HealthConsentGate } from '@/components/health-consent-gate';
import { WizardStep } from '@/components/wizard-step';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/use-colors';
import { useFontSize } from '@/lib/font-size-context';
import { BrandFonts } from '@/lib/_core/theme';
import { useAppContext, type AnamnesesData } from '@/lib/app-context';
import { exportAnamnesisToPDF } from '@/lib/pdf-utils-v2';
import { AppDialog, useAppDialog } from '@/components/app-dialog';
import { FormKeyboardView } from '@/components/form-keyboard-view';

const GENDER_OPTIONS: { value: AnamnesesData['gender']; label: string }[] = [
  { value: 'M', label: 'Masculino' },
  { value: 'F', label: 'Feminino' },
  { value: 'O', label: 'Outro' },
];

function formatBirthDate(input: string): string {
  const digits = input.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

// CNS tem 15 dígitos, exibido como 000 0000 0000 0000.
function formatSusNumber(input: string): string {
  const digits = input.replace(/\D/g, '').slice(0, 15);
  return [digits.slice(0, 3), digits.slice(3, 7), digits.slice(7, 11), digits.slice(11)]
    .filter(Boolean)
    .join(' ');
}

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
  const router = useRouter();
  const { state, dispatch } = useAppContext();
  const [form, setForm] = useState<AnamnesesData>(state.anamnesis ?? EMPTY_FORM);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);
  const { dialogProps, showDialog } = useAppDialog();
  const { isAccessibilityMode, a11yFontSize: af, a11yColors: ac, a11ySpacing: as_ } = useAccessibility();

  useEffect(() => {
    if (state.anamnesis) {
      setForm(state.anamnesis);
    }
  }, [state.anamnesis]);

  const updateField = <K extends keyof AnamnesesData>(key: K, value: AnamnesesData[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  // Ao concluir (ou cancelar) o wizard, volta para a tela de onde o usuário
  // veio — ficar parado no último passo confundia a navegação.
  const leaveWizard = () => {
    setWizardStep(1);
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/tudo' as any);
    }
  };

  const handleSave = (): boolean => {
    if (!form.fullName.trim()) {
      showDialog({ title: 'Campo obrigatório', message: 'Por favor, informe seu nome completo.', variant: 'warning', buttons: [{ text: 'OK' }] });
      return false;
    }
    if (!form.birthDate.trim()) {
      showDialog({ title: 'Campo obrigatório', message: 'Por favor, informe sua data de nascimento.', variant: 'warning', buttons: [{ text: 'OK' }] });
      return false;
    }

    dispatch({ type: 'SET_ANAMNESIS', payload: form });

    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Speech.speak('Histórico médico salvo', { language: 'pt-BR' });
    }
    return true;
  };

  const handleWizardSave = () => {
    if (handleSave()) {
      leaveWizard();
    }
  };

  // Exportação em PDF liberada para todos — a experiência completa não é
  // restringida por plano.
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

  const handleWizardNext = () => {
    if (wizardStep === 1) {
      if (!form.fullName.trim()) {
        showDialog({ title: 'Campo obrigatório', message: 'Por favor, informe seu nome completo.', variant: 'warning', buttons: [{ text: 'OK' }] });
        return;
      }
      if (!form.birthDate.trim()) {
        showDialog({ title: 'Campo obrigatório', message: 'Por favor, informe sua data de nascimento.', variant: 'warning', buttons: [{ text: 'OK' }] });
        return;
      }
      setWizardStep(2);
    } else if (wizardStep === 2) {
      setWizardStep(3);
    } else {
      handleWizardSave();
    }
  };

  const handleWizardBack = () => {
    if (wizardStep === 2) setWizardStep(1);
    else if (wizardStep === 3) setWizardStep(2);
  };

  // LGPD Art. 11: não coletar dados sensíveis de saúde sem consentimento
  // destacado. Quem JÁ tem dados (instalações antigas) é mantido (grandfather)
  // para não perder acesso aos próprios dados.
  const hasHealthData = !!state.anamnesis || (state.healthMetrics?.length ?? 0) > 0;
  if (!state.settings.healthConsentAt && !hasHealthData) {
    return (
      <ScreenContainer edges={['left', 'right']}>
        <HealthConsentGate>{null}</HealthConsentGate>
      </ScreenContainer>
    );
  }

  // --- ACCESSIBILITY MODE --------------------------------------------------
  if (isAccessibilityMode) {
    const a11yFields: { label: string; key: keyof AnamnesesData; placeholder: string; multiline?: boolean; keyboard?: any; format?: (v: string) => string }[] = [
      { label: 'Nome Completo *', key: 'fullName', placeholder: 'Seu nome completo' },
      { label: 'Data de Nascimento *', key: 'birthDate', placeholder: 'DD/MM/AAAA', keyboard: 'numeric', format: formatBirthDate },
      { label: 'Alergias', key: 'allergies', placeholder: 'Ex: Penicilina, Amendoim...', multiline: true },
      { label: 'Medicamentos em uso', key: 'medications', placeholder: 'Ex: Losartana 50mg...', multiline: true },
      { label: 'Doenças crônicas', key: 'diseases', placeholder: 'Ex: Diabetes, Hipertensão...', multiline: true },
    ];
    return (
      <>
      <ScreenContainer edges={['left', 'right']} containerStyle={{ backgroundColor: ac.background }}>
        <View style={{ paddingHorizontal: 20, paddingTop: insets.top + 12, paddingBottom: 16, borderBottomWidth: 2, borderBottomColor: ac.border, backgroundColor: ac.bar, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <ScreenHeaderBack />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: af['2xl'], fontWeight: '900', color: ac.foreground }}>Histórico médico</Text>
            <Text style={{ fontSize: af.sm, color: ac.muted, marginTop: 4 }}>Histórico médico pessoal</Text>
          </View>
        </View>
        <FormKeyboardView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 24, paddingBottom: 40 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {a11yFields.map((field) => (
            <View key={field.key} style={{ gap: 10 }}>
              <Text style={{ fontSize: af.lg, fontWeight: '800', color: ac.foreground }}>{field.label}</Text>
              <TextInput
                value={String(form[field.key] ?? '')}
                onChangeText={(v) => updateField(field.key, (field.format ? field.format(v) : v) as any)}
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
                accessibilityLabel={field.label}
              />
            </View>
          ))}
          {/* Exportar PDF — liberado para todos */}
          <Pressable
            onPress={handleExport}
            accessibilityRole="button"
            accessibilityLabel="Exportar histórico médico em PDF"
            style={({ pressed }) => [{ backgroundColor: ac.surface, borderRadius: 20, paddingVertical: as_.buttonPadding, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14, borderWidth: 3, borderColor: ac.primary, opacity: pressed ? 0.85 : 1 }]}
          >
            <MaterialIcons name="picture-as-pdf" size={32} color={ac.primary} />
            <Text style={{ fontSize: af.xl, fontWeight: '800', color: ac.primary }}>Exportar PDF</Text>
          </Pressable>
          {/* Save button */}
          <Pressable
            onPress={handleWizardSave}
            accessibilityRole="button"
            accessibilityLabel="Salvar histórico médico"
            style={({ pressed }) => [{ backgroundColor: ac.success, borderRadius: 20, paddingVertical: as_.buttonPadding, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14, borderWidth: 3, borderColor: ac.success, opacity: pressed ? 0.85 : 1 }]}
          >
            <MaterialIcons name="save" size={32} color={ac.onPrimary} />
            <Text style={{ fontSize: af.xl, fontWeight: '800', color: ac.onPrimary }}>Salvar</Text>
          </Pressable>
        </ScrollView>
        </FormKeyboardView>
      </ScreenContainer>
      <AppDialog {...dialogProps} />
      </>
    );
  }

  // --- NORMAL MODE --------------------------------------------------
  return (
    <ScreenContainer edges={['left', 'right']}>
      {/* Header — só título; exportação fica no último passo do wizard */}
      <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.bar, paddingTop: insets.top + 12 }]}>
        <ScreenHeaderBack />
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.foreground, fontSize: fs['2xl'], fontFamily: BrandFonts.body }]}>
            Histórico médico
          </Text>
          <Text style={[styles.subtitle, { color: colors.muted, fontSize: fs.sm }]}>
            Suas informações de saúde
          </Text>
        </View>
      </View>

      {/* Wizard container */}
      <FormKeyboardView style={styles.wizardContainer}>
        {/* Step 1 — Você */}
        {wizardStep === 1 && (
          <WizardStep
            total={3}
            current={0}
            categoryTag="Você"
            tagColor={colors.primary}
            question="Informações pessoais"
            onNext={handleWizardNext}
            onCancel={leaveWizard}
            nextLabel="Continuar"
            nextDisabled={!form.fullName.trim() || !form.birthDate.trim()}
          >
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.stepContent}>
              <View style={styles.formGroup}>
                <Text style={[styles.formLabel, { color: colors.foreground, fontSize: fs.base, fontFamily: BrandFonts.body }]}>
                  Nome completo *
                </Text>
                <TextInput
                  value={form.fullName}
                  onChangeText={(v) => updateField('fullName', v)}
                  placeholder="Seu nome completo"
                  placeholderTextColor={colors.muted}
                  style={[styles.textInput, { backgroundColor: colors.surface, color: colors.foreground, borderColor: colors.border, fontSize: fs.base, minHeight: fs.touch(48) }]}
                  returnKeyType="next"
                  maxLength={80}
                  autoFocus
                  accessibilityLabel="Nome completo"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={[styles.formLabel, { color: colors.foreground, fontSize: fs.base, fontFamily: BrandFonts.body }]}>
                  Data de nascimento *
                </Text>
                <TextInput
                  value={form.birthDate}
                  onChangeText={(v) => updateField('birthDate', formatBirthDate(v))}
                  placeholder="DD/MM/AAAA"
                  placeholderTextColor={colors.muted}
                  keyboardType="numeric"
                  style={[styles.textInput, { backgroundColor: colors.surface, color: colors.foreground, borderColor: colors.border, fontSize: fs.base, minHeight: fs.touch(48) }]}
                  returnKeyType="done"
                  maxLength={10}
                  accessibilityLabel="Data de nascimento"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={[styles.formLabel, { color: colors.foreground, fontSize: fs.base, fontFamily: BrandFonts.body }]}>
                  Gênero *
                </Text>
                <View style={styles.genderOptions}>
                  {GENDER_OPTIONS.map((opt) => (
                    <Pressable
                      key={opt.value}
                      onPress={() => {
                        if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        updateField('gender', opt.value);
                      }}
                      style={[
                        styles.genderOption,
                        {
                          backgroundColor: form.gender === opt.value ? colors.primary : colors.surface,
                          borderColor: form.gender === opt.value ? colors.primary : colors.border,
                          minHeight: fs.touch(48),
                          flex: 1,
                        },
                      ]}
                      accessibilityRole="radio"
                      accessibilityLabel={opt.label}
                      accessibilityState={{ selected: form.gender === opt.value }}
                    >
                      <Text
                        style={[
                          styles.genderOptionText,
                          { color: form.gender === opt.value ? colors.onPrimary : colors.foreground, fontSize: fs.base, fontFamily: BrandFonts.body },
                        ]}
                      >
                        {opt.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </ScrollView>
          </WizardStep>
        )}

        {/* Step 2 — Saúde */}
        {wizardStep === 2 && (
          <WizardStep
            total={3}
            current={1}
            categoryTag="Saúde"
            tagColor={colors.emergency}
            question="Condições de saúde"
            onBack={handleWizardBack}
            onNext={handleWizardNext}
            nextLabel="Continuar"
          >
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.stepContent}>
              <View style={styles.formGroup}>
                <Text style={[styles.formLabel, { color: colors.foreground, fontSize: fs.base, fontFamily: BrandFonts.body }]}>
                  Alergias
                </Text>
                <TextInput
                  value={form.allergies}
                  onChangeText={(v) => updateField('allergies', v)}
                  placeholder="Ex: Penicilina, Dipirona, Amendoim..."
                  placeholderTextColor={colors.muted}
                  multiline
                  numberOfLines={3}
                  style={[styles.textArea, { backgroundColor: colors.surface, color: colors.foreground, borderColor: colors.border, fontSize: fs.base, minHeight: fs.touch(90) }]}
                  maxLength={300}
                  accessibilityLabel="Alergias"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={[styles.formLabel, { color: colors.foreground, fontSize: fs.base, fontFamily: BrandFonts.body }]}>
                  Medicamentos em uso
                </Text>
                <TextInput
                  value={form.medications}
                  onChangeText={(v) => updateField('medications', v)}
                  placeholder="Ex: Losartana 50mg, Metformina 500mg..."
                  placeholderTextColor={colors.muted}
                  multiline
                  numberOfLines={3}
                  style={[styles.textArea, { backgroundColor: colors.surface, color: colors.foreground, borderColor: colors.border, fontSize: fs.base, minHeight: fs.touch(90) }]}
                  maxLength={300}
                  accessibilityLabel="Medicamentos em uso"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={[styles.formLabel, { color: colors.foreground, fontSize: fs.base, fontFamily: BrandFonts.body }]}>
                  Doenças crônicas
                </Text>
                <TextInput
                  value={form.diseases}
                  onChangeText={(v) => updateField('diseases', v)}
                  placeholder="Ex: Diabetes tipo 2, Hipertensão, Asma..."
                  placeholderTextColor={colors.muted}
                  multiline
                  numberOfLines={3}
                  style={[styles.textArea, { backgroundColor: colors.surface, color: colors.foreground, borderColor: colors.border, fontSize: fs.base, minHeight: fs.touch(90) }]}
                  maxLength={300}
                  accessibilityLabel="Doenças crônicas"
                />
              </View>
            </ScrollView>
          </WizardStep>
        )}

        {/* Step 3 — Plano */}
        {wizardStep === 3 && (
          <WizardStep
            total={3}
            current={2}
            categoryTag="Plano"
            tagColor={colors.success}
            question="Plano de saúde"
            onBack={handleWizardBack}
            onNext={handleWizardNext}
            nextLabel="Salvar histórico"
          >
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.stepContent}>
              <View style={styles.formGroup}>
                <Text style={[styles.formLabel, { color: colors.foreground, fontSize: fs.base, fontFamily: BrandFonts.body }]}>
                  Número do SUS (CNS)
                </Text>
                <TextInput
                  value={form.susNumber}
                  onChangeText={(v) => updateField('susNumber', formatSusNumber(v))}
                  placeholder="000 0000 0000 0000"
                  placeholderTextColor={colors.muted}
                  keyboardType="numeric"
                  style={[styles.textInput, { backgroundColor: colors.surface, color: colors.foreground, borderColor: colors.border, fontSize: fs.base, minHeight: fs.touch(48) }]}
                  returnKeyType="next"
                  maxLength={18}
                  accessibilityLabel="Número do SUS"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={[styles.formLabel, { color: colors.foreground, fontSize: fs.base, fontFamily: BrandFonts.body }]}>
                  Provedor do plano
                </Text>
                <TextInput
                  value={form.healthPlanProvider}
                  onChangeText={(v) => updateField('healthPlanProvider', v)}
                  placeholder="Ex: Unimed, Bradesco Saúde, Amil..."
                  placeholderTextColor={colors.muted}
                  style={[styles.textInput, { backgroundColor: colors.surface, color: colors.foreground, borderColor: colors.border, fontSize: fs.base, minHeight: fs.touch(48) }]}
                  returnKeyType="next"
                  maxLength={60}
                  accessibilityLabel="Provedor do plano de saúde"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={[styles.formLabel, { color: colors.foreground, fontSize: fs.base, fontFamily: BrandFonts.body }]}>
                  Número do plano
                </Text>
                <TextInput
                  value={form.healthPlanNumber}
                  onChangeText={(v) => updateField('healthPlanNumber', v)}
                  placeholder="Número da carteirinha"
                  placeholderTextColor={colors.muted}
                  keyboardType="numeric"
                  style={[styles.textInput, { backgroundColor: colors.surface, color: colors.foreground, borderColor: colors.border, fontSize: fs.base, minHeight: fs.touch(48) }]}
                  returnKeyType="done"
                  maxLength={30}
                  accessibilityLabel="Número da carteirinha do plano"
                />
              </View>

              {/* Exportar PDF — liberado para todos */}
              <Pressable
                onPress={handleExport}
                style={({ pressed }) => [
                  styles.exportBtn,
                  { backgroundColor: colors.surface, borderColor: colors.primary, minHeight: fs.touch(52), opacity: pressed ? 0.8 : 1 },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Exportar histórico médico em PDF"
              >
                <MaterialIcons name="picture-as-pdf" size={20} color={colors.primary} />
                <Text style={[styles.exportBtnText, { color: colors.primary, fontSize: fs.base, fontFamily: BrandFonts.body }]}>
                  Exportar ficha em PDF
                </Text>
              </Pressable>

              {/* Privacy Note */}
              <View style={[styles.privacyNote, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <MaterialIcons name="lock" size={16} color={colors.muted} />
                <Text style={[styles.privacyText, { color: colors.muted, fontSize: fs.sm, lineHeight: fs.scaled(19) }]}>
                  Seus dados são armazenados apenas localmente neste dispositivo e nunca são enviados para servidores externos.
                </Text>
              </View>
            </ScrollView>
          </WizardStep>
        )}
      </FormKeyboardView>

      <AppDialog {...dialogProps} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: 24, fontWeight: '800' },
  subtitle: { fontSize: 14, marginTop: 2 },
  exportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 16,
  },
  exportBtnText: { fontWeight: '700' },
  wizardContainer: {
    flex: 1,
    padding: 20,
  },
  stepContent: {
    gap: 20,
    paddingBottom: 16,
  },
  formGroup: { gap: 8 },
  formLabel: { fontWeight: '600' },
  textInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  textArea: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    textAlignVertical: 'top',
  },
  genderOptions: { flexDirection: 'row', gap: 8 },
  genderOption: {
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  genderOptionText: { fontWeight: '500' },
  privacyNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  privacyText: { flex: 1 },
});
