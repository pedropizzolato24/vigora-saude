/**
 * alarm-history-sheet.tsx
 *
 * Bottom sheet / modal that shows the alarm event history from the server.
 * Displays each alarm event with its status:
 *   ✅ responded  - user dismissed the alarm
 *   ❌ missed     - alarm timed out without response (SOS sent)
 *   📵 not_sent   - the app never confirmed it (device off, no network, or app closed)
 *   ⏳ pending    - alarm is currently active, awaiting response
 *   📅 scheduled  - pending event whose scheduledAt is still in the future
 *
 * Also shows server warning log (messages sent to emergency contacts).
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  Modal,
  ScrollView,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useColors } from '@/hooks/use-colors';
import { useFontSize } from '@/lib/font-size-context';
import { getAlarmHistory, getWarningLog } from '@/lib/monitoring-service';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface AlarmEvent {
  id: number;
  alarmId: string;
  alarmDescription: string;
  scheduledAt: string;
  status: 'pending' | 'responded' | 'missed' | 'not_sent';
  resolvedAt?: string;
  createdAt: string;
}

interface Warning {
  id: number;
  level: number;
  offlineHours: number;
  contactsReached: number;
  sentAt: string;
}

type Tab = 'events' | 'warnings';

const STATUS_CONFIG = {
  responded: {
    icon: 'check-circle' as const,
    color: '#0F8A4A',
    label: 'Respondido',
    description: 'Alarme confirmado pelo usuário',
  },
  missed: {
    icon: 'cancel' as const,
    color: '#D6161C',
    label: 'Não respondido',
    description: 'Alarme não foi atendido - SOS enviado',
  },
  not_sent: {
    icon: 'phone-disabled' as const,
    color: '#F0C24A',
    label: 'Não confirmado',
    description: 'O app não confirmou este alarme (celular desligado, sem internet ou app fechado)',
  },
  pending: {
    icon: 'access-time' as const,
    color: '#3B82F6',
    label: 'Pendente',
    description: 'Alarme ativo aguardando resposta',
  },
  // Evento pré-registrado do PRÓXIMO disparo (scheduledAt no futuro). É como o
  // servidor sabe cobrar um alarme que nunca tocar — mas não é um alarme ativo
  // "aguardando resposta"; mostrar como "Pendente" confundia (parecia travado).
  scheduled: {
    icon: 'event-available' as const,
    color: '#6B7280',
    label: 'Agendado',
    description: 'Próximo disparo programado — aguardando o horário',
  },
};

/**
 * Um evento "pending" com scheduledAt no futuro é o disparo AGENDADO (não um
 * alarme ativo sem resposta). Distinguir evita o "Pendente" eterno no topo do
 * histórico, que na verdade é o alarme de amanhã.
 */
function getDisplayStatus(event: AlarmEvent): keyof typeof STATUS_CONFIG {
  if (event.status === 'pending' && new Date(event.scheduledAt).getTime() > Date.now()) {
    return 'scheduled';
  }
  return event.status;
}

const WARNING_LEVEL_CONFIG = {
  1: { color: '#F0C24A', label: 'Aviso leve', icon: 'warning' as const },
  2: { color: '#F97316', label: 'Atenção moderada', icon: 'report-problem' as const },
  3: { color: '#D6161C', label: 'Alerta sério', icon: 'error' as const },
};

function formatDate(isoString: string): string {
  try {
    const d = new Date(isoString);
    return d.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoString;
  }
}

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function AlarmHistorySheet({ visible, onClose }: Props) {
  const colors = useColors();
  const fs = useFontSize();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<Tab>('events');
  const [events, setEvents] = useState<AlarmEvent[]>([]);
  const [warnings, setWarnings] = useState<Warning[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const [evts, warns] = await Promise.all([
        getAlarmHistory(100),
        getWarningLog(30),
      ]);
      setEvents(evts as AlarmEvent[]);
      setWarnings(warns as Warning[]);
    } catch (e) {
      console.warn('[AlarmHistory] Failed to load:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (visible) loadData();
  }, [visible, loadData]);

  const respondedCount = events.filter((e) => e.status === 'responded').length;
  const missedCount = events.filter((e) => e.status === 'missed').length;
  const notSentCount = events.filter((e) => e.status === 'not_sent').length;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { backgroundColor: colors.background, paddingBottom: insets.bottom }]}>
        {/* Header — só título; Fechar fica na barra inferior */}
        <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.bar, paddingTop: Math.max(insets.top, 16) }]}>
          <Text style={[styles.headerTitle, { color: colors.foreground, fontSize: fs.lg }]}>
            Histórico de Alarmes
          </Text>
        </View>

        {/* Summary cards */}
        <View style={styles.summaryRow}>
          <View style={[styles.summaryCard, { backgroundColor: colors.successLight }]}>
            <Text style={[styles.summaryNum, { color: colors.success, fontSize: fs.scaled(24) }]}>{respondedCount}</Text>
            <Text style={[styles.summaryLabel, { color: colors.success, fontSize: fs.xs }]}>Respondidos</Text>
          </View>
          <View style={[styles.summaryCard, { backgroundColor: colors.errorLight }]}>
            <Text style={[styles.summaryNum, { color: colors.error, fontSize: fs.scaled(24) }]}>{missedCount}</Text>
            <Text style={[styles.summaryLabel, { color: colors.error, fontSize: fs.xs }]}>Perdidos</Text>
          </View>
          <View style={[styles.summaryCard, { backgroundColor: colors.warningLight }]}>
            <Text style={[styles.summaryNum, { color: colors.warningDark, fontSize: fs.scaled(24) }]}>{notSentCount}</Text>
            <Text style={[styles.summaryLabel, { color: colors.warningDark, fontSize: fs.xs }]}>Não confirmados</Text>
          </View>
        </View>

        {/* Tabs */}
        <View style={[styles.tabBar, { borderBottomColor: colors.border }]}>
          <Pressable
            style={[styles.tab, activeTab === 'events' && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
            onPress={() => setActiveTab('events')}
          >
            <Text style={[styles.tabText, { color: activeTab === 'events' ? colors.primary : colors.muted, fontSize: fs.scaled(14) }]}>
              Eventos ({events.length})
            </Text>
          </Pressable>
          <Pressable
            style={[styles.tab, activeTab === 'warnings' && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
            onPress={() => setActiveTab('warnings')}
          >
            <Text style={[styles.tabText, { color: activeTab === 'warnings' ? colors.primary : colors.muted, fontSize: fs.scaled(14) }]}>
              Avisos ({warnings.length})
            </Text>
          </Pressable>
        </View>

        {/* Content */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color={colors.primary} size="large" />
            <Text style={[styles.loadingText, { color: colors.muted, fontSize: fs.scaled(14) }]}>Carregando histórico...</Text>
          </View>
        ) : (
          <ScrollView
            style={styles.scrollView}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => loadData(true)}
                tintColor={colors.primary}
              />
            }
          >
            {activeTab === 'events' ? (
              events.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <MaterialIcons name="history" size={48} color={colors.muted} />
                  <Text style={[styles.emptyText, { color: colors.muted, fontSize: fs.scaled(14), lineHeight: fs.scaled(20) }]}>
                    Nenhum evento registrado ainda.{'\n'}Os eventos aparecerão aqui quando os alarmes dispararem.
                  </Text>
                </View>
              ) : (
                events.map((event) => {
                  const cfg = STATUS_CONFIG[getDisplayStatus(event)] ?? STATUS_CONFIG.pending;
                  return (
                    <View key={event.id} style={[styles.eventCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                      <View style={[styles.statusDot, { backgroundColor: cfg.color }]} />
                      <View style={styles.eventContent}>
                        <View style={styles.eventRow}>
                          <MaterialIcons name={cfg.icon} size={16} color={cfg.color} />
                          <Text style={[styles.eventStatus, { color: cfg.color, fontSize: fs.scaled(12) }]}>{cfg.label}</Text>
                          <Text style={[styles.eventTime, { color: colors.muted, fontSize: fs.xs }]}>
                            {formatDate(event.scheduledAt)}
                          </Text>
                        </View>
                        <Text style={[styles.eventDescription, { color: colors.foreground, fontSize: fs.scaled(14) }]}>
                          {event.alarmDescription || 'Alarme de Medicamento'}
                        </Text>
                        <Text style={[styles.eventSubtext, { color: colors.muted, fontSize: fs.scaled(12), lineHeight: fs.scaled(16) }]}>
                          {cfg.description}
                        </Text>
                      </View>
                    </View>
                  );
                })
              )
            ) : (
              warnings.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <MaterialIcons name="notifications-none" size={48} color={colors.muted} />
                  <Text style={[styles.emptyText, { color: colors.muted, fontSize: fs.scaled(14), lineHeight: fs.scaled(20) }]}>
                    Nenhum aviso enviado ainda.{'\n'}Avisos são enviados quando o celular fica offline por mais de 24h.
                  </Text>
                </View>
              ) : (
                warnings.map((warning) => {
                  const lvl = warning.level as 1 | 2 | 3;
                  const cfg = WARNING_LEVEL_CONFIG[lvl] ?? WARNING_LEVEL_CONFIG[1];
                  return (
                    <View key={warning.id} style={[styles.eventCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                      <View style={[styles.statusDot, { backgroundColor: cfg.color }]} />
                      <View style={styles.eventContent}>
                        <View style={styles.eventRow}>
                          <MaterialIcons name={cfg.icon} size={16} color={cfg.color} />
                          <Text style={[styles.eventStatus, { color: cfg.color, fontSize: fs.scaled(12) }]}>{cfg.label}</Text>
                          <Text style={[styles.eventTime, { color: colors.muted, fontSize: fs.xs }]}>
                            {formatDate(warning.sentAt)}
                          </Text>
                        </View>
                        <Text style={[styles.eventDescription, { color: colors.foreground, fontSize: fs.scaled(14) }]}>
                          {warning.contactsReached} contato(s) notificado(s)
                        </Text>
                        <Text style={[styles.eventSubtext, { color: colors.muted, fontSize: fs.scaled(12), lineHeight: fs.scaled(16) }]}>
                          Celular offline por ~{warning.offlineHours}h
                        </Text>
                      </View>
                    </View>
                  );
                })
              )
            )}
            <View style={{ height: 32 }} />
          </ScrollView>
        )}

        {/* Fechar — barra inferior */}
        <View style={[styles.footerBar, { borderTopColor: colors.border, backgroundColor: colors.bar }]}>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Fechar histórico"
            style={({ pressed }) => [
              styles.closeFooterBtn,
              { borderColor: colors.muted, backgroundColor: colors.surface, minHeight: fs.touch(54) },
              pressed && { opacity: 0.8 },
            ]}
          >
            <Text style={[styles.closeFooterText, { color: colors.foreground, fontSize: fs.md }]}>Fechar</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
    fontWeight: '700',
  },
  footerBar: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  closeFooterBtn: {
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeFooterText: {
    fontWeight: '800',
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  summaryCard: {
    flex: 1,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
  },
  summaryNum: {
    fontWeight: '800',
  },
  summaryLabel: {
    fontWeight: '600',
    marginTop: 2,
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabText: {
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {},
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 60,
    gap: 12,
    paddingHorizontal: 32,
  },
  emptyText: {
    textAlign: 'center',
  },
  eventCard: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    marginBottom: 8,
    marginTop: 4,
    gap: 10,
  },
  statusDot: {
    width: 4,
    borderRadius: 2,
    alignSelf: 'stretch',
  },
  eventContent: {
    flex: 1,
    gap: 3,
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  eventStatus: {
    fontWeight: '700',
    flex: 1,
  },
  eventTime: {},
  eventDescription: {
    fontWeight: '600',
  },
  eventSubtext: {},
});
