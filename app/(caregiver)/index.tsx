/**
 * app/(caregiver)/index.tsx — Dashboard do Cuidador
 *
 * Tela principal do app de cuidadores. Mostra o status atual do monitorado,
 * últimas métricas de saúde, alertas recentes e ações rápidas.
 */

import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import React from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenContainer } from '@/components/screen-container';
import { useColors } from '@/hooks/use-colors';
import { useFontSize } from '@/lib/font-size-context';
import {
  useCaregiverContext,
  getMonitoredStatusConfig,
  formatLastSeen,
} from '@/lib/caregiver-context';
import { Platform } from 'react-native';
import { FadeInView, ScaleInView, StaggeredItem } from '@/components/animated-components';

const CAREGIVER_COLOR = '#7C3AED';

function MetricChip({
  icon,
  label,
  value,
  unit,
  colors,
}: {
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  label: string;
  value: number | undefined;
  unit: string;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={[styles.metricChip, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <MaterialIcons name={icon} size={18} color={CAREGIVER_COLOR} />
      <View style={{ gap: 1 }}>
        <Text style={[styles.metricValue, { color: colors.foreground }]}>
          {value !== undefined ? `${value} ${unit}` : '—'}
        </Text>
        <Text style={[styles.metricLabel, { color: colors.muted }]}>{label}</Text>
      </View>
    </View>
  );
}

export default function CaregiverDashboard() {
  const colors = useColors();
  const fs = useFontSize();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { state, dispatch } = useCaregiverContext();
  const { monitoredPerson, alerts, unreadCount } = state;

  const recentAlerts = alerts.slice(0, 3);
  const statusConfig = monitoredPerson
    ? getMonitoredStatusConfig(monitoredPerson.status)
    : null;

  const callMonitored = () => {
    if (!monitoredPerson?.phone) return;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const digits = monitoredPerson.phone.replace(/\D/g, '');
    Linking.openURL(`tel:${digits}`);
  };

  const openLocation = () => {
    if (!monitoredPerson?.lastLocation) return;
    const { latitude, longitude } = monitoredPerson.lastLocation;
    Linking.openURL(`https://www.google.com/maps?q=${latitude},${longitude}`);
  };

  // --- Tela: não vinculado -----------------------------------------------
  if (!monitoredPerson) {
    return (
      <ScreenContainer edges={['left', 'right']}>
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <Text style={[styles.appName, { color: colors.foreground, fontSize: fs.scaled(22) }]}>
            Vigora Cuidador
          </Text>
          <View style={[styles.headerBadge, { backgroundColor: CAREGIVER_COLOR + '15' }]}>
            <MaterialIcons name="people" size={20} color={CAREGIVER_COLOR} />
          </View>
        </View>

        <View style={styles.emptyCenter}>
          <View style={[styles.emptyIconBg, { backgroundColor: CAREGIVER_COLOR + '12' }]}>
            <MaterialIcons name="link" size={56} color={CAREGIVER_COLOR} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.foreground, fontSize: fs.lg }]}>
            Nenhum monitorado vinculado
          </Text>
          <Text style={[styles.emptyDesc, { color: colors.muted, fontSize: fs.sm }]}>
            Para receber alertas, você precisa se vincular a uma pessoa que usa o Vigora Saúde.
          </Text>
          <Pressable
            onPress={() => router.push('/(caregiver)/settings')}
            style={({ pressed }) => [
              styles.linkBtn,
              { backgroundColor: CAREGIVER_COLOR, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <MaterialIcons name="add-link" size={20} color="#FFFFFF" />
            <Text style={styles.linkBtnText}>Vincular com código</Text>
          </Pressable>
        </View>
      </ScreenContainer>
    );
  }

  // --- Tela: monitorado vinculado ----------------------------------------
  return (
    <ScreenContainer edges={['left', 'right']}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 12 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <FadeInView delay={0}>
          <View style={styles.header}>
            <View>
              <Text style={[styles.greeting, { color: colors.muted, fontSize: fs.sm }]}>
                Vigora Cuidador
              </Text>
              <Text style={[styles.appName, { color: colors.foreground, fontSize: fs.scaled(22) }]}>
                Olá, cuidador
              </Text>
            </View>
            <View style={[styles.headerBadge, { backgroundColor: CAREGIVER_COLOR + '15' }]}>
              <MaterialIcons name="people" size={24} color={CAREGIVER_COLOR} />
            </View>
          </View>
        </FadeInView>

        {/* Status Card do Monitorado */}
        <ScaleInView delay={80}>
          <View style={[styles.statusCard, { backgroundColor: statusConfig!.bg, borderColor: statusConfig!.color + '40' }]}>
            {/* Topo */}
            <View style={styles.statusCardTop}>
              <View style={styles.statusPersonRow}>
                <View style={[styles.statusIconBg, { backgroundColor: statusConfig!.color + '20' }]}>
                  <MaterialIcons name={statusConfig!.icon as any} size={28} color={statusConfig!.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.statusPersonName, { color: '#111827' }]}>
                    {monitoredPerson.name}
                  </Text>
                  <Text style={[styles.statusLabel, { color: statusConfig!.color }]}>
                    {statusConfig!.label}
                  </Text>
                </View>
              </View>
              <Text style={[styles.lastSeen, { color: '#6B7280' }]}>
                Visto {formatLastSeen(monitoredPerson.lastSeenAt)}
              </Text>
            </View>

            {/* Último Alarme */}
            {monitoredPerson.lastAlarmDescription && (
              <View style={[styles.lastAlarmRow, { backgroundColor: '#FFFFFF50', borderColor: statusConfig!.color + '30' }]}>
                <MaterialIcons name="alarm" size={16} color={statusConfig!.color} />
                <Text style={[styles.lastAlarmText, { color: '#374151' }]} numberOfLines={1}>
                  Último alarme: {monitoredPerson.lastAlarmDescription}
                </Text>
                <MaterialIcons
                  name={monitoredPerson.lastAlarmResponded ? 'check-circle' : 'cancel'}
                  size={16}
                  color={monitoredPerson.lastAlarmResponded ? '#16A34A' : '#DC2626'}
                />
              </View>
            )}

            {/* Ações rápidas */}
            <View style={styles.statusActions}>
              <Pressable
                onPress={callMonitored}
                style={({ pressed }) => [
                  styles.statusActionBtn,
                  { backgroundColor: statusConfig!.color, opacity: pressed ? 0.85 : 1 },
                ]}
              >
                <MaterialIcons name="phone" size={18} color="#FFFFFF" />
                <Text style={styles.statusActionText}>Ligar</Text>
              </Pressable>

              {monitoredPerson.lastLocation && (
                <Pressable
                  onPress={openLocation}
                  style={({ pressed }) => [
                    styles.statusActionBtn,
                    { backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: statusConfig!.color, opacity: pressed ? 0.85 : 1 },
                  ]}
                >
                  <MaterialIcons name="location-on" size={18} color={statusConfig!.color} />
                  <Text style={[styles.statusActionText, { color: statusConfig!.color }]}>
                    Localização
                  </Text>
                </Pressable>
              )}
            </View>
          </View>
        </ScaleInView>

        {/* Métricas de Saúde */}
        <FadeInView delay={160}>
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.foreground, fontSize: fs.base }]}>
                Últimas Métricas
              </Text>
              <Pressable onPress={() => router.push('/(caregiver)/monitored')}>
                <Text style={[styles.sectionLink, { color: CAREGIVER_COLOR }]}>Ver tudo</Text>
              </Pressable>
            </View>
            <View style={styles.metricsRow}>
              <MetricChip
                icon="favorite"
                label="Freq. Cardíaca"
                value={monitoredPerson.lastHealthMetrics.heartRate}
                unit="bpm"
                colors={colors}
              />
              <MetricChip
                icon="monitor-heart"
                label="Pressão"
                value={monitoredPerson.lastHealthMetrics.bloodPressure}
                unit="mmHg"
                colors={colors}
              />
              <MetricChip
                icon="water-drop"
                label="Glicose"
                value={monitoredPerson.lastHealthMetrics.glucose}
                unit="mg/dL"
                colors={colors}
              />
            </View>
          </View>
        </FadeInView>

        {/* Alertas Recentes */}
        <FadeInView delay={240}>
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={[styles.sectionTitle, { color: colors.foreground, fontSize: fs.base }]}>
                  Alertas Recentes
                </Text>
                {unreadCount > 0 && (
                  <View style={[styles.unreadBadge, { backgroundColor: '#DC2626' }]}>
                    <Text style={styles.unreadText}>{unreadCount}</Text>
                  </View>
                )}
              </View>
              <Pressable onPress={() => router.push('/(caregiver)/alerts')}>
                <Text style={[styles.sectionLink, { color: CAREGIVER_COLOR }]}>Ver todos</Text>
              </Pressable>
            </View>

            {recentAlerts.length === 0 ? (
              <View style={[styles.emptyAlertsBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <MaterialIcons name="check-circle" size={32} color="#16A34A" />
                <Text style={[styles.emptyAlertsText, { color: colors.muted }]}>
                  Nenhum alerta recente. Tudo certo!
                </Text>
              </View>
            ) : (
              recentAlerts.map((alert, idx) => (
                <StaggeredItem key={alert.id} index={idx} staggerDelay={60}>
                  <Pressable
                    onPress={() => {
                      dispatch({ type: 'ACKNOWLEDGE_ALERT', payload: alert.id });
                      router.push('/(caregiver)/alerts');
                    }}
                    style={({ pressed }) => [
                      styles.alertRow,
                      {
                        backgroundColor: alert.acknowledged ? colors.surface : '#FEF2F2',
                        borderColor: alert.acknowledged ? colors.border : '#FCA5A5',
                        opacity: pressed ? 0.85 : 1,
                      },
                    ]}
                  >
                    <MaterialIcons
                      name="notification-important"
                      size={20}
                      color={alert.acknowledged ? colors.muted : '#DC2626'}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.alertDesc, { color: colors.foreground }]} numberOfLines={1}>
                        {alert.alarmDescription}
                      </Text>
                      <Text style={[styles.alertTime, { color: colors.muted }]}>
                        {new Date(alert.triggeredAt).toLocaleString('pt-BR', {
                          day: '2-digit', month: '2-digit',
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </Text>
                    </View>
                    {!alert.acknowledged && (
                      <View style={[styles.unreadDot, { backgroundColor: '#DC2626' }]} />
                    )}
                  </Pressable>
                </StaggeredItem>
              ))
            )}
          </View>
        </FadeInView>

        {/* Info Banner */}
        <View style={[styles.infoBanner, { backgroundColor: CAREGIVER_COLOR + '10', borderColor: CAREGIVER_COLOR + '30' }]}>
          <MaterialIcons name="info" size={18} color={CAREGIVER_COLOR} />
          <Text style={[styles.infoText, { color: CAREGIVER_COLOR }]}>
            Você receberá uma notificação imediatamente quando um alarme não for respondido.
          </Text>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scroll: {
    padding: 20,
    paddingBottom: 32,
    gap: 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  greeting: {
    fontWeight: '500',
  },
  appName: {
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  headerBadge: {
    width: 48,
    height: 48,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Empty state
  emptyCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 16,
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
  linkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 8,
  },
  linkBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  // Status card
  statusCard: {
    borderRadius: 20,
    borderWidth: 1.5,
    padding: 18,
    gap: 14,
  },
  statusCardTop: {
    gap: 8,
  },
  statusPersonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  statusIconBg: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusPersonName: {
    fontSize: 18,
    fontWeight: '800',
  },
  statusLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
  lastSeen: {
    fontSize: 13,
  },
  lastAlarmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  lastAlarmText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
  },
  statusActions: {
    flexDirection: 'row',
    gap: 10,
  },
  statusActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    borderRadius: 12,
  },
  statusActionText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  // Sections
  section: {
    gap: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontWeight: '700',
  },
  sectionLink: {
    fontSize: 13,
    fontWeight: '600',
  },
  // Metrics
  metricsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  metricChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 12,
    borderWidth: 1,
    padding: 10,
  },
  metricValue: {
    fontSize: 13,
    fontWeight: '700',
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: '500',
  },
  // Alerts
  unreadBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  unreadText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  emptyAlertsBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  emptyAlertsText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 19,
  },
  alertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  alertDesc: {
    fontSize: 14,
    fontWeight: '600',
  },
  alertTime: {
    fontSize: 12,
    marginTop: 2,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  // Info banner
  infoBanner: {
    flexDirection: 'row',
    gap: 10,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'flex-start',
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
});
