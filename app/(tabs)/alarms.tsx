import * as Haptics from 'expo-haptics';
import React, { useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { ScreenContainer } from '@/components/screen-container';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AlarmCard } from '@/components/alarm-card';
import { useColors } from '@/hooks/use-colors';
import { generateId, useAppContext, type Alarm } from '@/lib/app-context';
import { scheduleAlarmNotification, cancelAlarmNotification } from '@/lib/notifications-utils';

const REPEAT_OPTIONS: { value: Alarm['repeat']; label: string }[] = [
  { value: 'daily', label: 'Diário' },
  { value: 'weekdays', label: 'Dias úteis' },
  { value: 'weekends', label: 'Fins de semana' },
  { value: 'custom', label: 'Personalizado' },
];

const EMPTY_FORM: Omit<Alarm, 'id'> = {
  time: '08:00',
  description: '',
  enabled: true,
  repeat: 'daily',
  sound: true,
  vibration: true,
};

export default function AlarmsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { state, dispatch } = useAppContext();
  const [modalVisible, setModalVisible] = useState(false);
  const [editingAlarm, setEditingAlarm] = useState<Alarm | null>(null);
  const [form, setForm] = useState<Omit<Alarm, 'id'>>(EMPTY_FORM);
  const minuteInputRef = useRef<TextInput>(null);

  // Derived hour/minute from form.time for the split picker
  const [timeHour, timeMinute] = form.time.split(':');

  const handleHourChange = (val: string) => {
    const digits = val.replace(/\D/g, '').slice(0, 2);
    const hNum = parseInt(digits, 10);
    // Auto-jump to minute field when 2 digits entered or hour > 2
    if (digits.length === 2 || (digits.length === 1 && hNum > 2)) {
      const clampedH = isNaN(hNum) ? '00' : String(Math.min(hNum, 23)).padStart(2, '0');
      setForm((f) => ({ ...f, time: `${clampedH}:${f.time.split(':')[1] || '00'}` }));
      if (digits.length === 2) minuteInputRef.current?.focus();
    } else {
      setForm((f) => ({ ...f, time: `${digits}:${f.time.split(':')[1] || '00'}` }));
    }
  };

  const handleMinuteChange = (val: string) => {
    const digits = val.replace(/\D/g, '').slice(0, 2);
    const mNum = parseInt(digits, 10);
    const clampedM = digits.length === 2 ? String(Math.min(mNum, 59)).padStart(2, '0') : digits;
    const currentHour = form.time.split(':')[0] || '00';
    setForm((f) => ({ ...f, time: `${currentHour}:${clampedM}` }));
  };

  const handleHourBlur = () => {
    const h = parseInt(timeHour, 10);
    const clamped = isNaN(h) ? '00' : String(Math.min(h, 23)).padStart(2, '0');
    setForm((f) => ({ ...f, time: `${clamped}:${f.time.split(':')[1] || '00'}` }));
  };

  const handleMinuteBlur = () => {
    const m = parseInt(timeMinute, 10);
    const clamped = isNaN(m) ? '00' : String(Math.min(m, 59)).padStart(2, '0');
    setForm((f) => ({ ...f, time: `${f.time.split(':')[0] || '00'}:${clamped}` }));
  };

  const sortedAlarms = [...state.alarms].sort((a, b) => {
    const [ah, am] = a.time.split(':').map(Number);
    const [bh, bm] = b.time.split(':').map(Number);
    return ah * 60 + am - (bh * 60 + bm);
  });

  const openAddModal = () => {
    if (state.alarms.length >= 24) {
      Alert.alert('Limite atingido', 'Você pode ter no máximo 24 alarmes.');
      return;
    }
    setEditingAlarm(null);
    setForm(EMPTY_FORM);
    setModalVisible(true);
  };

  const openEditModal = (alarm: Alarm) => {
    setEditingAlarm(alarm);
    setForm({
      time: alarm.time,
      description: alarm.description,
      enabled: alarm.enabled,
      repeat: alarm.repeat,
      sound: alarm.sound,
      vibration: alarm.vibration,
    });
    setModalVisible(true);
  };

  const handleSave = async () => {
    // Validate time format
    const timeRegex = /^([01]?\d|2[0-3]):([0-5]\d)$/;
    if (!timeRegex.test(form.time)) {
      Alert.alert('Hora inválida', 'Use o formato HH:MM (ex: 08:30)');
      return;
    }

    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }

    try {
      if (editingAlarm) {
        // Cancel old notification if exists
        if (editingAlarm.notificationId) {
          await cancelAlarmNotification(editingAlarm.notificationId);
        }
        // Schedule new notification
        const notificationId = await scheduleAlarmNotification({ ...form, id: editingAlarm.id } as Alarm);
        dispatch({ type: 'UPDATE_ALARM', payload: { ...form, id: editingAlarm.id, notificationId: notificationId || undefined } });
      } else {
        const alarmId = generateId();
        // Schedule notification for new alarm
        const notificationId = await scheduleAlarmNotification({ ...form, id: alarmId } as Alarm);
        dispatch({ type: 'ADD_ALARM', payload: { ...form, id: alarmId, notificationId: notificationId || undefined } });
      }
      setModalVisible(false);
    } catch (error) {
      console.error('Error scheduling alarm notification:', error);
      Alert.alert('Erro', 'Não foi possível agendar a notificação do alarme.');
    }
  };

  const handleDelete = (id: string) => {
    Alert.alert('Excluir Alarme', 'Tem certeza que deseja excluir este alarme?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          if (Platform.OS !== 'web') {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          }
          // Find alarm and cancel its notification
          const alarm = state.alarms.find(a => a.id === id);
          if (alarm?.notificationId) {
            await cancelAlarmNotification(alarm.notificationId);
          }
          dispatch({ type: 'DELETE_ALARM', payload: id });
        },
      },
    ]);
  };

  const handleToggle = async (alarm: Alarm) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    
    const newEnabled = !alarm.enabled;
    
    try {
      if (newEnabled && !alarm.notificationId) {
        // Enable alarm: schedule notification
        const notificationId = await scheduleAlarmNotification(alarm);
        dispatch({ type: 'UPDATE_ALARM', payload: { ...alarm, enabled: true, notificationId: notificationId || undefined } });
      } else if (!newEnabled && alarm.notificationId) {
        // Disable alarm: cancel notification
        await cancelAlarmNotification(alarm.notificationId);
        dispatch({ type: 'UPDATE_ALARM', payload: { ...alarm, enabled: false, notificationId: undefined } });
      } else {
        dispatch({ type: 'UPDATE_ALARM', payload: { ...alarm, enabled: newEnabled } });
      }
    } catch (error) {
      console.error('Error toggling alarm notification:', error);
    }
  };

  return (
    <ScreenContainer edges={["left", "right"]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border, paddingTop: insets.top + 12 }]}>
        <View>
          <Text style={[styles.title, { color: colors.foreground }]}>Alarmes</Text>
          <Text style={[styles.subtitle, { color: colors.muted }]}>
            {state.alarms.length}/24 alarmes configurados
          </Text>
        </View>
        <Pressable
          onPress={openAddModal}
          style={({ pressed }) => [
            styles.addButton,
            { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
          ]}
          accessibilityLabel="Adicionar alarme"
        >
          <MaterialIcons name="add" size={24} color="#FFFFFF" />
        </Pressable>
      </View>

      {/* List */}
      {sortedAlarms.length === 0 ? (
        <View style={styles.emptyState}>
          <MaterialIcons name="alarm" size={64} color={colors.border} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
            Nenhum alarme configurado
          </Text>
          <Text style={[styles.emptySubtext, { color: colors.muted }]}>
            Toque em "+" para adicionar seu primeiro alarme de medicação.
          </Text>
          <Pressable
            onPress={openAddModal}
            style={({ pressed }) => [
              styles.emptyButton,
              { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <MaterialIcons name="add" size={20} color="#FFFFFF" />
            <Text style={styles.emptyButtonText}>Adicionar Alarme</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={sortedAlarms}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <AlarmCard
              alarm={item}
              onEdit={openEditModal}
              onDelete={handleDelete}
              onToggle={handleToggle}
            />
          )}
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
          {/* Modal Header */}
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Pressable
              onPress={() => setModalVisible(false)}
              style={({ pressed }) => [styles.modalClose, pressed && { opacity: 0.6 }]}
            >
              <Text style={[styles.modalCloseText, { color: colors.muted }]}>Cancelar</Text>
            </Pressable>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              {editingAlarm ? 'Editar Alarme' : 'Novo Alarme'}
            </Text>
            <Pressable
              onPress={handleSave}
              style={({ pressed }) => [styles.modalSave, pressed && { opacity: 0.7 }]}
            >
              <Text style={[styles.modalSaveText, { color: colors.primary }]}>Salvar</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.modalContent}>
            {/* Time Picker */}
            <View style={styles.formGroup}>
              <Text style={[styles.formLabel, { color: colors.foreground }]}>Horário</Text>
              <View style={styles.timePicker}>
                <View style={styles.timeInputWrapper}>
                  <TextInput
                    value={timeHour}
                    onChangeText={handleHourChange}
                    onBlur={handleHourBlur}
                    placeholder="08"
                    placeholderTextColor={colors.muted}
                    keyboardType="number-pad"
                    style={[
                      styles.timeInput,
                      {
                        backgroundColor: colors.surface,
                        color: colors.foreground,
                        borderColor: colors.border,
                      },
                    ]}
                    returnKeyType="next"
                    maxLength={2}
                    selectTextOnFocus
                    onSubmitEditing={() => minuteInputRef.current?.focus()}
                  />
                  <Text style={[styles.timeInputLabel, { color: colors.muted }]}>hora</Text>
                </View>
                <Text style={[styles.timeColon, { color: colors.foreground }]}>:</Text>
                <View style={styles.timeInputWrapper}>
                  <TextInput
                    ref={minuteInputRef}
                    value={timeMinute}
                    onChangeText={handleMinuteChange}
                    onBlur={handleMinuteBlur}
                    placeholder="00"
                    placeholderTextColor={colors.muted}
                    keyboardType="number-pad"
                    style={[
                      styles.timeInput,
                      {
                        backgroundColor: colors.surface,
                        color: colors.foreground,
                        borderColor: colors.border,
                      },
                    ]}
                    returnKeyType="done"
                    maxLength={2}
                    selectTextOnFocus
                  />
                  <Text style={[styles.timeInputLabel, { color: colors.muted }]}>min</Text>
                </View>
              </View>
            </View>

            {/* Description */}
            <View style={styles.formGroup}>
              <Text style={[styles.formLabel, { color: colors.foreground }]}>Descrição</Text>
              <TextInput
                value={form.description}
                onChangeText={(v) => setForm((f) => ({ ...f, description: v }))}
                placeholder="Ex: Tomar remédio para pressão"
                placeholderTextColor={colors.muted}
                style={[
                  styles.textInput,
                  {
                    backgroundColor: colors.surface,
                    color: colors.foreground,
                    borderColor: colors.border,
                  },
                ]}
                returnKeyType="done"
                maxLength={80}
              />
            </View>

            {/* Repeat */}
            <View style={styles.formGroup}>
              <Text style={[styles.formLabel, { color: colors.foreground }]}>Repetição</Text>
              <View style={styles.repeatOptions}>
                {REPEAT_OPTIONS.map((opt) => (
                  <Pressable
                    key={opt.value}
                    onPress={() => setForm((f) => ({ ...f, repeat: opt.value }))}
                    style={[
                      styles.repeatOption,
                      {
                        backgroundColor:
                          form.repeat === opt.value ? '#0066CC' : colors.surface,
                        borderColor:
                          form.repeat === opt.value ? '#0066CC' : colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.repeatOptionText,
                        { color: form.repeat === opt.value ? '#FFFFFF' : colors.foreground },
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Toggles */}
            <View style={[styles.togglesSection, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.toggleRow}>
                <View style={styles.toggleLeft}>
                  <MaterialIcons name="volume-up" size={20} color={colors.muted} />
                  <Text style={[styles.toggleLabel, { color: colors.foreground }]}>Som</Text>
                </View>
                <Switch
                  value={form.sound}
                  onValueChange={(v) => setForm((f) => ({ ...f, sound: v }))}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor="#FFFFFF"
                />
              </View>
              <View style={[styles.toggleDivider, { backgroundColor: colors.border }]} />
              <View style={styles.toggleRow}>
                <View style={styles.toggleLeft}>
                  <MaterialIcons name="vibration" size={20} color={colors.muted} />
                  <Text style={[styles.toggleLabel, { color: colors.foreground }]}>Vibração</Text>
                </View>
                <Switch
                  value={form.vibration}
                  onValueChange={(v) => setForm((f) => ({ ...f, vibration: v }))}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor="#FFFFFF"
                />
              </View>
              <View style={[styles.toggleDivider, { backgroundColor: colors.border }]} />
              <View style={styles.toggleRow}>
                <View style={styles.toggleLeft}>
                  <MaterialIcons name="check-circle" size={20} color={colors.muted} />
                  <Text style={[styles.toggleLabel, { color: colors.foreground }]}>Habilitado</Text>
                </View>
                <Switch
                  value={form.enabled}
                  onValueChange={(v) => setForm((f) => ({ ...f, enabled: v }))}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor="#FFFFFF"
                />
              </View>
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
  title: {
    fontSize: 28,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: 14,
    marginTop: 2,
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    padding: 16,
    paddingBottom: 32,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 8,
  },
  emptyButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  modal: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalClose: {
    padding: 4,
    minWidth: 70,
  },
  modalCloseText: {
    fontSize: 16,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  modalSave: {
    padding: 4,
    minWidth: 70,
    alignItems: 'flex-end',
  },
  modalSaveText: {
    fontSize: 16,
    fontWeight: '600',
  },
  modalContent: {
    padding: 20,
    gap: 20,
  },
  formGroup: {
    gap: 8,
  },
  formLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  textInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
  },
  repeatOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  repeatOption: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  repeatOptionText: {
    fontSize: 14,
    fontWeight: '500',
  },
  togglesSection: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  toggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  toggleLabel: {
    fontSize: 16,
    fontWeight: '500',
  },
  toggleDivider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 16,
  },

  // Time Picker
  timePicker: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  timeInputWrapper: {
    alignItems: 'center',
    gap: 4,
  },
  timeInput: {
    width: 90,
    height: 72,
    borderRadius: 16,
    borderWidth: 1.5,
    fontSize: 36,
    fontWeight: '700',
    textAlign: 'center',
  },
  timeColon: {
    fontSize: 40,
    fontWeight: '800',
    marginBottom: 20,
    paddingHorizontal: 4,
  },
  timeInputLabel: {
    fontSize: 12,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
