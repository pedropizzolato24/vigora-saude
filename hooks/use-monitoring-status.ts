/**
 * use-monitoring-status.ts
 *
 * Hook que busca e mantém o status do monitoramento do servidor.
 * Reutilizado pelo MonitoringStatusPanel (Configurações) e pelo
 * MonitoringStatusBadge (header do Dashboard).
 */
import { useState, useEffect, useCallback } from "react";

export type MonitoringStatus = {
  lastCheckIn: string | null;
  syncedAlarmCount: number;
  enabledAlarmCount: number;
  recentEvents: {
    respondedCount: number;
    missedCount: number;
    notSentCount: number;
  };
};

/** Converte o timestamp da última verificação em label legível */
export function formatLastCheckIn(dateStr: string | null): {
  label: string;
  isRecent: boolean;
} {
  if (!dateStr) return { label: "Nunca conectado", isRecent: false };
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);

  let label: string;
  if (diffMin < 2) {
    label = "Agora mesmo";
  } else if (diffMin < 60) {
    label = `Há ${diffMin} minuto${diffMin !== 1 ? "s" : ""}`;
  } else if (diffHours < 24) {
    label = `Há ${diffHours} hora${diffHours !== 1 ? "s" : ""}`;
  } else if (diffDays === 1) {
    label = "Ontem";
  } else if (diffDays < 7) {
    label = `Há ${diffDays} dias`;
  } else {
    label = date.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    });
  }
  return { label, isRecent: diffMin < 15 };
}

/**
 * Hook que busca o status do monitoramento do servidor.
 * Retorna status, loading, error e uma função refresh.
 */
export function useMonitoringStatus(autoRefreshMs?: number) {
  const [status, setStatus] = useState<MonitoringStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const { getMonitoringStatus } = await import("@/lib/monitoring-service");
      const result = await getMonitoringStatus();
      setStatus(result);
      if (!result) setError(true);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Auto-refresh opcional
  useEffect(() => {
    if (!autoRefreshMs) return;
    const timer = setInterval(refresh, autoRefreshMs);
    return () => clearInterval(timer);
  }, [refresh, autoRefreshMs]);

  const { label: checkInLabel, isRecent } = formatLastCheckIn(
    status?.lastCheckIn ?? null
  );

  return { status, loading, error, refresh, checkInLabel, isRecent };
}
