/**
 * monitoring-status-panel.tsx
 *
 * Painel de status do sistema de monitoramento para a tela de Configurações.
 * Mostra informações em linguagem simples (sem termos técnicos):
 * - Última vez que o app se comunicou com o servidor
 * - Quantos alarmes estão sendo monitorados
 * - Resumo dos últimos 30 eventos
 */
import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useColors } from "@/hooks/use-colors";
import { useMonitoringStatus } from "@/hooks/use-monitoring-status";

type Props = {
  /** Se true, usa o layout do modo de acessibilidade (fonte maior, mais espaçamento) */
  accessible?: boolean;
};

export function MonitoringStatusPanel({ accessible = false }: Props) {
  const colors = useColors();
  const { status, loading, error, refresh: loadStatus, checkInLabel, isRecent } = useMonitoringStatus();

  const totalEvents =
    (status?.recentEvents.respondedCount ?? 0) +
    (status?.recentEvents.missedCount ?? 0) +
    (status?.recentEvents.notSentCount ?? 0);

  const fs = accessible ? 16 : 13;
  const titleFs = accessible ? 18 : 15;

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
        },
      ]}
    >
      {/* Cabeçalho */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <MaterialIcons
            name="shield"
            size={accessible ? 22 : 18}
            color={colors.primary}
          />
          <Text
            style={[
              styles.title,
              { color: colors.foreground, fontSize: titleFs },
            ]}
          >
            Monitoramento
          </Text>
        </View>
        <TouchableOpacity
          onPress={loadStatus}
          style={styles.refreshBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <MaterialIcons
            name="refresh"
            size={accessible ? 22 : 18}
            color={colors.muted}
          />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.muted, fontSize: fs }]}>
            Verificando...
          </Text>
        </View>
      ) : error || !status ? (
        <View style={styles.errorRow}>
          <MaterialIcons name="cloud-off" size={accessible ? 20 : 16} color={colors.muted} />
          <Text style={[styles.errorText, { color: colors.muted, fontSize: fs }]}>
            Sem conexão com o servidor
          </Text>
        </View>
      ) : (
        <View style={styles.content}>
          {/* Linha 1: Última comunicação */}
          <View style={styles.row}>
            <View
              style={[
                styles.dot,
                { backgroundColor: isRecent ? colors.success : colors.warning },
              ]}
            />
            <View style={styles.rowText}>
              <Text style={[styles.rowLabel, { color: colors.muted, fontSize: fs - 1 }]}>
                Última comunicação com o servidor
              </Text>
              <Text
                style={[
                  styles.rowValue,
                  {
                    color: isRecent ? colors.success : colors.warning,
                    fontSize: fs,
                  },
                ]}
              >
                {checkInLabel}
              </Text>
            </View>
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          {/* Linha 2: Alarmes monitorados */}
          <View style={styles.row}>
            <MaterialIcons
              name="alarm"
              size={accessible ? 20 : 16}
              color={colors.primary}
              style={styles.rowIcon}
            />
            <View style={styles.rowText}>
              <Text style={[styles.rowLabel, { color: colors.muted, fontSize: fs - 1 }]}>
                Alarmes sendo monitorados
              </Text>
              <Text style={[styles.rowValue, { color: colors.foreground, fontSize: fs }]}>
                {status.enabledAlarmCount === 0
                  ? "Nenhum alarme ativo"
                  : status.enabledAlarmCount === 1
                  ? "1 alarme ativo"
                  : `${status.enabledAlarmCount} alarmes ativos`}
                {status.syncedAlarmCount > status.enabledAlarmCount &&
                  ` (${status.syncedAlarmCount - status.enabledAlarmCount} pausado${
                    status.syncedAlarmCount - status.enabledAlarmCount !== 1 ? "s" : ""
                  })`}
              </Text>
            </View>
          </View>

          {/* Linha 3: Resumo de eventos recentes (só se houver eventos) */}
          {totalEvents > 0 && (
            <>
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <View style={styles.row}>
                <MaterialIcons
                  name="history"
                  size={accessible ? 20 : 16}
                  color={colors.primary}
                  style={styles.rowIcon}
                />
                <View style={styles.rowText}>
                  <Text style={[styles.rowLabel, { color: colors.muted, fontSize: fs - 1 }]}>
                    Últimos 30 registros
                  </Text>
                  <View style={styles.eventBadges}>
                    {status.recentEvents.respondedCount > 0 && (
                      <View
                        style={[
                          styles.badge,
                          { backgroundColor: colors.success + "22" },
                        ]}
                      >
                        <Text
                          style={[
                            styles.badgeText,
                            { color: colors.success, fontSize: fs - 1 },
                          ]}
                        >
                          ✓ {status.recentEvents.respondedCount} respondido
                          {status.recentEvents.respondedCount !== 1 ? "s" : ""}
                        </Text>
                      </View>
                    )}
                    {status.recentEvents.missedCount > 0 && (
                      <View
                        style={[
                          styles.badge,
                          { backgroundColor: colors.warning + "22" },
                        ]}
                      >
                        <Text
                          style={[
                            styles.badgeText,
                            { color: colors.warning, fontSize: fs - 1 },
                          ]}
                        >
                          ! {status.recentEvents.missedCount} sem resposta
                        </Text>
                      </View>
                    )}
                    {status.recentEvents.notSentCount > 0 && (
                      <View
                        style={[
                          styles.badge,
                          { backgroundColor: colors.error + "22" },
                        ]}
                      >
                        <Text
                          style={[
                            styles.badgeText,
                            { color: colors.error, fontSize: fs - 1 },
                          ]}
                        >
                          ✕ {status.recentEvents.notSentCount} não enviado
                          {status.recentEvents.notSentCount !== 1 ? "s" : ""}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              </View>
            </>
          )}

          {/* Nota informativa */}
          <View style={[styles.note, { backgroundColor: colors.primary + "11" }]}>
            <MaterialIcons
              name="info-outline"
              size={accessible ? 16 : 13}
              color={colors.primary}
            />
            <Text
              style={[
                styles.noteText,
                { color: colors.primary, fontSize: accessible ? 13 : 11 },
              ]}
            >
              O servidor verifica seus alarmes automaticamente e avisa seus
              contatos caso você não responda.
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  title: {
    fontWeight: "600",
  },
  refreshBtn: {
    padding: 2,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  loadingText: {
    fontStyle: "italic",
  },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  errorText: {
    fontStyle: "italic",
  },
  content: {
    paddingBottom: 12,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 4,
  },
  rowIcon: {
    marginTop: 2,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowLabel: {
    fontWeight: "400",
  },
  rowValue: {
    fontWeight: "600",
  },
  divider: {
    height: 1,
    marginHorizontal: 16,
  },
  eventBadges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 4,
  },
  badge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: {
    fontWeight: "500",
  },
  note: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 8,
    padding: 10,
  },
  noteText: {
    flex: 1,
    lineHeight: 16,
  },
});
