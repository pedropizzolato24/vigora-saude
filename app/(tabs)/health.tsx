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
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { ScreenContainer } from '@/components/screen-container';
import { SuccessConfirmation } from '@/components/success-confirmation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/use-colors';
import { useFontSize } from '@/lib/font-size-context';
import { generateId, getHealthStatus, useAppContext, type HealthMetric } from '@/lib/app-context';

type MetricType = HealthMetric['type'];

const getMetricConfig = (colors: any) => ({
  heart_rate: {
    label: 'Frequência Cardíaca',
    unit: 'bpm',
    icon: 'favorite',
    color: colors.emergency,
    placeholder: 'Ex: 72',
    hint: 'Normal: 60-100 bpm',
  },
  blood_pressure: {
    label: 'Pressão Arterial',
    unit: 'mmHg',
    icon: 'monitor-heart',
    color: colors.primary,
    placeholder: 'Ex: 120',
    hint: 'Normal: 90-120 mmHg',
  },
  glucose: {
    label: 'Glicose',
    unit: 'mg/dL',
    icon: 'water-drop',
    color: colors.warning,
    placeholder: 'Ex: 90',
    hint: 'Normal: 70-100 mg/dL',
  },
});

const getStatusConfig = (colors: any) => ({
  normal: { label: 'Normal', color: colors.success, bg: colors.successLight },
  warning: { label: 'Atenção', color: colors.warning, bg: colors.warningLight },
  critical: { label: 'Crítico', color: colors.error, bg: '#EF444415' },
});
function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

export default function HealthScreen() {
  const colors = useColors();
  const fs = useFontSize();
  const insets = useSafeAreaInsets();
  const { state, dispatch } = useAppContext();
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedType, setSelectedType] = useState<MetricType>('heart_rate');
  const [valueText, setValueText] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const METRIC_CONFIG = getMetricConfig(colors);
  const STATUS_CONFIG = getStatusConfig(colors);
  const { isAccessibilityMode, a11yFontSize: af, a11yColors: ac, a11ySpacing: as_ } = useAccessibility();
  const { dialogProps, showDialog } = useAppDialog();
  const { toastProps, showToast } = useAppToast();

  const handleSave = () => {
    const value = parseFloat(valueText);
    if (isNaN(value) || value <= 0) {
      showDialog({ title: 'Valor inválido', message: 'Por favor, insira um valor numérico válido.', variant: 'warning', buttons: [{ text: 'OK' }] });
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

    setShowSuccess(true);
    setValueText('');
    setModalVisible(false);
    showToast({ message: `${METRIC_CONFIG[selectedType].label} registrado com sucesso!`, variant: 'success' });

    // Auto-close success animation after 2.5 seconds
    setTimeout(() => {
      setShowSuccess(false);
    }, 2500);
  };

  const handleDelete = (id: string) => {
    showDialog({
      title: 'Excluir registro',
      message: 'Deseja excluir este registro de saúde?',
      variant: 'confirm',
      buttons: [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Excluir', style: 'destructive', onPress: () => dispatch({ type: 'DELETE_HEALTH_METRIC', payload: id }) },
      ],
    });
  };

  const renderMetric = ({ item }: { item: HealthMetric }) => {
    const config = METRIC_CONFIG[item.type];
    const status = getHealthStatus(item.type, item.value);
    const statusConf = STATUS_CONFIG[status];

    return (
      <View
        style={[
          styles.metricCard,
          { backgroundColor: colors.surface, borderColor: config.color + '30', borderLeftColor: config.color },
        ]}
      >
        <View style={[styles.metricIcon, { backgroundColor: config.color + '15' }]}>
          <MaterialIcons name={config.icon as any} size={40} color={config.color} />
        </View>
        <View style={styles.metricInfo}>
          <Text style={[styles.metricType, { color: colors.muted }]}>{config.label}</Text>
          <View style={styles.metricValueRow}>
            <Text style={[styles.metricValue, { color: colors.foreground }]}>
              {item.value}
            </Text>
            <Text style={[styles.metricUnit, { color: colors.muted }]}>{item.unit}</Text>
          </View>
          <Text style={[styles.metricTime, { color: colors.muted }]}>
            {formatTimestamp(item.timestamp)}
          </Text>
        </View>
        <View style={styles.metricRight}>
          <View style={[styles.statusBadge, { backgroundColor: statusConf.bg }]}>
            <Text style={[styles.statusText, { color: statusConf.color }]}>
              {statusConf.label}
            </Text>
          </View>
          <Pressable
            onPress={() => handleDelete(item.id)}
            style={({ pressed }) => [styles.deleteBtn, pressed && { opacity: 0.6 }]}
          >
            <MaterialIcons name="delete-outline" size={18} color="#EF4444" />
          </Pressable>
        </View>
      </View>
    );
  };

  // ─── ACCESSIBILITY MODE ──────────────────────────────────────────────────
  if (isAccessibilityMode) {
    const A11Y_METRIC_CONFIG = getMetricConfig({ emergency: '#CC0000', primary: ac.primary, warning: '#885500' });
    return (
      <ScreenContainer edges={['left', 'right']} containerClassName="bg-white">
        <View style={{ paddingHorizontal: 20, paddingTop: insets.top + 12, paddingBottom: 16, borderBottomWidth: 2, borderBottomColor: ac.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: ac.background }}>
          <View>
            <Text style={{ fontSize: af['2xl'], fontWeight: '900', color: ac.foreground }}>Saúde</Text>
            <Text style={{ fontSize: af.sm, color: ac.muted, marginTop: 4 }}>{state.healthMetrics.length} registro(s)</Text>
          </View>
          <Pressable
            onPress={() => { setValueText(''); setSelectedType('heart_rate'); setModalVisible(true); }}
            style={({ pressed }) => [{ backgroundColor: ac.success, width: as_.touchTarget, height: as_.touchTarget, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#004400', opacity: pressed ? 0.8 : 1 }]}
            accessibilityLabel="Adicionar métrica de saúde"
          >
            <MaterialIcons name="add" size={36} color="#FFFFFF" />
          </Pressable>
        </View>

        {state.healthMetrics.length === 0 ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 20 }}>
            <MaterialIcons name="monitor-heart" size={80} color={ac.muted} />
            <Text style={{ fontSize: af.xl, fontWeight: '800', color: ac.foreground, textAlign: 'center' }}>Nenhum registro</Text>
            <Text style={{ fontSize: af.md, color: ac.muted, textAlign: 'center', lineHeight: af.md * 1.5 }}>Registre seus dados de saúde para acompanhar sua evolução.</Text>
            <Pressable
              onPress={() => { setValueText(''); setSelectedType('heart_rate'); setModalVisible(true); }}
              style={({ pressed }) => [{ backgroundColor: ac.success, borderRadius: 20, paddingVertical: as_.buttonPadding, paddingHorizontal: 32, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 3, borderColor: '#004400', opacity: pressed ? 0.85 : 1 }]}
            >
              <MaterialIcons name="add" size={32} color="#FFFFFF" />
              <Text style={{ fontSize: af.lg, fontWeight: '800', color: '#FFFFFF' }}>Registrar Métrica</Text>
            </Pressable>
          </View>
        ) : (
          <FlatList
            data={state.healthMetrics}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => {
              const cfg = A11Y_METRIC_CONFIG[item.type];
              const status = getHealthStatus(item.type, item.value);
              const statusColor = status === 'normal' ? ac.success : status === 'warning' ? '#885500' : ac.emergency;
              const statusLabel = status === 'normal' ? 'Normal' : status === 'warning' ? 'Atenção' : 'Crítico';
              return (
                <View style={{ margin: 12, marginBottom: 0, backgroundColor: ac.surface, borderRadius: as_.cardRadius, borderWidth: 2, borderColor: ac.border, padding: 20, gap: 8 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ fontSize: af.md, fontWeight: '700', color: ac.muted }}>{cfg.label}</Text>
                    <View style={{ backgroundColor: statusColor + '20', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 10, borderWidth: 2, borderColor: statusColor }}>
                      <Text style={{ fontSize: af.sm, fontWeight: '800', color: statusColor }}>{statusLabel}</Text>
                    </View>
                  </View>
                  <Text style={{ fontSize: af['3xl'], fontWeight: '900', color: ac.foreground }}>
                    {item.value} <Text style={{ fontSize: af.md, fontWeight: '600', color: ac.muted }}>{item.unit}</Text>
                  </Text>
                  <Text style={{ fontSize: af.sm, color: ac.muted }}>{formatTimestamp(item.timestamp)}</Text>
                  <Pressable
                    onPress={() => handleDelete(item.id)}
                    style={({ pressed }) => [{ marginTop: 4, paddingVertical: 12, borderRadius: 12, borderWidth: 2, borderColor: ac.emergency, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: pressed ? '#FFE0E0' : ac.background }]}
                  >
                    <MaterialIcons name="delete" size={24} color={ac.emergency} />
                    <Text style={{ fontSize: af.md, fontWeight: '700', color: ac.emergency }}>Excluir</Text>
                  </Pressable>
                </View>
              );
            }}
            contentContainerStyle={{ padding: 12, paddingBottom: 32 }}
            showsVerticalScrollIndicator={false}
          />
        )}

        {/* Simplified Modal */}
        <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setModalVisible(false)}>
          <View style={{ flex: 1, backgroundColor: ac.background }}>
            <View style={{ paddingHorizontal: 20, paddingTop: insets.top + 16, paddingBottom: 16, borderBottomWidth: 2, borderBottomColor: ac.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Pressable onPress={() => setModalVisible(false)} style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}>
                <Text style={{ fontSize: af.md, color: ac.muted, fontWeight: '600' }}>Cancelar</Text>
              </Pressable>
              <Text style={{ fontSize: af.xl, fontWeight: '900', color: ac.foreground }}>Nova Métrica</Text>
              <Pressable onPress={handleSave} style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}>
                <Text style={{ fontSize: af.md, color: ac.primary, fontWeight: '800' }}>Salvar</Text>
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={{ padding: 24, gap: 28 }}>
              <View style={{ gap: 12 }}>
                <Text style={{ fontSize: af.lg, fontWeight: '800', color: ac.foreground }}>Tipo de Métrica</Text>
                {(Object.keys(A11Y_METRIC_CONFIG) as MetricType[]).map((type) => {
                  const cfg = A11Y_METRIC_CONFIG[type];
                  const selected = selectedType === type;
                  return (
                    <Pressable
                      key={type}
                      onPress={() => setSelectedType(type)}
                      style={[{ paddingVertical: as_.buttonPadding, paddingHorizontal: 20, borderRadius: 16, borderWidth: 3, flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: selected ? ac.primary : ac.surface, borderColor: selected ? ac.primary : ac.border }]}
                    >
                      <MaterialIcons name={cfg.icon as any} size={28} color={selected ? ac.onPrimary : ac.muted} />
                      <Text style={{ fontSize: af.md, fontWeight: '700', color: selected ? ac.onPrimary : ac.foreground }}>{cfg.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <View style={{ gap: 12 }}>
                <Text style={{ fontSize: af.lg, fontWeight: '800', color: ac.foreground }}>Valor ({A11Y_METRIC_CONFIG[selectedType].unit})</Text>
                <TextInput
                  value={valueText}
                  onChangeText={setValueText}
                  placeholder={A11Y_METRIC_CONFIG[selectedType].placeholder}
                  placeholderTextColor={ac.muted}
                  keyboardType="numeric"
                  style={{ backgroundColor: ac.surface, color: ac.foreground, borderColor: ac.border, borderWidth: 3, borderRadius: 16, padding: 20, fontSize: af['3xl'], textAlign: 'center', fontWeight: '900' }}
                  returnKeyType="done"
                  maxLength={6}
                />
                <Text style={{ fontSize: af.sm, color: ac.muted, textAlign: 'center' }}>{A11Y_METRIC_CONFIG[selectedType].hint}</Text>
              </View>
            </ScrollView>
          </View>
        </Modal>
        <SuccessConfirmation visible={showSuccess} onComplete={() => setShowSuccess(false)} />
        <AppDialog {...dialogProps} />
        <AppToast {...toastProps} />
      </ScreenContainer>
    );
  }

  // ─── NORMAL MODE ──────────────────────────────────────────────────
  return (
    <ScreenContainer edges={["left", "right"]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border, paddingTop: insets.top + 12 }]}>
        <View>
          <Text style={[styles.title, { color: colors.foreground, fontSize: fs['2xl'] }]}>Saúde</Text>
          <Text style={[styles.subtitle, { color: colors.muted, fontSize: fs.sm }]}>
            {state.healthMetrics.length} registro(s)
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          <HealthReportButton compact />
          <Pressable
            onPress={() => {
              setValueText('');
              setSelectedType('heart_rate');
              setModalVisible(true);
            }}
            style={({ pressed }) => [
              styles.addButton,
              { backgroundColor: colors.success, opacity: pressed ? 0.85 : 1 },
            ]}
            accessibilityLabel="Adicionar métrica de saúde"
          >
            <MaterialIcons name="add" size={24} color="#FFFFFF" />
          </Pressable>
        </View>
      </View>

      {/* Summary Cards */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.summaryScroll} contentContainerStyle={styles.summaryContent}>
        {(Object.keys(METRIC_CONFIG) as MetricType[]).map((type) => {
          const config = METRIC_CONFIG[type];
          const latest = state.healthMetrics.find((m) => m.type === type);
          return (
            <View
              key={type}
              style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: config.color + '30' }]}
            >
              <MaterialIcons name={config.icon as any} size={20} color={config.color} />
              <Text style={[styles.summaryLabel, { color: colors.muted }]}>{config.label}</Text>
              {latest ? (
                <>
                  <Text style={[styles.summaryValue, { color: config.color }]}>
                    {latest.value}
                  </Text>
                  <Text style={[styles.summaryUnit, { color: colors.muted }]}>{config.unit}</Text>
                </>
              ) : (
                <Text style={[styles.summaryNoData, { color: colors.muted }]}>—</Text>
              )}
            </View>
          );
        })}
      </ScrollView>

      {/* Metrics List */}
      {state.healthMetrics.length === 0 ? (
        <View style={styles.emptyState}>
          <MaterialIcons name="monitor-heart" size={64} color={colors.border} />
          <Text style={[styles.emptyTitle, { color: colors.foreground, fontSize: fs.lg }]}>
            Nenhum registro de saúde
          </Text>
          <Text style={[styles.emptySubtext, { color: colors.muted }]}>
            Registre suas métricas de saúde para acompanhar sua evolução.
          </Text>
          <Pressable
            onPress={() => {
              setValueText('');
              setSelectedType('heart_rate');
              setModalVisible(true);
            }}
            style={({ pressed }) => [
              styles.emptyButton,
              { backgroundColor: colors.success, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <MaterialIcons name="add" size={20} color="#FFFFFF" />
            <Text style={styles.emptyButtonText}>Registrar Métrica</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={state.healthMetrics}
          keyExtractor={(item) => item.id}
          renderItem={renderMetric}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border, paddingTop: insets.top + 16 }]}>
            <Pressable
              onPress={() => setModalVisible(false)}
              style={({ pressed }) => [styles.modalClose, pressed && { opacity: 0.6 }]}
            >
              <Text style={[styles.modalCloseText, { color: colors.muted }]}>Cancelar</Text>
            </Pressable>
            <Text style={[styles.modalTitle, { color: colors.foreground, fontSize: fs.xl }]}>Nova Métrica</Text>
            <Pressable
              onPress={handleSave}
              style={({ pressed }) => [styles.modalSave, pressed && { opacity: 0.7 }]}
            >
              <Text style={[styles.modalSaveText, { color: colors.primary }]}>Salvar</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.modalContent}>
            {/* Type Selection */}
            <View style={styles.formGroup}>
              <Text style={[styles.formLabel, { color: colors.foreground }]}>Tipo de métrica</Text>
              <View style={styles.typeOptions}>
                {(Object.keys(METRIC_CONFIG) as MetricType[]).map((type) => {
                  const config = METRIC_CONFIG[type];
                  const selected = selectedType === type;
                  return (
                    <Pressable
                      key={type}
                      onPress={() => setSelectedType(type)}
                      style={[
                        styles.typeOption,
                        {
                          backgroundColor: selected ? config.color + '15' : colors.surface,
                          borderColor: selected ? config.color : colors.border,
                        },
                      ]}
                    >
                      <MaterialIcons name={config.icon as any} size={24} color={selected ? config.color : colors.muted} />
                      <Text
                        style={[
                          styles.typeOptionText,
                          { color: selected ? config.color : colors.foreground },
                        ]}
                      >
                        {config.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Value Input */}
            <View style={styles.formGroup}>
              <Text style={[styles.formLabel, { color: colors.foreground }]}>
                Valor ({METRIC_CONFIG[selectedType].unit})
              </Text>
              <TextInput
                value={valueText}
                onChangeText={setValueText}
                placeholder={METRIC_CONFIG[selectedType].placeholder}
                placeholderTextColor={colors.muted}
                keyboardType="numeric"
                style={[
                  styles.textInput,
                  {
                    backgroundColor: colors.surface,
                    color: colors.foreground,
                    borderColor: colors.border,
                    fontSize: 28,
                    textAlign: 'center',
                    fontWeight: '700',
                  },
                ]}
                returnKeyType="done"
                maxLength={6}
              />
              <Text style={[styles.hintText, { color: colors.muted }]}>
                {METRIC_CONFIG[selectedType].hint}
              </Text>
            </View>
          </ScrollView>
        </View>
      </Modal>
      <SuccessConfirmation visible={showSuccess} onComplete={() => setShowSuccess(false)} />
      <AppDialog {...dialogProps} />
      <AppToast {...toastProps} />
    </ScreenContainer>
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
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryScroll: { maxHeight: 120 },
  summaryContent: { paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  summaryCard: {
    width: 130,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    gap: 4,
    alignItems: 'center',
  },
  summaryLabel: { fontSize: 11, textAlign: 'center', fontWeight: '500' },
  summaryValue: { fontSize: 24, fontWeight: '800' },
  summaryUnit: { fontSize: 11 },
  summaryNoData: { fontSize: 24, fontWeight: '800' },
  listContent: { padding: 16, paddingBottom: 32 },
  metricCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderLeftWidth: 4,
    gap: 12,
  },
  metricIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricInfo: { flex: 1, gap: 2 },
  metricType: { fontSize: 12, fontWeight: '500' },
  metricValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  metricValue: { fontSize: 24, fontWeight: '800' },
  metricUnit: { fontSize: 13 },
  metricTime: { fontSize: 12 },
  metricRight: { alignItems: 'flex-end', gap: 8 },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: { fontSize: 12, fontWeight: '600' },
  deleteBtn: { padding: 4 },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
  },
  emptyTitle: { fontSize: 20, fontWeight: '700', textAlign: 'center' },
  emptySubtext: { fontSize: 15, textAlign: 'center', lineHeight: 22 },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 8,
  },
  emptyButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  modal: { flex: 1 },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalClose: { padding: 4, minWidth: 70 },
  modalCloseText: { fontSize: 16 },
  modalTitle: { fontSize: 17, fontWeight: '600' },
  modalSave: { padding: 4, minWidth: 70, alignItems: 'flex-end' },
  modalSaveText: { fontSize: 16, fontWeight: '600' },
  modalContent: { padding: 20, gap: 24 },
  formGroup: { gap: 10 },
  formLabel: { fontSize: 15, fontWeight: '600' },
  typeOptions: { gap: 10 },
  typeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  typeOptionText: { fontSize: 15, fontWeight: '600' },
  textInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingBottom: 16,
    fontSize: 16,
  },
  hintText: { fontSize: 13, textAlign: 'center' },
});
