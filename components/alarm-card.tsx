import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useColors } from '@/hooks/use-colors';
import type { Alarm } from '@/lib/app-context';

interface AlarmCardProps {
  alarm: Alarm;
  onEdit: (alarm: Alarm) => void;
  onDelete: (id: string) => void;
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

export function AlarmCard({ alarm, onEdit, onDelete, onToggle, onTest }: AlarmCardProps) {
  const colors = useColors();

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: alarm.enabled ? colors.primary + '30' : colors.border,
          borderLeftColor: alarm.enabled ? colors.primary : colors.border,
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
            style={[
              styles.timeText,
              { color: alarm.enabled ? colors.foreground : colors.muted },
            ]}
          >
            {alarm.time}
          </Text>
          <Text
            style={[styles.descriptionText, { color: colors.foreground }]}
            numberOfLines={1}
          >
            {alarm.description || 'Sem descrição'}
          </Text>
          <View style={styles.tagsRow}>
            <View style={[styles.tag, { backgroundColor: colors.border }]}>
              <Text style={[styles.tagText, { color: colors.muted }]}>
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

        {/* Test button on the right */}
        <Pressable
          onPress={() => onTest(alarm)}
          style={({ pressed }) => [
            styles.testBtn,
            { borderColor: colors.success, backgroundColor: colors.background },
            pressed && { opacity: 0.7, transform: [{ scale: 0.95 }] },
          ]}
          accessibilityLabel="Testar alarme"
        >
          <MaterialIcons name="play-arrow" size={20} color={colors.success} />
          <Text style={[styles.testBtnText, { color: colors.success }]}>Testar</Text>
        </Pressable>
      </View>

      {/* Divider */}
      <View style={[styles.divider, { backgroundColor: colors.border }]} />

      {/* Bottom section: full-width edit and delete buttons */}
      <View style={styles.actionRow}>
        <Pressable
          onPress={() => onEdit(alarm)}
          style={({ pressed }) => [
            styles.editBtn,
            { borderColor: colors.primary + '30', backgroundColor: colors.background },
            pressed && { opacity: 0.7, transform: [{ scale: 0.98 }] },
          ]}
          accessibilityLabel="Editar alarme"
        >
          <MaterialIcons name="edit" size={22} color={colors.primary} />
          <Text style={[styles.editBtnText, { color: colors.primary }]}>Editar</Text>
        </Pressable>

        <Pressable
          onPress={() => onDelete(alarm.id)}
          style={({ pressed }) => [
            styles.deleteBtn,
            { backgroundColor: colors.error },
            pressed && { opacity: 0.7, transform: [{ scale: 0.98 }] },
          ]}
          accessibilityLabel="Excluir alarme"
        >
          <MaterialIcons name="delete" size={22} color={colors.onEmergency} />
          <Text style={[styles.deleteBtnText, { color: colors.onEmergency }]}>Excluir</Text>
        </Pressable>
      </View>
    </View>
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
    fontSize: 30,
    fontWeight: '700',
    letterSpacing: 1,
    lineHeight: 36,
  },
  descriptionText: {
    fontSize: 14,
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
    fontSize: 11,
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
  },
  testBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  divider: {
    height: 1,
    marginHorizontal: 16,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 0,
  },
  editBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 0,
    borderRightWidth: 1,
    paddingVertical: 16,
  },
  editBtnText: {
    fontSize: 15,
    fontWeight: '700',
  },
  deleteBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
  },
  deleteBtnText: {
    fontSize: 15,
    fontWeight: '700',
  },
});
