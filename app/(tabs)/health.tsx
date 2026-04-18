import * as Haptics from 'expo-haptics';
import React, { useState } from 'react';
import {
  Alert,
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
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { ScreenContainer } from '@/components/screen-container';
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
  const METRIC_CONFIG = getMetricConfig(colors);
  const STATUS_CONFIG = getStatusConfig(colors);

  const handleSave = () => {
    const value = parseFloat(valueText);
    if (isNaN(value) || value <= 0) {
      Alert.alert('Valor inválido', 'Por favor, insira um valor numérico válido.');
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
    setModalVisible(false);
  };

  const handleDelete = (id: string) => {
    Alert.alert('Excluir registro', 'Deseja excluir este registro de saúde?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: () => dispatch({ type: 'DELETE_HEALTH_METRIC', payload: id }),
      },
    ]);
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
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
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
    </ScreenContainer>
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
    paddingVertical: 16,
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
    paddingVertical: 16,
    fontSize: 16,
  },
  hintText: { fontSize: 13, textAlign: 'center' },
});
