import * as Haptics from 'expo-haptics';
import React from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { AppDialog, useAppDialog } from '@/components/app-dialog';
import { useColors } from '@/hooks/use-colors';
import { useAccessibility } from '@/lib/accessibility-context';
import { useFontSize } from '@/lib/font-size-context';
import { BrandFonts } from '@/lib/_core/theme';
import { generateId } from '@/lib/app-context';
import {
  SURGERY_DATE_ERROR_TEXT,
  SURGERY_LIMITS,
  digitsOnly,
  emptySurgery,
  surgeryDateError,
  type SurgeryRecord,
} from '@/lib/surgeries';

interface Props {
  value: SurgeryRecord[];
  onChange: (next: SurgeryRecord[]) => void;
}

/**
 * Lista editável de cirurgias e internações: nome, mês (opcional), ano e
 * observação. Funciona nos dois modos (normal e acessível).
 */
export function SurgeryListEditor({ value, onChange }: Props) {
  const colors = useColors();
  const fs = useFontSize();
  const { isAccessibilityMode: a11y, a11yColors: ac, a11yFontSize: af } = useAccessibility();
  const { dialogProps, showDialog } = useAppDialog();

  const c = a11y
    ? { fg: ac.foreground, muted: ac.muted, surface: ac.surface, border: ac.border, primary: ac.primary, error: ac.error }
    : { fg: colors.foreground, muted: colors.muted, surface: colors.surface, border: colors.border, primary: colors.primary, error: colors.error };
  const t = a11y
    ? { label: af.lg, body: af.md, small: af.sm, input: af.md }
    : { label: fs.base, body: fs.base, small: fs.sm, input: fs.base };
  const bw = a11y ? 2 : 1;
  const inputMin = a11y ? 60 : fs.touch(48);
  const atLimit = value.length >= SURGERY_LIMITS.maxItems;

  const update = (id: string, patch: Partial<SurgeryRecord>) => {
    onChange(value.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  const add = () => {
    if (atLimit) return;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onChange([...value, emptySurgery(generateId())]);
  };

  const remove = (s: SurgeryRecord) => {
    const drop = () => onChange(value.filter((x) => x.id !== s.id));
    // Item vazio sai direto; com conteúdo, confirma antes.
    if (!s.name.trim() && !s.year && !s.month && !s.notes.trim()) return drop();
    showDialog({
      title: 'Remover registro',
      message: `Remover "${s.name.trim() || 'este registro'}" do histórico?`,
      variant: 'confirm',
      buttons: [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Remover', style: 'destructive', onPress: drop },
      ],
    });
  };

  const inputStyle = {
    backgroundColor: c.surface,
    color: c.fg,
    borderColor: c.border,
    borderWidth: bw,
    fontSize: t.input,
    minHeight: inputMin,
  };

  return (
    <View style={{ gap: 16 }}>
      <Text style={{ color: c.muted, fontSize: t.small, fontFamily: BrandFonts.body }}>
        Anote cirurgias e internações que você já teve. Se não lembrar o mês, deixe só o ano.
      </Text>

      {value.length === 0 && (
        <Text style={{ color: c.muted, fontSize: t.body, fontFamily: BrandFonts.body }}>
          Nenhuma cirurgia anotada.
        </Text>
      )}

      {value.map((s, i) => {
        const err = surgeryDateError(s);
        const n = i + 1;
        return (
          <View key={s.id} style={[styles.card, { borderColor: c.border, borderWidth: bw, backgroundColor: c.surface }]}>
            <View style={styles.cardHeader}>
              <Text style={{ flex: 1, color: c.fg, fontSize: t.label, fontWeight: '700', fontFamily: BrandFonts.body }}>
                Registro {n}
              </Text>
              <Pressable
                onPress={() => remove(s)}
                accessibilityRole="button"
                accessibilityLabel={`Remover registro ${n}`}
                hitSlop={8}
                style={({ pressed }) => [styles.removeBtn, { minHeight: a11y ? 60 : 44, opacity: pressed ? 0.7 : 1 }]}
              >
                <MaterialIcons name="delete-outline" size={a11y ? 30 : 24} color={c.error} />
                <Text style={{ color: c.error, fontSize: t.small, fontWeight: '700', fontFamily: BrandFonts.body }}>Remover</Text>
              </Pressable>
            </View>

            <Text style={[styles.label, { color: c.fg, fontSize: t.label, fontFamily: BrandFonts.body }]}>O que foi feito</Text>
            <TextInput
              value={s.name}
              onChangeText={(v) => update(s.id, { name: v })}
              placeholder="Ex: Cirurgia de catarata"
              placeholderTextColor={c.muted}
              maxLength={SURGERY_LIMITS.name}
              style={[styles.input, inputStyle]}
              accessibilityLabel={`Registro ${n}: o que foi feito`}
            />

            <View style={styles.dateRow}>
              <View style={{ flex: 1, gap: 6 }}>
                <Text style={[styles.label, { color: c.fg, fontSize: t.label, fontFamily: BrandFonts.body }]}>Mês</Text>
                <TextInput
                  value={s.month}
                  onChangeText={(v) => update(s.id, { month: digitsOnly(v, 2) })}
                  placeholder="Ex: 3"
                  placeholderTextColor={c.muted}
                  keyboardType="number-pad"
                  maxLength={2}
                  style={[styles.input, inputStyle, err === 'month' && { borderColor: c.error }]}
                  accessibilityLabel={`Registro ${n}: mês, opcional`}
                />
              </View>
              <View style={{ flex: 1.4, gap: 6 }}>
                <Text style={[styles.label, { color: c.fg, fontSize: t.label, fontFamily: BrandFonts.body }]}>Ano</Text>
                <TextInput
                  value={s.year}
                  onChangeText={(v) => update(s.id, { year: digitsOnly(v, 4) })}
                  placeholder="Ex: 2015"
                  placeholderTextColor={c.muted}
                  keyboardType="number-pad"
                  maxLength={4}
                  style={[styles.input, inputStyle, (err === 'year' || err === 'month-without-year') && { borderColor: c.error }]}
                  accessibilityLabel={`Registro ${n}: ano`}
                />
              </View>
            </View>
            {/* Ano com 1 a 3 dígitos ainda está sendo digitado: não acusa erro antes da hora */}
            {err && !(err === 'year' && s.year.length < 4) && (
              <Text style={{ color: c.error, fontSize: t.small, fontFamily: BrandFonts.body }} accessibilityLiveRegion="polite">
                {SURGERY_DATE_ERROR_TEXT[err]}
              </Text>
            )}

            <Text style={[styles.label, { color: c.fg, fontSize: t.label, fontFamily: BrandFonts.body }]}>Observação (opcional)</Text>
            <TextInput
              value={s.notes}
              onChangeText={(v) => update(s.id, { notes: v })}
              placeholder="Ex: Hospital, médico, olho direito"
              placeholderTextColor={c.muted}
              multiline
              maxLength={SURGERY_LIMITS.notes}
              style={[styles.input, inputStyle, { minHeight: a11y ? 90 : fs.touch(72), textAlignVertical: 'top' }]}
              accessibilityLabel={`Registro ${n}: observação, opcional`}
            />
          </View>
        );
      })}

      <Pressable
        onPress={add}
        disabled={atLimit}
        accessibilityRole="button"
        accessibilityLabel="Adicionar cirurgia ou internação"
        accessibilityState={{ disabled: atLimit }}
        style={({ pressed }) => [
          styles.addBtn,
          { borderColor: c.primary, borderWidth: a11y ? 3 : 2, minHeight: a11y ? 64 : fs.touch(52), opacity: atLimit ? 0.5 : pressed ? 0.8 : 1 },
        ]}
      >
        <MaterialIcons name="add" size={a11y ? 32 : 24} color={c.primary} />
        <Text style={{ color: c.primary, fontSize: a11y ? af.lg : fs.base, fontWeight: '800', fontFamily: BrandFonts.body }}>
          {value.length === 0 ? 'Adicionar cirurgia' : 'Adicionar outra'}
        </Text>
      </Pressable>
      {atLimit && (
        <Text style={{ color: c.muted, fontSize: t.small, fontFamily: BrandFonts.body }}>
          Limite de {SURGERY_LIMITS.maxItems} registros.
        </Text>
      )}

      <AppDialog {...dialogProps} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 14, padding: 14, gap: 8 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  removeBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 4 },
  label: { fontWeight: '600' },
  input: { borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12 },
  dateRow: { flexDirection: 'row', gap: 12 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    borderStyle: 'dashed',
  },
});
