import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { PressableScale } from '@/components/pressable-scale';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useColors } from '@/hooks/use-colors';
import { useFontSize } from '@/lib/font-size-context';
import { BrandFonts } from '@/lib/_core/theme';
import type { Alarm } from '@/lib/app-context';

interface AlarmCardProps {
  alarm: Alarm;
  onEdit: (alarm: Alarm) => void;
  onToggle: (alarm: Alarm) => void;
  onTest: (alarm: Alarm) => void;
}

const REPEAT_LABELS: Record<Alarm['repeat'], string> = {
  daily: 'Diário',
  weekdays: 'Dias úteis',
  weekends: 'Fins de semana',
  custom: 'Personalizado',
};

const DAY_ABBR = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function formatCustomDays(days: number[] | undefined): string {
  if (!days || days.length === 0) return 'Personalizado';
  if (days.length === 7) return 'Todos os dias';
  return days.map((d) => DAY_ABBR[d]).join(', ');
}

export function AlarmCard({ alarm, onEdit, onToggle, onTest }: AlarmCardProps) {
  const colors = useColors();
  const fs = useFontSize();

  return (
    <PressableScale
      onPress={() => onEdit(alarm)}
      scaleTo={0.985}
      accessibilityRole="button"
      accessibilityLabel={`Lembrete ${alarm.time}${alarm.description ? ', ' + alarm.description : ''}. Toque para editar.`}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: alarm.enabled ? colors.primary + '30' : colors.border,
          borderLeftColor: alarm.enabled ? colors.primary : colors.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      {/* Top section: icon + info + test button */}
      <View style={styles.topSection}>
        <View style={[styles.iconBadge, { backgroundColor: alarm.enabled ? colors.primaryLight : colors.border + '40' }]}>
          <MaterialIcons
            name="alarm"
            size={24}
            color={alarm.enabled ? colors.primary : colors.muted}
          />
        </View>

        <View style={styles.infoSection}>
          <Text
            // O app já controla o tamanho (fs.scaled + modo acessível); limitamos a
            // escala de fonte do SO e travamos em 1 linha para o horário não quebrar
            // quando a fonte do celular está muito grande (feedback do beta).
            numberOfLines={1}
            maxFontSizeMultiplier={1.2}
            style={[
              styles.timeText,
              {
                color: alarm.enabled ? colors.foreground : colors.muted,
                fontFamily: BrandFonts.monoRegular,
                fontSize: fs.scaled(36),
                lineHeight: fs.scaled(36) * 1.2,
              },
            ]}
          >
            {alarm.time}
          </Text>
          <Text
            style={[styles.descriptionText, { color: colors.foreground, fontSize: fs.base }]}
            numberOfLines={1}
          >
            {alarm.description || 'Sem descrição'}
          </Text>
          <View style={styles.tagsRow}>
            <View style={[styles.tag, { backgroundColor: colors.border }]}>
              <Text style={[styles.tagText, { color: colors.muted, fontSize: fs.sm }]}>
                {alarm.repeat === 'custom'
                  ? formatCustomDays(alarm.customDays)
                  : REPEAT_LABELS[alarm.repeat]}
              </Text>
            </View>
            {alarm.sound && (
              <View style={[styles.tag, { backgroundColor: colors.primaryLight }]}>
                <MaterialIcons name="volume-up" size={13} color={colors.primary} />
              </View>
            )}
            {alarm.vibration && (
              <View style={[styles.tag, { backgroundColor: colors.primaryLight }]}>
                <MaterialIcons name="vibration" size={13} color={colors.primary} />
              </View>
            )}
          </View>
        </View>

        {/* Test button — separate pressable so it doesn't trigger onEdit */}
        <PressableScale
          onPress={(e) => { e.stopPropagation?.(); onTest(alarm); }}
          scaleTo={0.94}
          style={({ pressed }) => [
            styles.testBtn,
            { borderColor: colors.success, backgroundColor: colors.background, minHeight: fs.touch(44) },
            pressed && { opacity: 0.7 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Testar alarme"
        >
          <MaterialIcons name="play-arrow" size={20} color={colors.success} />
          <Text style={[styles.testBtnText, { color: colors.success, fontSize: fs.sm }]}>Testar</Text>
        </PressableScale>
      </View>

      {/* Divider */}
      <View style={[styles.divider, { backgroundColor: colors.border }]} />

      {/* Bottom section: enable toggle hint + edit prompt */}
      <View style={styles.actionRow}>
        <Pressable
          onPress={(e) => { e.stopPropagation?.(); onToggle(alarm); }}
          style={({ pressed }) => [
            styles.toggleBtn,
            { backgroundColor: colors.background, borderColor: colors.border, minHeight: fs.touch(36) },
            pressed && { opacity: 0.7 },
          ]}
          accessibilityRole="switch"
          accessibilityLabel={alarm.enabled ? 'Desativar lembrete' : 'Ativar lembrete'}
          accessibilityState={{ checked: alarm.enabled }}
        >
          <MaterialIcons
            name={alarm.enabled ? 'notifications-active' : 'notifications-off'}
            size={18}
            color={alarm.enabled ? colors.primary : colors.muted}
          />
          <Text style={[styles.toggleBtnText, { color: alarm.enabled ? colors.primary : colors.muted, fontSize: fs.sm }]}>
            {alarm.enabled ? 'Ativo' : 'Inativo'}
          </Text>
        </Pressable>

        <View style={[styles.editHint, { borderColor: colors.border }]}>
          <MaterialIcons name="edit" size={15} color={colors.muted} />
          <Text style={[styles.editHintText, { color: colors.muted, fontSize: fs.sm }]}>Toque para editar</Text>
        </View>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderLeftWidth: 4,
    overflow: 'hidden',
  },
  topSection: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  iconBadge: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoSection: {
    flex: 1,
    gap: 3,
  },
  timeText: {
    letterSpacing: 1,
  },
  descriptionText: {
    fontWeight: '500',
  },
  tagsRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
    marginTop: 4,
  },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  tagText: {
    fontWeight: '500',
  },
  testBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minWidth: 72,
  },
  testBtnText: {
    fontWeight: '700',
  },
  divider: {
    height: 1,
    marginHorizontal: 16,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  toggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  toggleBtnText: {
    fontWeight: '600',
  },
  editHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  editHintText: {
    fontWeight: '400',
  },
});
