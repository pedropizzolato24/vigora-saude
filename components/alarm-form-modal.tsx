/**
 * AlarmFormModal
 *
 * Formulário de lembrete (criar/editar) em tela única.
 *   Modo normal:    Nome → Que horas tomar? → Repetição → Som → Vibração →
 *                   Habilitado → Excluir (só na edição); Cancelar/Salvar fixos.
 *   Modo acessível: formulário próprio — horário com setas, repetição diário/
 *                   dias úteis, Som e Vibração em linhas grandes.
 *
 * Quem agenda e grava é o pai (onSave/onDelete): este componente só edita.
 */
import * as Haptics from 'expo-haptics';
import React, { useEffect, useRef, useState } from 'react';
import {
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FormKeyboardView } from '@/components/form-keyboard-view';
import { WheelPicker, wheelColumnMetrics } from '@/components/wheel-picker';
import { useColors } from '@/hooks/use-colors';
import { useAccessibility } from '@/lib/accessibility-context';
import { useFontSize } from '@/lib/font-size-context';
import { BrandFonts } from '@/lib/_core/theme';
import { CHECKIN_ESCALATE_OPTIONS, DEFAULT_ESCALATE_MINUTES, type AlarmKind } from '@/lib/alarm-kind';
import type { Alarm } from '@/lib/app-context';
import {
  formFromAlarm,
  isFormSaveDisabled,
  REPEAT_OPTIONS,
  type AlarmFormValues,
} from '@/lib/alarm-form';

const WEEKDAYS = [
  { day: 0, label: 'D', full: 'Dom' },
  { day: 1, label: 'S', full: 'Seg' },
  { day: 2, label: 'T', full: 'Ter' },
  { day: 3, label: 'Q', full: 'Qua' },
  { day: 4, label: 'Q', full: 'Qui' },
  { day: 5, label: 'S', full: 'Sex' },
  { day: 6, label: 'S', full: 'Sáb' },
];

const TIME_QUICK_PICKS = ['08:00', '12:00', '20:00'];

interface AlarmFormModalProps {
  visible: boolean;
  /** Alarme em edição; null = novo. */
  editingAlarm: Alarm | null;
  onCancel: () => void;
  onSave: (form: AlarmFormValues) => void;
  onDelete: (alarmId: string) => void;
  /** Tipo do alarme NOVO (ignorado na edição). */
  newKind?: AlarmKind;
}

export function AlarmFormModal({ visible, editingAlarm, onCancel, onSave, onDelete, newKind = 'medication' }: AlarmFormModalProps) {
  const colors = useColors();
  const fs = useFontSize();
  const insets = useSafeAreaInsets();
  const { isAccessibilityMode, a11yFontSize: af, a11yColors: ac, a11ySpacing: as_ } = useAccessibility();
  const minuteInputRef = useRef<TextInput>(null);
  const [form, setForm] = useState<AlarmFormValues>(() => formFromAlarm(editingAlarm, newKind));

  // Cada abertura recomeça do alarme em edição (ou do formulário em branco).
  useEffect(() => {
    if (visible) setForm(formFromAlarm(editingAlarm, newKind));
  }, [visible, editingAlarm, newKind]);

  const [timeHour, timeMinute] = form.time.split(':');
  const saveDisabled = isFormSaveDisabled(form);
  const colonMetrics = wheelColumnMetrics(isAccessibilityMode, as_.touchTarget);
  const isCheckin = form.kind === 'checkin';
  const escalateValue = form.escalateAfterMinutes ?? DEFAULT_ESCALATE_MINUTES;
  const setEscalate = (minutes: (typeof CHECKIN_ESCALATE_OPTIONS)[number]) =>
    setForm((f) => ({ ...f, escalateAfterMinutes: minutes }));
  const nounLower = isCheckin ? 'check-in' : 'lembrete';
  const title = editingAlarm ? (isCheckin ? 'Editar Check-in' : 'Editar Lembrete') : (isCheckin ? 'Novo Check-in' : 'Novo Lembrete');

  // --- Horário digitado (modo acessível) -----------------------------------
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

  const incrementHour = (delta: number) => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const h = parseInt(timeHour, 10);
    const base = isNaN(h) ? 0 : h;
    const next = (base + delta + 24) % 24;
    setForm((f) => ({ ...f, time: `${String(next).padStart(2, '0')}:${f.time.split(':')[1] || '00'}` }));
  };

  const incrementMinute = (delta: number) => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const m = parseInt(timeMinute, 10);
    const base = isNaN(m) ? 0 : m;
    const next = (base + delta + 60) % 60;
    setForm((f) => ({ ...f, time: `${f.time.split(':')[0] || '00'}:${String(next).padStart(2, '0')}` }));
  };

  const toggleDay = (day: number, selected: boolean) => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setForm((f) => {
      const days = f.customDays ?? [];
      return { ...f, customDays: selected ? days.filter((d) => d !== day) : [...days, day].sort() };
    });
  };

  // ==========================================================================
  // MODO ACESSÍVEL
  // ==========================================================================
  if (isAccessibilityMode) {
    const timeBox = {
      width: 90,
      height: 90,
      textAlign: 'center' as const,
      fontSize: af['3xl'],
      fontWeight: '900' as const,
      color: ac.foreground,
      backgroundColor: ac.surface,
      borderRadius: 16,
      borderWidth: 3,
      borderColor: ac.primary,
    };
    const arrow = { backgroundColor: ac.surface, borderRadius: 16, padding: 12, borderWidth: 2, borderColor: ac.border };

    return (
      <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onCancel}>
        <View style={{ flex: 1, backgroundColor: ac.background }}>
          {/* Título apenas — Cancelar/Salvar ficam na barra inferior */}
          <View style={{ paddingHorizontal: 20, paddingTop: insets.top + 16, paddingBottom: 16, borderBottomWidth: 2, borderBottomColor: ac.border, alignItems: 'center', backgroundColor: ac.bar }}>
            <Text style={{ fontSize: af.xl, fontWeight: '900', color: ac.foreground }}>{title}</Text>
          </View>
          <FormKeyboardView style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={{ padding: 24, gap: 28 }} keyboardShouldPersistTaps="handled">
              {/* Time */}
              <View style={{ gap: 12 }}>
                <Text style={{ fontSize: af.lg, fontWeight: '800', color: ac.foreground }}>Horário</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
                  <View style={{ alignItems: 'center', gap: 8 }}>
                    <Pressable onPress={() => incrementHour(1)} style={({ pressed }) => [arrow, { opacity: pressed ? 0.6 : 1 }]} accessibilityRole="button" accessibilityLabel="Aumentar hora">
                      <MaterialIcons name="keyboard-arrow-up" size={36} color={ac.primary} />
                    </Pressable>
                    <TextInput
                      value={timeHour}
                      onChangeText={handleHourChange}
                      onBlur={handleHourBlur}
                      placeholder="08"
                      placeholderTextColor={ac.muted}
                      keyboardType="number-pad"
                      style={timeBox}
                      maxLength={2}
                      selectTextOnFocus
                    />
                    <Pressable onPress={() => incrementHour(-1)} style={({ pressed }) => [arrow, { opacity: pressed ? 0.6 : 1 }]} accessibilityRole="button" accessibilityLabel="Diminuir hora">
                      <MaterialIcons name="keyboard-arrow-down" size={36} color={ac.primary} />
                    </Pressable>
                    <Text style={{ fontSize: af.sm, color: ac.muted, fontWeight: '600' }}>hora</Text>
                  </View>
                  <Text style={{ fontSize: af['4xl'], fontWeight: '900', color: ac.foreground, marginBottom: 32 }}>:</Text>
                  <View style={{ alignItems: 'center', gap: 8 }}>
                    <Pressable onPress={() => incrementMinute(1)} style={({ pressed }) => [arrow, { opacity: pressed ? 0.6 : 1 }]} accessibilityRole="button" accessibilityLabel="Aumentar minuto">
                      <MaterialIcons name="keyboard-arrow-up" size={36} color={ac.primary} />
                    </Pressable>
                    <TextInput
                      ref={minuteInputRef}
                      value={timeMinute}
                      onChangeText={handleMinuteChange}
                      onBlur={handleMinuteBlur}
                      placeholder="00"
                      placeholderTextColor={ac.muted}
                      keyboardType="number-pad"
                      style={timeBox}
                      maxLength={2}
                      selectTextOnFocus
                    />
                    <Pressable onPress={() => incrementMinute(-1)} style={({ pressed }) => [arrow, { opacity: pressed ? 0.6 : 1 }]} accessibilityRole="button" accessibilityLabel="Diminuir minuto">
                      <MaterialIcons name="keyboard-arrow-down" size={36} color={ac.primary} />
                    </Pressable>
                    <Text style={{ fontSize: af.sm, color: ac.muted, fontWeight: '600' }}>min</Text>
                  </View>
                </View>
              </View>

              {/* Description */}
              {!isCheckin && (
                <View style={{ gap: 12 }}>
                  <Text style={{ fontSize: af.lg, fontWeight: '800', color: ac.foreground }}>Nome do Lembrete</Text>
                  <TextInput
                    value={form.description}
                    onChangeText={(v) => setForm((f) => ({ ...f, description: v }))}
                    placeholder="Ex: Tomar remédio para pressão"
                    placeholderTextColor={ac.muted}
                    style={{ backgroundColor: ac.surface, color: ac.foreground, borderColor: ac.border, borderWidth: 2, borderRadius: 16, padding: 18, fontSize: af.md, fontWeight: '500' }}
                    returnKeyType="done"
                    maxLength={80}
                  />
                </View>
              )}

              {/* Repeat - simplified to just daily/weekdays */}
              <View style={{ gap: 12 }}>
                <Text style={{ fontSize: af.lg, fontWeight: '800', color: ac.foreground }}>Repetição</Text>
                {[{ value: 'daily' as const, label: 'Todos os dias' }, { value: 'weekdays' as const, label: 'Dias úteis (Seg-Sex)' }].map((opt) => (
                  <Pressable
                    key={opt.value}
                    onPress={() => setForm((f) => ({ ...f, repeat: opt.value }))}
                    style={[{
                      paddingVertical: as_.buttonPadding,
                      paddingHorizontal: 20,
                      borderRadius: 16,
                      borderWidth: 3,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 14,
                      backgroundColor: form.repeat === opt.value ? ac.primary : ac.surface,
                      borderColor: form.repeat === opt.value ? ac.primary : ac.border,
                    }]}
                    accessibilityRole="radio"
                    accessibilityLabel={opt.label}
                    accessibilityState={{ selected: form.repeat === opt.value }}
                  >
                    <MaterialIcons
                      name={form.repeat === opt.value ? 'radio-button-on' : 'radio-button-off'}
                      size={28}
                      color={form.repeat === opt.value ? ac.onPrimary : ac.muted}
                    />
                    <Text style={{ fontSize: af.md, fontWeight: '700', color: form.repeat === opt.value ? ac.onPrimary : ac.foreground }}>
                      {opt.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {isCheckin && (
                <View style={{ gap: 12 }}>
                  <Text style={{ fontSize: af.lg, fontWeight: '800', color: ac.foreground }}>Avisar meu cuidador depois de</Text>
                  {CHECKIN_ESCALATE_OPTIONS.map((minutes) => {
                    const selected = escalateValue === minutes;
                    return (
                      <Pressable
                        key={minutes}
                        onPress={() => setEscalate(minutes)}
                        accessibilityRole="radio"
                        accessibilityLabel={`${minutes} minutos`}
                        accessibilityState={{ selected }}
                        style={{ paddingVertical: as_.buttonPadding, paddingHorizontal: 20, borderRadius: 16, borderWidth: 3, flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: selected ? ac.primary : ac.surface, borderColor: selected ? ac.primary : ac.border }}
                      >
                        <MaterialIcons name={selected ? 'radio-button-on' : 'radio-button-off'} size={28} color={selected ? ac.onPrimary : ac.muted} />
                        <Text style={{ fontSize: af.md, fontWeight: '700', color: selected ? ac.onPrimary : ac.foreground }}>{minutes} minutos</Text>
                      </Pressable>
                    );
                  })}
                  <Text style={{ fontSize: af.sm, color: ac.muted }}>Se você não tocar em "Estou bem", seus contatos e cuidadores são avisados depois desse tempo.</Text>
                </View>
              )}

              {/* Som e Vibração — linhas grandes */}
              <View style={{ gap: 12 }}>
                {([
                  { key: 'sound' as const, label: 'Som', icon: 'volume-up' as const },
                  { key: 'vibration' as const, label: 'Vibração', icon: 'vibration' as const },
                ]).map((row) => (
                  <View
                    key={row.key}
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14, minHeight: as_.touchTarget, paddingHorizontal: 20, borderRadius: 16, borderWidth: 3, borderColor: ac.border, backgroundColor: ac.surface }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 }}>
                      <MaterialIcons name={row.icon} size={30} color={ac.primary} />
                      <Text style={{ fontSize: af.md, fontWeight: '700', color: ac.foreground }}>{row.label}</Text>
                    </View>
                    <Switch
                      value={form[row.key]}
                      onValueChange={(v) => setForm((f) => ({ ...f, [row.key]: v }))}
                      trackColor={{ false: ac.border, true: ac.primary }}
                      thumbColor="#FFFFFF"
                      accessibilityLabel={`Ativar ${row.label.toLowerCase()} no modo acessível`}
                    />
                  </View>
                ))}
              </View>

              {/* Delete button in edit mode */}
              {editingAlarm && (
                <Pressable
                  onPress={() => onDelete(editingAlarm.id)}
                  style={({ pressed }) => [{
                    paddingVertical: as_.buttonPadding,
                    paddingHorizontal: 20,
                    borderRadius: 16,
                    borderWidth: 3,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 12,
                    backgroundColor: pressed ? ac.error + '20' : ac.background,
                    borderColor: ac.emergency,
                    marginTop: 8,
                  }]}
                  accessibilityRole="button"
                  accessibilityLabel={`Excluir este ${nounLower}`}
                >
                  <MaterialIcons name="delete" size={28} color={ac.emergency} />
                  <Text style={{ fontSize: af.md, fontWeight: '700', color: ac.emergency }}>{isCheckin ? 'Excluir Check-in' : 'Excluir Lembrete'}</Text>
                </Pressable>
              )}
            </ScrollView>

            {/* Barra inferior de ações: Cancelar + Salvar */}
            <View style={{ flexDirection: 'row', gap: 12, padding: 20, paddingBottom: Math.max(insets.bottom, 20), borderTopWidth: 2, borderTopColor: ac.border, backgroundColor: ac.bar }}>
              <Pressable
                onPress={onCancel}
                accessibilityRole="button"
                accessibilityLabel="Cancelar"
                style={({ pressed }) => [{ flex: 1, minHeight: 64, borderRadius: 16, borderWidth: 3, borderColor: ac.muted, backgroundColor: ac.surface, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 }]}
              >
                <Text style={{ fontSize: af.md, fontWeight: '800', color: ac.foreground }}>Cancelar</Text>
              </Pressable>
              <Pressable
                onPress={() => onSave(isCheckin ? { ...form, description: 'Check-in' } : form)}
                disabled={saveDisabled}
                accessibilityRole="button"
                accessibilityLabel="Salvar lembrete"
                style={({ pressed }) => [{ flex: 1.5, minHeight: 64, borderRadius: 16, backgroundColor: ac.success, alignItems: 'center', justifyContent: 'center', opacity: saveDisabled ? 0.5 : pressed ? 0.85 : 1 }]}
              >
                <Text style={{ fontSize: af.md, fontWeight: '800', color: ac.onPrimary }}>Salvar</Text>
              </Pressable>
            </View>
          </FormKeyboardView>
        </View>
      </Modal>
    );
  }

  // ==========================================================================
  // MODO NORMAL — tela única
  // ==========================================================================
  const toggleRow = (
    key: 'sound' | 'vibration' | 'enabled',
    icon: React.ComponentProps<typeof MaterialIcons>['name'],
    label: string,
    a11yLabel: string
  ) => (
    <View style={styles.toggleRow}>
      <View style={styles.toggleLeft}>
        <MaterialIcons name={icon} size={20} color={colors.muted} />
        <Text style={[styles.toggleLabel, { color: colors.foreground, fontSize: fs.base }]}>{label}</Text>
      </View>
      <Switch
        value={form[key]}
        onValueChange={(v) => setForm((f) => ({ ...f, [key]: v }))}
        trackColor={{ false: colors.border, true: colors.primary }}
        thumbColor="#FFFFFF"
        accessibilityLabel={a11yLabel}
      />
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onCancel}>
      <View style={[styles.modal, { backgroundColor: colors.background }]}>
        {/* Título apenas — Cancelar/Salvar ficam na barra inferior */}
        <View style={[styles.modalHeader, { borderBottomColor: colors.border, backgroundColor: colors.bar, paddingTop: insets.top + 16 }]}>
          <Text style={[styles.modalTitle, { color: colors.foreground, fontSize: fs.xl, fontFamily: BrandFonts.body }]}>{title}</Text>
        </View>

        <FormKeyboardView style={{ flex: 1 }}>
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Nome */}
            {!isCheckin && (
              <View style={styles.formGroup}>
                <Text style={[styles.formLabel, { color: colors.foreground, fontSize: fs.base, fontFamily: BrandFonts.body }]}>Nome do lembrete</Text>
                <TextInput
                  value={form.description}
                  onChangeText={(v) => setForm((f) => ({ ...f, description: v }))}
                  placeholder="Ex: Tomar remédio para pressão"
                  placeholderTextColor={colors.muted}
                  style={[styles.textInput, { backgroundColor: colors.surface, color: colors.foreground, borderColor: colors.border, fontSize: fs.base }]}
                  returnKeyType="done"
                  maxLength={80}
                />
              </View>
            )}

            {/* Que horas tomar? */}
            <View style={styles.formGroup}>
              <Text style={[styles.formLabel, { color: colors.foreground, fontSize: fs.base, fontFamily: BrandFonts.body }]}>{isCheckin ? 'Que horas?' : 'Que horas tomar?'}</Text>
              <View style={styles.timePicker}>
                <WheelPicker
                  count={24}
                  value={parseInt(timeHour, 10) || 0}
                  onChange={(h) => setForm((f) => ({ ...f, time: `${String(h).padStart(2, '0')}:${f.time.split(':')[1] || '00'}` }))}
                  label="hora"
                />
                <View style={{ marginTop: colonMetrics.wheelTop, height: colonMetrics.wheelHeight, justifyContent: 'center' }}>
                  <Text style={[styles.timeColon, { color: colors.foreground, fontSize: fs.scaled(40) }]}>:</Text>
                </View>
                <WheelPicker
                  count={60}
                  value={parseInt(timeMinute, 10) || 0}
                  onChange={(m) => setForm((f) => ({ ...f, time: `${f.time.split(':')[0] || '00'}:${String(m).padStart(2, '0')}` }))}
                  label="min"
                />
              </View>
              <View style={styles.quickPicks}>
                <Text style={[styles.quickPickLabel, { color: colors.muted, fontSize: fs.sm }]}>Sugestões</Text>
                <View style={styles.quickPickRow}>
                  {TIME_QUICK_PICKS.map((t) => {
                    const selected = form.time === t;
                    return (
                      <Pressable
                        key={t}
                        onPress={() => setForm((f) => ({ ...f, time: t }))}
                        style={[styles.quickPickChip, { backgroundColor: selected ? colors.primarySurface : colors.surface, borderColor: selected ? colors.primary : colors.border, minHeight: fs.touch(44) }]}
                        accessibilityRole="button"
                        accessibilityLabel={`Horário ${t}`}
                        accessibilityState={{ selected }}
                      >
                        <Text style={[styles.quickPickChipText, { color: selected ? colors.onPrimary : colors.foreground, fontSize: fs.sm, fontFamily: BrandFonts.monoRegular }]}>{t}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </View>

            {/* Repetição */}
            <View style={styles.formGroup}>
              <Text style={[styles.formLabel, { color: colors.foreground, fontSize: fs.base, fontFamily: BrandFonts.body }]}>Repetição</Text>
              <View style={styles.repeatOptions}>
                {REPEAT_OPTIONS.map((opt) => (
                  <Pressable
                    key={opt.value}
                    onPress={() => setForm((f) => ({ ...f, repeat: opt.value }))}
                    style={[styles.repeatOption, { backgroundColor: form.repeat === opt.value ? colors.primarySurface : colors.surface, borderColor: form.repeat === opt.value ? colors.primary : colors.border, minHeight: fs.touch(44) }]}
                    accessibilityRole="radio"
                    accessibilityLabel={opt.label}
                    accessibilityState={{ selected: form.repeat === opt.value }}
                  >
                    <Text style={[styles.repeatOptionText, { color: form.repeat === opt.value ? colors.onPrimary : colors.foreground, fontSize: fs.sm }]}>{opt.label}</Text>
                  </Pressable>
                ))}
              </View>

              {form.repeat === 'custom' && (
                <View style={[styles.weekdaySelector, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                  <Text style={[styles.weekdayTitle, { color: colors.muted, fontSize: fs.xs }]}>Dias da semana</Text>
                  <View style={styles.weekdayRow}>
                    {WEEKDAYS.map(({ day, label, full }) => {
                      const selected = (form.customDays ?? []).includes(day);
                      return (
                        <Pressable
                          key={day}
                          onPress={() => toggleDay(day, selected)}
                          style={[styles.weekdayBtn, { backgroundColor: selected ? colors.primarySurface : colors.background, borderColor: selected ? colors.primary : colors.border, minHeight: fs.touch(52) }]}
                          accessibilityRole="checkbox"
                          accessibilityLabel={full}
                          accessibilityState={{ checked: selected }}
                        >
                          <Text style={[styles.weekdayBtnText, { color: selected ? colors.onPrimary : colors.foreground, fontSize: fs.sm }]}>{label}</Text>
                          <Text style={[styles.weekdayBtnFull, { color: selected ? colors.onPrimary + 'CC' : colors.muted, fontSize: fs.xs }]}>{full}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  {(form.customDays ?? []).length === 0 && (
                    <Text style={[styles.weekdayHint, { color: colors.error, fontSize: fs.sm }]}>Selecione pelo menos um dia</Text>
                  )}
                </View>
              )}
            </View>

            {isCheckin && (
              <View style={styles.formGroup}>
                <Text style={[styles.formLabel, { color: colors.foreground, fontSize: fs.base, fontFamily: BrandFonts.body }]}>Avisar meu cuidador depois de</Text>
                <View style={styles.repeatOptions}>
                  {CHECKIN_ESCALATE_OPTIONS.map((minutes) => {
                    const selected = escalateValue === minutes;
                    return (
                      <Pressable
                        key={minutes}
                        onPress={() => setEscalate(minutes)}
                        style={[styles.repeatOption, { backgroundColor: selected ? colors.primarySurface : colors.surface, borderColor: selected ? colors.primary : colors.border, minHeight: fs.touch(44) }]}
                        accessibilityRole="radio"
                        accessibilityLabel={`${minutes} minutos`}
                        accessibilityState={{ selected }}
                      >
                        <Text style={[styles.repeatOptionText, { color: selected ? colors.onPrimary : colors.foreground, fontSize: fs.sm }]}>{minutes} min</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Text style={{ color: colors.muted, fontSize: fs.sm }}>
                  Se você não tocar em "Estou bem", seus contatos e cuidadores são avisados depois desse tempo.
                </Text>
              </View>
            )}

            {/* Som · Vibração · Habilitado */}
            <View style={[styles.togglesSection, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {toggleRow('sound', 'volume-up', 'Som', 'Ativar som')}
              <View style={[styles.toggleDivider, { backgroundColor: colors.border }]} />
              {toggleRow('vibration', 'vibration', 'Vibração', 'Ativar vibração')}
              <View style={[styles.toggleDivider, { backgroundColor: colors.border }]} />
              {toggleRow('enabled', 'check-circle', 'Habilitado', `Habilitar ${nounLower}`)}
            </View>

            {/* Excluir — só na edição */}
            {editingAlarm && (
              <Pressable
                onPress={() => onDelete(editingAlarm.id)}
                style={({ pressed }) => [styles.deleteAlarmBtn, { borderColor: colors.error, backgroundColor: pressed ? colors.errorLight : colors.background, minHeight: fs.touch(52) }]}
                accessibilityRole="button"
                accessibilityLabel={`Excluir este ${nounLower}`}
              >
                <MaterialIcons name="delete-outline" size={20} color={colors.error} />
                <Text style={[styles.deleteAlarmBtnText, { color: colors.error, fontSize: fs.base }]}>{isCheckin ? 'Excluir check-in' : 'Excluir lembrete'}</Text>
              </Pressable>
            )}
          </ScrollView>

          {/* Barra inferior: Cancelar + Salvar */}
          <View style={[styles.actionBar, { borderTopColor: colors.border, backgroundColor: colors.bar, paddingBottom: Math.max(insets.bottom, 12) }]}>
            <Pressable
              onPress={onCancel}
              accessibilityRole="button"
              accessibilityLabel="Cancelar"
              style={({ pressed }) => [styles.actionBtn, { flex: 1, borderWidth: 2, borderColor: colors.muted, backgroundColor: colors.surface, minHeight: fs.touch(54), opacity: pressed ? 0.8 : 1 }]}
            >
              <Text style={[styles.actionBtnText, { color: colors.foreground, fontSize: fs.md }]}>Cancelar</Text>
            </Pressable>
            <Pressable
              onPress={() => onSave(isCheckin ? { ...form, description: 'Check-in' } : form)}
              disabled={saveDisabled}
              accessibilityRole="button"
              accessibilityLabel={editingAlarm ? 'Salvar lembrete' : 'Criar lembrete'}
              style={({ pressed }) => [styles.actionBtn, { flex: 1.5, backgroundColor: colors.primarySurface, minHeight: fs.touch(54), opacity: saveDisabled ? 0.5 : pressed ? 0.85 : 1 }]}
            >
              <Text style={[styles.actionBtnText, { color: colors.onPrimary, fontSize: fs.md }]}>{editingAlarm ? 'Salvar' : 'Criar lembrete'}</Text>
            </Pressable>
          </View>
        </FormKeyboardView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modal: { flex: 1 },
  modalHeader: { alignItems: 'center', paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  modalTitle: { fontWeight: '600' },
  content: { padding: 20, gap: 24, paddingBottom: 24 },
  formGroup: { gap: 8 },
  formLabel: { fontWeight: '600' },
  textInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14 },
  repeatOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  repeatOption: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, borderWidth: 1 },
  repeatOptionText: { fontWeight: '500' },
  togglesSection: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
  toggleLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  toggleLabel: { fontWeight: '500' },
  toggleDivider: { height: StyleSheet.hairlineWidth, marginHorizontal: 16 },
  timePicker: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center', gap: 12 },
  timeColon: { fontWeight: '800', paddingHorizontal: 4 },
  quickPicks: { gap: 8 },
  quickPickLabel: { fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  quickPickRow: { flexDirection: 'row', gap: 10 },
  quickPickChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  quickPickChipText: { fontWeight: '700' },
  weekdaySelector: { marginTop: 12, borderRadius: 12, borderWidth: 1, padding: 12, gap: 8 },
  weekdayTitle: { fontWeight: '500', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  weekdayRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 4 },
  weekdayBtn: { flex: 1, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', gap: 1 },
  weekdayBtnText: { fontWeight: '700' },
  weekdayBtnFull: { fontWeight: '500' },
  weekdayHint: { marginTop: 4, textAlign: 'center' },
  deleteAlarmBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1.5, borderRadius: 14, marginTop: 8 },
  deleteAlarmBtnText: { fontWeight: '600' },
  actionBar: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  actionBtn: { borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  actionBtnText: { fontWeight: '800' },
});
