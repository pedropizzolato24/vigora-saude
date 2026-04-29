/**
 * app/(caregiver)/monitored.tsx — Detalhes do Monitorado
 *
 * Exibe o perfil completo, histórico de métricas de saúde, agenda de alarmes
 * e status de conexão do monitorado vinculado ao cuidador.
 */

import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import React from 'react';
import {
  Platform,
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

const CAREGIVER_COLOR = '#7C3AED';

interface InfoRowProps {
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  label: string;
  value: string;
  valueColor?: string;
  colors: ReturnType<typeof useColors>;
}

function InfoRow({ icon, label, value, valueColor, colors }: InfoRowProps) {
  return (
    <View style={[styles.infoRow, { borderBottomColor: colors.border }]}>
      <MaterialIcons name={icon} size={18} color={colors.muted} />
      <Text style={[styles.infoLabel, { color: colors.muted }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: valueColor ?? colors.foreground }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function MetricCard({
  icon,
  label,
  value,
  unit,
  hint,
  iconColor,
  colors,
  fs,
}: {
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  label: string;
  value: number | undefined;
  unit: string;
  hint: string;
  iconColor: string;
  colors: ReturnType<typeof useColors>;
  fs: ReturnType<typeof useFontSize>;
}) {
  return (
    <View style={[styles.metricCard, { backgroundColor: colors.surface, borderColor: iconColor + '40' }]}>
      <View style={[styles.metricIconBg, { backgroundColor: iconColor + '15' }]}>
        <MaterialIcons name={icon} size={22} color={iconColor} />
      </View>
      <Text style={[styles.metricCardValue, { color: iconColor, fontSize: fs.scaled(24) }]}>
        {value !== undefined ? value : '—'}
      </Text>
      <Text style={[styles.metricCardUnit, { color: colors.muted, fontSize: fs.xs }]}>{unit}</Text>
      <Text style={[styles.metricCardLabel, { color: colors.foreground, fontSize: fs.sm }]}>{label}</Text>
      <Text style={[styles.metricCardHint, { color: colors.muted, fontSize: fs.xs }]}>{hint}</Text>
    </View>
  );
}

export default function MonitoredScreen() {
  const colors = useColors();
  const fs = useFontSize();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { state } = useCaregiverContext();
  const { monitoredPerson } = state;

  // --- Não vinculado --------------------------------------------------------
  if (!monitoredPerson) {
    return (
      <ScreenContainer edges={['left', 'right']}>
        <View style={[styles.header, { paddingTop: insets.top + 12, borderBottomColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.foreground, fontSize: fs['2xl'] }]}>
            Monitorado
          </Text>
        </View>
        <View style={styles.emptyState}>
          <View style={[styles.emptyIconBg, { backgroundColor: CAREGIVER_COLOR + '12' }]}>
            <MaterialIcons name="person-off" size={56} color={CAREGIVER_COLOR} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.foreground, fontSize: fs.lg }]}>
            Nenhum monitorado vinculado
          </Text>
          <Text style={[styles.emptyDesc, { color: colors.muted, fontSize: fs.sm }]}>
            Vincule-se a um usuário Vigora Saúde para ver seus dados aqui.
          </Text>
          <Pressable
            onPress={() => router.push('/(caregiver)/settings')}
            style={({ pressed }) => [
              styles.linkBtn,
              { backgroundColor: CAREGIVER_COLOR, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <MaterialIcons name="add-link" size={20} color="#FFFFFF" />
            <Text style={styles.linkBtnText}>Vincular agora</Text>
          </Pressable>
        </View>
      </ScreenContainer>
    );
  }

  const statusConfig = getMonitoredStatusConfig(monitoredPerson.status);
  const { heartRate, bloodPressure, glucose } = monitoredPerson.lastHealthMetrics;

  const callMonitored = () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const digits = monitoredPerson.phone.replace(/\D/g, '');
    Linking.openURL(`tel:${digits}`);
  };

  const openLocation = () => {
    if (!monitoredPerson.lastLocation) return;
    const { latitude, longitude } = monitoredPerson.lastLocation;
    Linking.openURL(`https://www.google.com/maps?q=${latitude},${longitude}`);
  };

  // --- Monitorado vinculado -------------------------------------------------
  return (
    <ScreenContainer edges={['left', 'right']}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 12 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.pageHeader}>
          <Text style={[styles.title, { color: colors.foreground, fontSize: fs['2xl'] }]}>
            Monitorado
          </Text>
        </View>

        {/* Perfil */}
        <View style={[styles.profileCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.profileAvatar, { backgroundColor: CAREGIVER_COLOR + '20' }]}>
            <MaterialIcons name="person" size={40} color={CAREGIVER_COLOR} />
          </View>
          <Text style={[styles.profileName, { color: colors.foreground, fontSize: fs.scaled(20) }]}>
            {monitoredPerson.name}
          </Text>

          {/* Status Badge */}
          <View style={[styles.statusBadge, { backgroundColor: statusConfig.bg }]}>
            <MaterialIcons name={statusConfig.icon as any} size={14} color={statusConfig.color} />
            <Text style={[styles.statusBadgeText, { color: statusConfig.color }]}>
              {statusConfig.label}
            </Text>
          </View>

          <Text style={[styles.lastSeenText, { color: colors.muted, fontSize: fs.sm }]}>
            Último sinal: {formatLastSeen(monitoredPerson.lastSeenAt)}
          </Text>

          {/* Ações */}
          <View style={styles.profileActions}>
            <Pressable
              onPress={callMonitored}
              style={({ pressed }) => [
                styles.profileActionBtn,
                { backgroundColor: CAREGIVER_COLOR, opacity: pressed ? 0.85 : 1 },
              ]}
            >
              <MaterialIcons name="phone" size={18} color="#FFFFFF" />
              <Text style={styles.profileActionText}>Ligar</Text>
            </Pressable>
            {monitoredPerson.lastLocation && (
              <Pressable
                onPress={openLocation}
                style={({ pressed }) => [
                  styles.profileActionBtn,
                  { backgroundColor: '#EFF6FF', borderWidth: 1.5, borderColor: '#BFDBFE', opacity: pressed ? 0.85 : 1 },
                ]}
              >
                <MaterialIcons name="location-on" size={18} color="#2563EB" />
                <Text style={[styles.profileActionText, { color: '#2563EB' }]}>Localização</Text>
              </Pressable>
            )}
          </View>
        </View>

        {/* Informações de Contato */}
        <View style={[styles.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.foreground, fontSize: fs.base }]}>
            Informações
          </Text>
          <InfoRow icon="phone" label="Telefone" value={monitoredPerson.phone} colors={colors} />
          {monitoredPerson.lastAlarmDescription && (
            <InfoRow
              icon="alarm"
              label="Último alarme"
              value={monitoredPerson.lastAlarmDescription}
              colors={colors}
            />
          )}
          {monitoredPerson.lastAlarmAt && (
            <InfoRow
              icon="schedule"
              label="Horário"
              value={new Date(monitoredPerson.lastAlarmAt).toLocaleString('pt-BR', {
                day: '2-digit', month: '2-digit',
                hour: '2-digit', minute: '2-digit',
              })}
              colors={colors}
            />
          )}
          {monitoredPerson.lastAlarmResponded !== null && (
            <InfoRow
              icon={monitoredPerson.lastAlarmResponded ? 'check-circle' : 'cancel'}
              label="Respondeu?"
              value={monitoredPerson.lastAlarmResponded ? 'Sim' : 'Não'}
              valueColor={monitoredPerson.lastAlarmResponded ? '#16A34A' : '#DC2626'}
              colors={colors}
            />
          )}
        </View>

        {/* Métricas de Saúde */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground, fontSize: fs.base }]}>
            Últimas Métricas de Saúde
          </Text>
          <View style={styles.metricsGrid}>
            <MetricCard
              icon="favorite"
              label="Freq. Cardíaca"
              value={heartRate}
              unit="bpm"
              hint="Normal: 60–100"
              iconColor="#DC2626"
              colors={colors}
              fs={fs}
            />
            <MetricCard
              icon="monitor-heart"
              label="Pressão Arterial"
              value={bloodPressure}
              unit="mmHg"
              hint="Normal: 90–120"
              iconColor="#2563EB"
              colors={colors}
              fs={fs}
            />
            <MetricCard
              icon="water-drop"
              label="Glicose"
              value={glucose}
              unit="mg/dL"
              hint="Normal: 70–100"
              iconColor="#D97706"
              colors={colors}
              fs={fs}
            />
          </View>
          <View style={[styles.metricsNote, { backgroundColor: CAREGIVER_COLOR + '10', borderColor: CAREGIVER_COLOR + '30' }]}>
            <MaterialIcons name="info" size={14} color={CAREGIVER_COLOR} />
            <Text style={[styles.metricsNoteText, { color: CAREGIVER_COLOR }]}>
              Dados registrados manualmente pelo monitorado. Com integração de wearables (v2), serão atualizados em tempo real.
            </Text>
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scroll: {
    padding: 20,
    paddingBottom: 40,
    gap: 20,
  },
  pageHeader: {
    paddingBottom: 4,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
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
  // Profile card
  profileCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    alignItems: 'center',
    gap: 10,
  },
  profileAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileName: {
    fontWeight: '800',
    textAlign: 'center',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
  },
  statusBadgeText: {
    fontSize: 13,
    fontWeight: '700',
  },
  lastSeenText: {
    textAlign: 'center',
  },
  profileActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  profileActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
  },
  profileActionText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  // Info card
  infoCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 0,
  },
  cardTitle: {
    fontWeight: '700',
    marginBottom: 10,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  infoLabel: {
    fontSize: 14,
    flex: 1,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
    flexShrink: 1,
  },
  // Metrics
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontWeight: '700',
  },
  metricsGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  metricCard: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 14,
    alignItems: 'center',
    gap: 4,
  },
  metricIconBg: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  metricCardValue: {
    fontWeight: '800',
  },
  metricCardUnit: {
    fontWeight: '500',
  },
  metricCardLabel: {
    fontWeight: '700',
    textAlign: 'center',
  },
  metricCardHint: {
    textAlign: 'center',
    lineHeight: 14,
  },
  metricsNote: {
    flexDirection: 'row',
    gap: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'flex-start',
  },
  metricsNoteText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
  },
});
