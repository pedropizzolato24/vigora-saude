import * as Haptics from 'expo-haptics';
import React, { useState } from 'react';
import { useAccessibility } from '@/lib/accessibility-context';
import { HealthReportButton } from '@/components/health-report-button';
import {
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { AppDialog, useAppDialog } from '@/components/app-dialog';
import { AppToast, useAppToast } from '@/components/app-toast';
import { FormKeyboardView } from '@/components/form-keyboard-view';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { ScreenContainer } from '@/components/screen-container';
import { HealthConsentGate } from '@/components/health-consent-gate';
import { WizardStep } from '@/components/wizard-step';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/use-colors';
import { useFontSize } from '@/lib/font-size-context';
import { BrandFonts } from '@/lib/_core/theme';
import { generateId, useAppContext, type HealthMetric } from '@/lib/app-context';

type MetricType = HealthMetric['type'];

interface MetricConfig {
  title: string;
  helper?: string;
  unit: string;
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  placeholder: string;
}

const METRIC_CONFIG: Record<MetricType, MetricConfig> = {
  heart_rate: {
    title: 'Batimentos do coração',
    unit: 'bpm',
    icon: 'favorite',
    placeholder: 'Ex: 72',
  },
  blood_pressure: {
    title: 'Pressão',
    helper: 'Pressão do sangue',
    unit: 'mmHg',
    icon: 'monitor-heart',
    placeholder: 'Ex: 120',
  },
  glucose: {
    title: 'Glicose',
    helper: 'Nível de açúcar no sangue',
    unit: 'mg/dL',
    icon: 'water-drop',
    placeholder: 'Ex: 90',
  },
};

const METRIC_TYPES = Object.keys(METRIC_CONFIG) as MetricType[];

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

// ---------------------------------------------------------------------------
// BigMetricRow — one row per metric type showing latest value + "+ Anotar"
// ---------------------------------------------------------------------------

interface BigMetricRowProps {
  type: MetricType;
  latestValue: number | undefined;
  unit: string;
  onAnnotate: () => void;
  colors: ReturnType<typeof useColors>;
  fs: ReturnType<typeof useFontSize>;
}

function BigMetricRow({ type, latestValue, unit, onAnnotate, colors, fs }: BigMetricRowProps) {
  const cfg = METRIC_CONFIG[type];
  return (
    <View
      style={[
        styles.bigRow,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      {/* Icon container — neutral primary, never value-derived */}
      <View style={[styles.bigRowIcon, { backgroundColor: colors.primaryLight }]}>
        <MaterialIcons name={cfg.icon} size={28} color={colors.primary} />
      </View>

      {/* Label + value */}
      <View style={styles.bigRowInfo}>
        <Text
          style={[styles.bigRowTitle, { color: colors.foreground, fontSize: fs.base, fontFamily: BrandFonts.body }]}
          numberOfLines={1}
        >
          {cfg.title}
        </Text>
        {cfg.helper ? (
          <Text style={[styles.bigRowHelper, { color: colors.muted, fontSize: fs.sm, fontFamily: BrandFonts.body }]}>
            {cfg.helper}
          </Text>
        ) : null}
        {latestValue !== undefined ? (
          <View style={styles.bigRowValueRow}>
            <Text style={[styles.bigRowValue, { color: colors.foreground, fontSize: fs.lg, fontFamily: BrandFonts.monoRegular }]}>
              {latestValue}
            </Text>
            <Text style={[styles.bigRowUnit, { color: colors.muted, fontSize: fs.sm, fontFamily: BrandFonts.body }]}>
              {unit}
            </Text>
          </View>
        ) : (
          <Text style={[styles.bigRowNoData, { color: colors.muted, fontSize: fs.sm, fontFamily: BrandFonts.body }]}>
            Sem registro
          </Text>
        )}
      </View>

      {/* "+ Anotar" action */}
      <Pressable
        onPress={onAnnotate}
        accessibilityRole="button"
        accessibilityLabel={`Anotar ${cfg.title}`}
        style={({ pressed }) => [
          styles.annotateBtn,
          { backgroundColor: colors.primaryLight, minHeight: fs.touch(48), opacity: pressed ? 0.75 : 1 },
        ]}
      >
        <MaterialIcons name="add" size={16} color={colors.primary} />
        <Text style={[styles.annotateBtnText, { color: colors.primary, fontSize: fs.sm, fontFamily: BrandFonts.body }]}>
          Anotar
        </Text>
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function HealthScreen() {
  const colors = useColors();
  const fs = useFontSize();
  const insets = useSafeAreaInsets();
  const { state, dispatch } = useAppContext();

  // Wizard state: null = closed; 0 = type select; 1 = value entry
  const [wizardVisible, setWizardVisible] = useState(false);
  const [wizardStep, setWizardStep] = useState<0 | 1>(0);
  const [selectedType, setSelectedType] = useState<MetricType>('heart_rate');
  const [valueText, setValueText] = useState('');

  const { isAccessibilityMode, a11yFontSize: af, a11yColors: ac, a11ySpacing: as_ } = useAccessibility();
  const { dialogProps, showDialog } = useAppDialog();
  const { toastProps, showToast } = useAppToast();

  const openWizard = (preselect?: MetricType) => {
    setValueText('');
    if (preselect) {
      setSelectedType(preselect);
      setWizardStep(1);
    } else {
      setSelectedType('heart_rate');
      setWizardStep(0);
    }
    setWizardVisible(true);
  };

  const handleSave = () => {
    const value = parseFloat(valueText);
    if (isNaN(value) || value <= 0) {
      showDialog({
        title: 'Valor inválido',
        message: 'Por favor, insira um valor numérico válido.',
        variant: 'warning',
        buttons: [{ text: 'OK' }],
      });
      return;
    }

    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }

    dispatch({
      type: 'ADD_HEALTH_METRIC',
      payload: {
        id: generateId(),
        type: selectedType,
        value,
        unit: METRIC_CONFIG[selectedType].unit,
        timestamp: Date.now(),
      },
    });

    setValueText('');
    setWizardVisible(false);
    showToast({ message: 'Anotado ✓', variant: 'success' });
  };

  const handleDelete = (id: string) => {
    showDialog({
      title: 'Excluir registro',
      message: 'Deseja excluir este registro?',
      variant: 'confirm',
      buttons: [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Excluir', style: 'destructive', onPress: () => dispatch({ type: 'DELETE_HEALTH_METRIC', payload: id }) },
      ],
    });
  };

  const renderHistoryItem = ({ item }: { item: HealthMetric }) => {
    const cfg = METRIC_CONFIG[item.type];
    return (
      <View
        style={[
          styles.historyCard,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <View style={[styles.historyIcon, { backgroundColor: colors.primaryLight }]}>
          <MaterialIcons name={cfg.icon} size={20} color={colors.primary} />
        </View>
        <View style={styles.historyInfo}>
          <Text style={[styles.historyType, { color: colors.muted, fontSize: fs.sm, fontFamily: BrandFonts.body }]}>
            {cfg.title}
          </Text>
          <View style={styles.historyValueRow}>
            <Text style={[styles.historyValue, { color: colors.foreground, fontSize: fs.lg, fontFamily: BrandFonts.monoRegular }]}>
              {item.value}
            </Text>
            <Text style={[styles.historyUnit, { color: colors.muted, fontSize: fs.sm, fontFamily: BrandFonts.body }]}>
              {item.unit}
            </Text>
          </View>
          <Text style={[styles.historyTime, { color: colors.muted, fontSize: fs.sm, fontFamily: BrandFonts.body }]}>
            {formatTimestamp(item.timestamp)}
          </Text>
        </View>
        <Pressable
          onPress={() => handleDelete(item.id)}
          accessibilityRole="button"
          accessibilityLabel="Excluir registro"
          style={({ pressed }) => [styles.deleteBtn, { minHeight: fs.touch(44) }, pressed && { opacity: 0.6 }]}
        >
          <MaterialIcons name="delete-outline" size={20} color={colors.error} />
        </Pressable>
      </View>
    );
  };

  // LGPD Art. 11: não coletar dados sensíveis de saúde sem consentimento
  // destacado. Quem JÁ tem dados (instalações antigas) é mantido (grandfather).
  const hasHealthData = !!state.anamnesis || (state.healthMetrics?.length ?? 0) > 0;
  if (!state.settings.healthConsentAt && !hasHealthData) {
    return (
      <ScreenContainer edges={['left', 'right']}>
        <HealthConsentGate>{null}</HealthConsentGate>
      </ScreenContainer>
    );
  }

  // --- ACCESSIBILITY MODE ---------------------------------------------------
  if (isAccessibilityMode) {
    return (
      <ScreenContainer edges={['left', 'right']} containerStyle={{ backgroundColor: ac.background }}>
        {/* A11y Header — só título; ações ficam no corpo da tela */}
        <View
          style={{
            paddingHorizontal: 20,
            paddingTop: insets.top + 12,
            paddingBottom: 16,
            borderBottomWidth: 2,
            borderBottomColor: ac.border,
            backgroundColor: ac.bar,
          }}
        >
          <Text style={{ fontSize: af['2xl'], fontWeight: '900', color: ac.foreground, fontFamily: BrandFonts.body }}>
            Como você está?
          </Text>
          <Text style={{ fontSize: af.sm, color: ac.muted, marginTop: 4, fontFamily: BrandFonts.body }}>
            {state.healthMetrics.length} registro(s)
          </Text>
        </View>

        {/* A11y BigMetricRows */}
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 16, gap: 12 }} showsVerticalScrollIndicator={false}>
          {METRIC_TYPES.map((type) => {
            const cfg = METRIC_CONFIG[type];
            const latest = state.healthMetrics.find((m) => m.type === type);
            return (
              <View
                key={type}
                style={{
                  backgroundColor: ac.surface,
                  borderRadius: 16,
                  borderWidth: 2,
                  borderColor: ac.border,
                  padding: 18,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 14,
                }}
              >
                <View
                  style={{
                    width: 60,
                    height: 60,
                    borderRadius: 14,
                    backgroundColor: ac.primary + '15',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <MaterialIcons name={cfg.icon} size={30} color={ac.primary} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontSize: af.md, fontWeight: '800', color: ac.foreground, fontFamily: BrandFonts.body }}>
                    {cfg.title}
                  </Text>
                  {cfg.helper ? (
                    <Text style={{ fontSize: af.sm, color: ac.muted, fontFamily: BrandFonts.body }}>{cfg.helper}</Text>
                  ) : null}
                  {latest !== undefined ? (
                    <Text style={{ fontSize: af.lg, color: ac.foreground, fontFamily: BrandFonts.monoRegular, fontWeight: '700' }}>
                      {latest.value}{' '}
                      <Text style={{ fontSize: af.sm, color: ac.muted, fontFamily: BrandFonts.body, fontWeight: '400' }}>
                        {cfg.unit}
                      </Text>
                    </Text>
                  ) : (
                    <Text style={{ fontSize: af.sm, color: ac.muted, fontFamily: BrandFonts.body }}>Sem registro</Text>
                  )}
                </View>
                <Pressable
                  onPress={() => openWizard(type)}
                  accessibilityRole="button"
                  accessibilityLabel={`Anotar ${cfg.title}`}
                  style={({ pressed }) => [
                    {
                      backgroundColor: ac.primary,
                      paddingHorizontal: 18,
                      paddingVertical: 14,
                      borderRadius: 14,
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: pressed ? 0.8 : 1,
                      minHeight: 64,
                    },
                  ]}
                >
                  <MaterialIcons name="add" size={26} color={ac.onPrimary} />
                  <Text style={{ fontSize: af.sm, color: ac.onPrimary, fontFamily: BrandFonts.body, fontWeight: '700', marginTop: 2 }}>
                    Anotar
                  </Text>
                </Pressable>
              </View>
            );
          })}

          {/* Relatório PDF — botão de largura total, fora do cabeçalho */}
          <HealthReportButton />
        </ScrollView>

        {/* A11y History */}
        {state.healthMetrics.length > 0 && (
          <>
            <View style={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 8 }}>
              <Text style={{ fontSize: af.sm, fontWeight: '700', color: ac.muted, textTransform: 'uppercase', letterSpacing: 0.5, fontFamily: BrandFonts.body }}>
                Histórico
              </Text>
            </View>
            <FlatList
              data={state.healthMetrics}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => {
                const cfg = METRIC_CONFIG[item.type];
                return (
                  <View
                    style={{
                      marginHorizontal: 20,
                      marginBottom: 10,
                      backgroundColor: ac.surface,
                      borderRadius: 16,
                      borderWidth: 2,
                      borderColor: ac.border,
                      padding: 18,
                      gap: 6,
                    }}
                  >
                    <Text style={{ fontSize: af.md, fontWeight: '700', color: ac.muted, fontFamily: BrandFonts.body }}>
                      {cfg.title}
                    </Text>
                    <Text style={{ fontSize: af['2xl'], fontWeight: '900', color: ac.foreground, fontFamily: BrandFonts.monoRegular }}>
                      {item.value}{' '}
                      <Text style={{ fontSize: af.md, fontWeight: '400', color: ac.muted, fontFamily: BrandFonts.body }}>
                        {item.unit}
                      </Text>
                    </Text>
                    <Text style={{ fontSize: af.sm, color: ac.muted, fontFamily: BrandFonts.body }}>
                      {formatTimestamp(item.timestamp)}
                    </Text>
                    <Pressable
                      onPress={() => handleDelete(item.id)}
                      accessibilityRole="button"
                      accessibilityLabel="Excluir registro"
                      style={({ pressed }) => [
                        {
                          marginTop: 4,
                          paddingVertical: 14,
                          borderRadius: 12,
                          borderWidth: 2,
                          borderColor: ac.error,
                          flexDirection: 'row' as const,
                          alignItems: 'center' as const,
                          justifyContent: 'center' as const,
                          gap: 10,
                          backgroundColor: pressed ? ac.error + '20' : ac.background,
                          minHeight: 64,
                        },
                      ]}
                    >
                      <MaterialIcons name="delete" size={24} color={ac.error} />
                      <Text style={{ fontSize: af.md, fontWeight: '700', color: ac.error, fontFamily: BrandFonts.body }}>
                        Excluir
                      </Text>
                    </Pressable>
                  </View>
                );
              }}
              contentContainerStyle={{ paddingBottom: 32 }}
              showsVerticalScrollIndicator={false}
            />
          </>
        )}

        {/* A11y Wizard Modal */}
        <Modal
          visible={wizardVisible}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setWizardVisible(false)}
        >
          <View style={{ flex: 1, backgroundColor: ac.background }}>
            {/* Título apenas — ações ficam na barra inferior */}
            <View
              style={{
                paddingHorizontal: 20,
                paddingTop: insets.top + 16,
                paddingBottom: 16,
                borderBottomWidth: 2,
                borderBottomColor: ac.border,
                alignItems: 'center',
                backgroundColor: ac.bar,
              }}
            >
              <Text style={{ fontSize: af.xl, fontWeight: '900', color: ac.foreground, fontFamily: BrandFonts.body }}>
                Nova Medição
              </Text>
            </View>

            <FormKeyboardView
              style={{ flex: 1 }}
            >
            <ScrollView contentContainerStyle={{ padding: 24, gap: 28 }} keyboardShouldPersistTaps="handled">
              {wizardStep === 0 ? (
                <View style={{ gap: 12 }}>
                  <Text style={{ fontSize: af.lg, fontWeight: '800', color: ac.foreground, fontFamily: BrandFonts.body }}>
                    O que você quer anotar?
                  </Text>
                  {METRIC_TYPES.map((type) => {
                    const cfg = METRIC_CONFIG[type];
                    const selected = selectedType === type;
                    return (
                      <Pressable
                        key={type}
                        onPress={() => { setSelectedType(type); setWizardStep(1); }}
                        accessibilityRole="button"
                        accessibilityLabel={cfg.title}
                        style={[
                          {
                            paddingVertical: as_.buttonPadding,
                            paddingHorizontal: 20,
                            borderRadius: 16,
                            borderWidth: 3,
                            flexDirection: 'row' as const,
                            alignItems: 'center' as const,
                            gap: 14,
                            backgroundColor: selected ? ac.primary : ac.surface,
                            borderColor: selected ? ac.primary : ac.border,
                            minHeight: 64,
                          },
                        ]}
                      >
                        <MaterialIcons name={cfg.icon} size={28} color={selected ? ac.onPrimary : ac.primary} />
                        <View>
                          <Text style={{ fontSize: af.md, fontWeight: '700', color: selected ? ac.onPrimary : ac.foreground, fontFamily: BrandFonts.body }}>
                            {cfg.title}
                          </Text>
                          {cfg.helper ? (
                            <Text style={{ fontSize: af.sm, color: selected ? ac.onPrimary + 'CC' : ac.muted, fontFamily: BrandFonts.body }}>
                              {cfg.helper}
                            </Text>
                          ) : null}
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              ) : (
                <View style={{ gap: 16 }}>
                  <Text style={{ fontSize: af.lg, fontWeight: '800', color: ac.foreground, fontFamily: BrandFonts.body }}>
                    {`Valor em ${METRIC_CONFIG[selectedType].unit}`}
                  </Text>
                  <TextInput
                    value={valueText}
                    onChangeText={setValueText}
                    placeholder={METRIC_CONFIG[selectedType].placeholder}
                    placeholderTextColor={ac.muted}
                    keyboardType="numeric"
                    style={{
                      backgroundColor: ac.surface,
                      color: ac.foreground,
                      borderColor: ac.border,
                      borderWidth: 3,
                      borderRadius: 16,
                      padding: 20,
                      fontSize: af['3xl'],
                      textAlign: 'center',
                      fontFamily: BrandFonts.monoRegular,
                    }}
                    returnKeyType="done"
                    maxLength={6}
                    accessibilityLabel={`Digite o valor em ${METRIC_CONFIG[selectedType].unit}`}
                  />
                </View>
              )}
            </ScrollView>

            {/* Barra inferior de ações */}
            <View style={{ flexDirection: 'row', gap: 12, padding: 20, paddingBottom: Math.max(insets.bottom, 20), borderTopWidth: 2, borderTopColor: ac.border, backgroundColor: ac.bar }}>
              <Pressable
                onPress={() => (wizardStep === 1 ? setWizardStep(0) : setWizardVisible(false))}
                accessibilityRole="button"
                accessibilityLabel={wizardStep === 1 ? 'Voltar' : 'Cancelar'}
                style={({ pressed }) => [{ flex: 1, minHeight: 64, borderRadius: 16, borderWidth: 3, borderColor: ac.muted, backgroundColor: ac.surface, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 }]}
              >
                <Text style={{ fontSize: af.md, fontWeight: '800', color: ac.foreground, fontFamily: BrandFonts.body }}>
                  {wizardStep === 1 ? 'Voltar' : 'Cancelar'}
                </Text>
              </Pressable>
              {wizardStep === 1 && (
                <Pressable
                  onPress={handleSave}
                  accessibilityRole="button"
                  accessibilityLabel="Salvar medição"
                  style={({ pressed }) => [{ flex: 1.5, minHeight: 64, borderRadius: 16, backgroundColor: ac.success, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1 }]}
                >
                  <Text style={{ fontSize: af.md, fontWeight: '800', color: ac.onPrimary, fontFamily: BrandFonts.body }}>
                    Salvar
                  </Text>
                </Pressable>
              )}
            </View>
            </FormKeyboardView>
          </View>
        </Modal>

        <AppDialog {...dialogProps} />
        <AppToast {...toastProps} />
      </ScreenContainer>
    );
  }

  // --- NORMAL MODE -----------------------------------------------------------
  return (
    <ScreenContainer edges={['left', 'right']}>
      {/* Header — só título, sem botões (ações ficam no corpo da tela) */}
      <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.bar, paddingTop: insets.top + 12 }]}>
        <View>
          <Text style={[styles.title, { color: colors.foreground, fontSize: fs['2xl'], fontFamily: BrandFonts.body }]}>
            Como você está?
          </Text>
          <Text style={[styles.subtitle, { color: colors.muted, fontSize: fs.sm, fontFamily: BrandFonts.body }]}>
            {state.healthMetrics.length} registro(s)
          </Text>
        </View>
      </View>

      {/* BigMetricRows — one per type */}
      <View style={[styles.bigRowsContainer, { borderBottomColor: colors.border }]}>
        {METRIC_TYPES.map((type) => {
          const latest = state.healthMetrics.find((m) => m.type === type);
          return (
            <BigMetricRow
              key={type}
              type={type}
              latestValue={latest?.value}
              unit={METRIC_CONFIG[type].unit}
              onAnnotate={() => openWizard(type)}
              colors={colors}
              fs={fs}
            />
          );
        })}

        {/* Relatório PDF — botão de largura total, fora do cabeçalho */}
        <HealthReportButton />
      </View>

      {/* History list */}
      {state.healthMetrics.length === 0 ? (
        <View style={styles.emptyState}>
          <MaterialIcons name="monitor-heart" size={64} color={colors.border} />
          <Text style={[styles.emptyTitle, { color: colors.foreground, fontSize: fs.lg, fontFamily: BrandFonts.body }]}>
            Nenhum registro ainda
          </Text>
          <Text style={[styles.emptySubtext, { color: colors.muted, fontSize: fs.base, lineHeight: fs.scaled(22), fontFamily: BrandFonts.body }]}>
            Use "+ Anotar" em qualquer métrica acima para registrar seu primeiro valor.
          </Text>
        </View>
      ) : (
        <>
          <View style={styles.historyHeader}>
            <Text style={[styles.historyLabel, { color: colors.muted, fontSize: fs.sm, fontFamily: BrandFonts.body }]}>
              Histórico
            </Text>
          </View>
          <FlatList
            data={state.healthMetrics}
            keyExtractor={(item) => item.id}
            renderItem={renderHistoryItem}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />
        </>
      )}

      {/* Wizard Modal */}
      <Modal
        visible={wizardVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setWizardVisible(false)}
      >
        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          {/* Modal header — título apenas; Cancelar fica na barra inferior do wizard */}
          <View style={[styles.modalHeader, { borderBottomColor: colors.border, backgroundColor: colors.bar, paddingTop: insets.top + 16 }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground, fontSize: fs.xl, fontFamily: BrandFonts.body }]}>
              Nova Medição
            </Text>
          </View>

          {/* WizardStep */}
          <FormKeyboardView
            style={styles.wizardContainer}
          >
            {wizardStep === 0 ? (
              <WizardStep
                total={2}
                current={0}
                categoryTag="Medição"
                tagColor={colors.primary}
                question="O que você quer anotar?"
                onNext={() => setWizardStep(1)}
                onCancel={() => setWizardVisible(false)}
                nextLabel="Continuar"
                nextDisabled={false}
              >
                <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
                  <View style={{ gap: 10 }}>
                    {METRIC_TYPES.map((type) => {
                      const cfg = METRIC_CONFIG[type];
                      const selected = selectedType === type;
                      return (
                        <Pressable
                          key={type}
                          onPress={() => setSelectedType(type)}
                          accessibilityRole="button"
                          accessibilityLabel={cfg.title}
                          style={({ pressed }) => [
                            styles.typeCard,
                            {
                              backgroundColor: selected ? colors.primaryLight : colors.surface,
                              borderColor: selected ? colors.primary : colors.border,
                              minHeight: fs.touch(56),
                              opacity: pressed ? 0.8 : 1,
                            },
                          ]}
                        >
                          <View style={[styles.typeCardIcon, { backgroundColor: selected ? colors.primary : colors.primaryLight }]}>
                            <MaterialIcons name={cfg.icon} size={24} color={selected ? colors.onPrimary : colors.primary} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.typeCardTitle, { color: selected ? colors.primary : colors.foreground, fontSize: fs.base, fontFamily: BrandFonts.body }]}>
                              {cfg.title}
                            </Text>
                            {cfg.helper ? (
                              <Text style={[styles.typeCardHelper, { color: colors.muted, fontSize: fs.sm, fontFamily: BrandFonts.body }]}>
                                {cfg.helper}
                              </Text>
                            ) : null}
                          </View>
                          {selected && (
                            <MaterialIcons name="check-circle" size={22} color={colors.primary} />
                          )}
                        </Pressable>
                      );
                    })}
                  </View>
                </ScrollView>
              </WizardStep>
            ) : (
              <WizardStep
                total={2}
                current={1}
                categoryTag={METRIC_CONFIG[selectedType].title}
                tagColor={colors.primary}
                question={`Qual o valor? (${METRIC_CONFIG[selectedType].unit})`}
                onNext={handleSave}
                onBack={() => setWizardStep(0)}
                nextLabel="Salvar"
                nextDisabled={valueText.trim() === '' || isNaN(parseFloat(valueText)) || parseFloat(valueText) <= 0}
              >
                <View style={styles.valueInputContainer}>
                  <TextInput
                    value={valueText}
                    onChangeText={setValueText}
                    placeholder={METRIC_CONFIG[selectedType].placeholder}
                    placeholderTextColor={colors.muted}
                    keyboardType="numeric"
                    style={[
                      styles.valueInput,
                      {
                        backgroundColor: colors.surface,
                        color: colors.foreground,
                        borderColor: colors.border,
                        fontSize: fs.scaled(52),
                        fontFamily: BrandFonts.monoRegular,
                      },
                    ]}
                    returnKeyType="done"
                    maxLength={6}
                    autoFocus
                    accessibilityLabel={`Digite o valor em ${METRIC_CONFIG[selectedType].unit}`}
                  />
                  <Text style={[styles.unitLabel, { color: colors.muted, fontSize: fs.md, fontFamily: BrandFonts.body }]}>
                    {METRIC_CONFIG[selectedType].unit}
                  </Text>
                </View>
              </WizardStep>
            )}
          </FormKeyboardView>
        </View>
      </Modal>

      <AppDialog {...dialogProps} />
      <AppToast {...toastProps} />
    </ScreenContainer>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontWeight: '800' },
  subtitle: { marginTop: 2 },
  // BigMetricRows
  bigRowsContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  bigRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    gap: 12,
  },
  bigRowIcon: {
    width: 60,
    height: 60,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  bigRowInfo: { flex: 1, gap: 2 },
  bigRowTitle: { fontWeight: '700' },
  bigRowHelper: {},
  bigRowValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 2 },
  bigRowValue: { fontWeight: '700' },
  bigRowUnit: {},
  bigRowNoData: { marginTop: 2 },
  annotateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    justifyContent: 'center',
  },
  annotateBtnText: { fontWeight: '700' },
  // History
  historyHeader: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 6,
  },
  historyLabel: {
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  listContent: { paddingHorizontal: 16, paddingBottom: 32, gap: 8 },
  historyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    gap: 12,
  },
  historyIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyInfo: { flex: 1, gap: 2 },
  historyType: {},
  historyValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  historyValue: { fontWeight: '700' },
  historyUnit: {},
  historyTime: {},
  deleteBtn: { padding: 8, minWidth: 44, alignItems: 'center', justifyContent: 'center' },
  // Empty state
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
  },
  emptyTitle: { fontWeight: '700', textAlign: 'center' },
  emptySubtext: { textAlign: 'center' },
  // Wizard Modal
  modal: { flex: 1 },
  modalHeader: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalTitle: { fontWeight: '600' },
  wizardContainer: {
    flex: 1,
    padding: 20,
    paddingBottom: 32,
  },
  // Type cards inside wizard step 0
  typeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  typeCardIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeCardTitle: { fontWeight: '700' },
  typeCardHelper: {},
  // Value input inside wizard step 1
  valueInputContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  valueInput: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 20,
    textAlign: 'center',
    width: '100%',
  },
  unitLabel: { fontWeight: '500' },
});
