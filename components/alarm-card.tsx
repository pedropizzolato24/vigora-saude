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
          borderColor: alarm.enabled ? '#0066CC' + '30' : colors.border,
          borderLeftColor: alarm.enabled ? '#0066CC' : colors.border,
        },
      ]}
    >
      <View style={styles.leftSection}>
        <View style={[styles.iconBadge, { backgroundColor: alarm.enabled ? '#0066CC15' : colors.border + '40' }]}>
          <MaterialIcons
            name="alarm"
            size={22}
            color={alarm.enabled ? '#0066CC' : colors.muted}
          />
        </View>
      </View>

      <View style={styles.centerSection}>
        <Text
          style={[
            styles.timeText,
            { color: alarm.enabled ? colors.foreground : colors.muted },
          ]}
        >
          {alarm.time}
        </Text>
        <Text
          style={[styles.descriptionText, { color: alarm.enabled ? colors.foreground : colors.muted }]}
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
              <MaterialIcons name="volume-up" size={12} color="#0066CC" />
            </View>
          )}
          {alarm.vibration && (
            <View style={[styles.tag, { backgroundColor: colors.primaryLight }]}>
              <MaterialIcons name="vibration" size={12} color="#0066CC" />
            </View>
          )}
        </View>
      </View>

      <View style={styles.rightSection}>
        {/* Top row: Toggle + Sound/Vibration indicators */}
        <View style={styles.topRow}>
          <Pressable
            onPress={() => onToggle(alarm)}
            style={({ pressed }) => [
              styles.toggleButton,
              {
                backgroundColor: alarm.enabled ? '#0066CC' : colors.border,
              },
              pressed && { opacity: 0.7 },
            ]}
            accessibilityLabel={alarm.enabled ? 'Desativar alarme' : 'Ativar alarme'}
          >
            <View
              style={[
                styles.toggleThumb,
                {
                  backgroundColor: '#FFFFFF',
                  transform: [{ translateX: alarm.enabled ? 18 : 2 }],
                },
              ]}
            />
          </Pressable>

          {/* Sound and Vibration buttons - increased size */}
          <View style={styles.indicatorButtons}>
            {alarm.sound && (
              <Pressable
                style={({ pressed }) => [
                  styles.indicatorBtn,
                  { backgroundColor: '#0066CC15' },
                  pressed && { opacity: 0.6 },
                ]}
                accessibilityLabel="Som ativado"
              >
                <MaterialIcons name="volume-up" size={20} color="#0066CC" />
              </Pressable>
            )}
            {alarm.vibration && (
              <Pressable
                style={({ pressed }) => [
                  styles.indicatorBtn,
                  { backgroundColor: '#0066CC15' },
                  pressed && { opacity: 0.6 },
                ]}
                accessibilityLabel="Vibração ativada"
              >
                <MaterialIcons name="vibration" size={20} color="#0066CC" />
              </Pressable>
            )}
          </View>
        </View>

        {/* Middle row: Test button */}
        <Pressable
          onPress={() => onTest(alarm)}
          style={({ pressed }) => [
            styles.testBtn,
            { borderColor: '#22C55E', backgroundColor: colors.background },
            pressed && { opacity: 0.7, transform: [{ scale: 0.95 }] },
          ]}
          accessibilityLabel="Testar alarme"
        >
          <MaterialIcons name="play-arrow" size={18} color="#22C55E" />
          <Text style={styles.testBtnText}>Testar</Text>
        </Pressable>

        {/* Bottom row: Edit and Delete buttons - larger and distinct */}
        <View style={styles.actionButtons}>
          <Pressable
            onPress={() => onEdit(alarm)}
            style={({ pressed }) => [
              styles.editBtn,
              { borderColor: colors.border, backgroundColor: colors.background },
              pressed && { opacity: 0.7, transform: [{ scale: 0.95 }] },
            ]}
            accessibilityLabel="Editar alarme"
          >
            <MaterialIcons name="edit" size={24} color="#0066CC" />
            <Text style={styles.editBtnText}>Editar</Text>
          </Pressable>
          <Pressable
            onPress={() => onDelete(alarm.id)}
            style={({ pressed }) => [
              styles.deleteBtn,
              pressed && { opacity: 0.7, transform: [{ scale: 0.95 }] },
            ]}
            accessibilityLabel="Excluir alarme"
          >
            <MaterialIcons name="delete" size={24} color="#FFFFFF" />
            <Text style={styles.deleteBtnText}>Excluir</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderLeftWidth: 4,
    gap: 12,
  },
  leftSection: {
    alignItems: 'center',
    paddingTop: 4,
  },
  iconBadge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerSection: {
    flex: 1,
    gap: 4,
  },
  timeText: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: 1,
  },
  descriptionText: {
    fontSize: 14,
    fontWeight: '500',
  },
  tagsRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
    marginTop: 2,
  },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  tagText: {
    fontSize: 11,
    fontWeight: '500',
  },
  rightSection: {
    alignItems: 'stretch',
    gap: 10,
    minWidth: 120,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  toggleButton: {
    width: 42,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
  },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  indicatorButtons: {
    flexDirection: 'row',
    gap: 6,
    flex: 1,
  },
  indicatorBtn: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  testBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  testBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#22C55E',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  editBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  editBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0066CC',
  },
  deleteBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#EF4444',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  deleteBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
