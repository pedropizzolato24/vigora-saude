import * as Haptics from 'expo-haptics';
import React, { useEffect, useState } from 'react';
import {
  Alert,
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
import { useAppContext, type AnamnesesData } from '@/lib/app-context';
import { exportAnamnesisToPDF } from '@/lib/pdf-utils-v2';

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
  const insets = useSafeAreaInsets();
  const { state, dispatch } = useAppContext();
  const [form, setForm] = useState<AnamnesesData>(state.anamnesis ?? EMPTY_FORM);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (state.anamnesis) {
      setForm(state.anamnesis);
    }
  }, [state.anamnesis]);

  const handleSave = () => {
    if (!form.fullName.trim()) {
      Alert.alert('Campo obrigatório', 'Por favor, informe seu nome completo.');
      return;
    }
    if (!form.birthDate.trim()) {
      Alert.alert('Campo obrigatório', 'Por favor, informe sua data de nascimento.');
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
      Alert.alert('Erro', 'Não foi possível exportar a ficha médica.');
      console.error('Export error:', error);
    }
  };

  const updateField = <K extends keyof AnamnesesData>(key: K, value: AnamnesesData[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  };

  return (
    <ScreenContainer edges={["left", "right"]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border, paddingTop: insets.top + 12 }]}>
        <View>
          <Text style={[styles.title, { color: colors.foreground }]}>Ficha de Anamnese</Text>
          <Text style={[styles.subtitle, { color: colors.muted }]}>
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
    paddingVertical: 16,
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
