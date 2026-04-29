/**
 * app/(caregiver)/alerts.tsx — Histórico de Alertas
 *
 * Lista completa de alertas recebidos quando o monitorado não respondeu a um alarme.
 * Exibe localização, métricas de saúde no momento do alerta e status de leitura.
 */

import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import React, { useState } from 'react';
import {
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenContainer } from '@/components/screen-container';
import { useColors } from '@/hooks/use-colors';
import { useFontSize } from '@/lib/font-size-context';
import { useCaregiverContext, type CaregiverAlert } from '@/lib/caregiver-context';

const CAREGIVER_COLOR = '#7C3AED';

function AlertCard({
  alert,
  onAcknowledge,
  colors,
  fs,
}: {
  alert: CaregiverAlert;
  onAcknowledge: (id: string) => void;
  colors: ReturnType<typeof useColors>;
  fs: ReturnType<typeof useFontSize>;
}) {
  const [expanded, setExpanded] = useState(false);

  const openLocation = () => {
    if (!alert.location) return;
    Linking.openURL(
      `https://www.google.com/maps?q=${alert.location.latitude},${alert.location.longitude}`
    );
  };

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: alert.acknowledged ? colors.surface : '#FEF2F2',
          borderColor: alert.acknowledged ? colors.border : '#FCA5A5',
          borderWidth: alert.acknowledged ? 1 : 1.5,
        },
      ]}
    >
      {/* Header do card */}
      <Pressable
        onPress={() => {
          if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setExpanded(!expanded);
          if (!alert.acknowledged) onAcknowledge(alert.id);
        }}
        style={styles.cardHeader}
      >
        <View style={[
          styles.alertIcon,
          { backgroundColor: alert.acknowledged ? colors.border + '30' : '#FEE2E2' },
        ]}>
          <MaterialIcons
            name="notification-important"
            size={22}
            color={alert.acknowledged ? colors.muted : '#DC2626'}
          />
        </View>

        <View style={{ flex: 1, gap: 3 }}>
          <Text style={[styles.alarmDesc, { color: colors.foreground, fontSize: fs.base }]}>
            {alert.alarmDescription}
          </Text>
          <Text style={[styles.alertTime, { color: colors.muted, fontSize: fs.xs }]}>
            {new Date(alert.triggeredAt).toLocaleString('pt-BR', {
              weekday: 'short',
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>
        </View>

        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          {!alert.acknowledged && (
            <View style={[styles.newBadge, { backgroundColor: '#DC2626' }]}>
              <Text style={styles.newBadgeText}>NOVO</Text>
            </View>
          )}
          <MaterialIcons
            name={expanded ? 'keyboard-arrow-up' : 'keyboard-arrow-down'}
            size={20}
            color={colors.muted}
          />
        </View>
      </Pressable>

      {/* Detalhes expandidos */}
      {expanded && (
        <View style={[styles.expandedContent, { borderTopColor: colors.border }]}>
          {/* Localização */}
          {alert.location ? (
            <Pressable
              onPress={openLocation}
              style={({ pressed }) => [
                styles.detailRow,
                { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE', opacity: pressed ? 0.8 : 1 },
              ]}
            >
              <MaterialIcons name="location-on" size={18} color="#2563EB" />
              <Text style={[styles.detailText, { color: '#1D4ED8' }]}>
                Ver localização no mapa
              </Text>
              <MaterialIcons name="open-in-new" size={14} color="#2563EB" />
            </Pressable>
          ) : (
            <View style={[styles.detailRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <MaterialIcons name="location-off" size={18} color={colors.muted} />
              <Text style={[styles.detailText, { color: colors.muted }]}>
                Localização não disponível
              </Text>
            </View>
          )}

          {/* Métricas de saúde */}
          {alert.healthSnapshot && Object.keys(alert.healthSnapshot).length > 0 ? (
            <View style={styles.metricsGrid}>
              <Text style={[styles.metricsTitle, { color: colors.muted, fontSize: fs.xs }]}>
                MÉTRICAS NO MOMENTO DO ALERTA
              </Text>
              <View style={styles.metricsRow}>
                {alert.healthSnapshot.heartRate !== undefined && (
                  <View style={[styles.metricPill, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}>
                    <MaterialIcons name="favorite" size={14} color="#DC2626" />
                    <Text style={[styles.metricPillText, { color: '#991B1B' }]}>
                      {alert.healthSnapshot.heartRate} bpm
                    </Text>
                  </View>
                )}
                {alert.healthSnapshot.bloodPressure !== undefined && (
                  <View style={[styles.metricPill, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}>
                    <MaterialIcons name="monitor-heart" size={14} color="#2563EB" />
                    <Text style={[styles.metricPillText, { color: '#1E40AF' }]}>
                      {alert.healthSnapshot.bloodPressure} mmHg
                    </Text>
                  </View>
                )}
                {alert.healthSnapshot.glucose !== undefined && (
                  <View style={[styles.metricPill, { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' }]}>
                    <MaterialIcons name="water-drop" size={14} color="#D97706" />
                    <Text style={[styles.metricPillText, { color: '#92400E' }]}>
                      {alert.healthSnapshot.glucose} mg/dL
                    </Text>
                  </View>
                )}
              </View>
            </View>
          ) : (
            <View style={[styles.detailRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <MaterialIcons name="info" size={18} color={colors.muted} />
              <Text style={[styles.detailText, { color: colors.muted }]}>
                Sem métricas de saúde registradas
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

export default function AlertsScreen() {
  const colors = useColors();
  const fs = useFontSize();
  const insets = useSafeAreaInsets();
  const { state, dispatch } = useCaregiverContext();
  const { alerts, unreadCount } = state;

  const acknowledgeAlert = (id: string) => {
    dispatch({ type: 'ACKNOWLEDGE_ALERT', payload: id });
  };

  const acknowledgeAll = () => {
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    dispatch({ type: 'ACKNOWLEDGE_ALL_ALERTS' });
  };

  return (
    <ScreenContainer edges={['left', 'right']}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12, borderBottomColor: colors.border }]}>
        <View>
          <Text style={[styles.title, { color: colors.foreground, fontSize: fs['2xl'] }]}>
            Alertas
          </Text>
          <Text style={[styles.subtitle, { color: colors.muted, fontSize: fs.sm }]}>
            {alerts.length} alerta(s) recebido(s)
            {unreadCount > 0 ? ` · ${unreadCount} não lido(s)` : ''}
          </Text>
        </View>
        {unreadCount > 0 && (
          <Pressable
            onPress={acknowledgeAll}
            style={({ pressed }) => [
              styles.markAllBtn,
              { borderColor: CAREGIVER_COLOR, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <MaterialIcons name="done-all" size={16} color={CAREGIVER_COLOR} />
            <Text style={[styles.markAllText, { color: CAREGIVER_COLOR }]}>
              Marcar todos
            </Text>
          </Pressable>
        )}
      </View>

      {alerts.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={[styles.emptyIconBg, { backgroundColor: '#DCFCE7' }]}>
            <MaterialIcons name="check-circle" size={56} color="#16A34A" />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.foreground, fontSize: fs.lg }]}>
            Nenhum alerta recebido
          </Text>
          <Text style={[styles.emptyDesc, { color: colors.muted, fontSize: fs.sm }]}>
            Quando um alarme não for respondido pelo monitorado, você verá os alertas aqui.
          </Text>
        </View>
      ) : (
        <FlatList
          data={alerts}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <AlertCard
              alert={item}
              onAcknowledge={acknowledgeAlert}
              colors={colors}
              fs={fs}
            />
          )}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        />
      )}
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
  title: {
    fontSize: 28,
    fontWeight: '800',
  },
  subtitle: {
    marginTop: 2,
  },
  markAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1.5,
  },
  markAllText: {
    fontSize: 13,
    fontWeight: '600',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 14,
  },
  emptyIconBg: {
    width: 104,
    height: 104,
    borderRadius: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontWeight: '700',
    textAlign: 'center',
  },
  emptyDesc: {
    textAlign: 'center',
    lineHeight: 21,
  },
  listContent: {
    padding: 16,
    paddingBottom: 32,
  },
  card: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 14,
  },
  alertIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alarmDesc: {
    fontWeight: '700',
    lineHeight: 20,
  },
  alertTime: {
    lineHeight: 16,
  },
  newBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  newBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  expandedContent: {
    borderTopWidth: StyleSheet.hairlineWidth,
    padding: 14,
    gap: 10,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  detailText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
  },
  metricsGrid: {
    gap: 8,
  },
  metricsTitle: {
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  metricsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metricPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  metricPillText: {
    fontSize: 13,
    fontWeight: '700',
  },
});
