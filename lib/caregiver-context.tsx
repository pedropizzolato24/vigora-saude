/**
 * lib/caregiver-context.tsx
 *
 * Estado global do app de cuidadores. Gerencia os dados do monitorado
 * vinculado, histórico de alertas e código de conexão.
 *
 * Futuramente os dados virão do backend via tRPC após autenticação.
 * Por enquanto usa estado local com AsyncStorage para persistência.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useReducer } from 'react';

// --- Tipos -------------------------------------------------------------------

export interface MonitoredPerson {
  /** ID do usuário monitorado no backend */
  id: string;
  name: string;
  phone: string;
  /** Timestamp do último heartbeat recebido */
  lastSeenAt: number | null;
  /** Timestamp do último alarme disparado */
  lastAlarmAt: number | null;
  lastAlarmDescription: string | null;
  /** true = usuário respondeu; false = alarme foi perdido; null = nenhum alarme ainda */
  lastAlarmResponded: boolean | null;
  lastLocation: { latitude: number; longitude: number } | null;
  /** Últimas métricas de saúde registradas manualmente pelo monitorado */
  lastHealthMetrics: {
    heartRate?: number;
    bloodPressure?: number;
    glucose?: number;
  };
  /** Status calculado com base nos dados mais recentes */
  status: 'ok' | 'warning' | 'missed_alarm' | 'unknown';
}

export interface CaregiverAlert {
  id: string;
  alarmDescription: string;
  triggeredAt: number;
  /** Localização do monitorado no momento do disparo */
  location?: { latitude: number; longitude: number };
  /** Snapshot das métricas de saúde no momento do disparo */
  healthSnapshot?: {
    heartRate?: number;
    bloodPressure?: number;
    glucose?: number;
  };
  acknowledged: boolean;
}

export interface CaregiverState {
  /** Pessoa monitorada vinculada a este cuidador (null = não vinculado) */
  monitoredPerson: MonitoredPerson | null;
  alerts: CaregiverAlert[];
  /** true enquanto carrega do AsyncStorage */
  isLoading: boolean;
  /** Quantidade de alertas não lidos */
  unreadCount: number;
}

// --- Actions -----------------------------------------------------------------

type CaregiverAction =
  | { type: 'LOAD_STATE'; payload: Partial<CaregiverState> }
  | { type: 'SET_MONITORED_PERSON'; payload: MonitoredPerson }
  | { type: 'UNLINK_MONITORED_PERSON' }
  | { type: 'ADD_ALERT'; payload: CaregiverAlert }
  | { type: 'ACKNOWLEDGE_ALERT'; payload: string }
  | { type: 'ACKNOWLEDGE_ALL_ALERTS' }
  | { type: 'CLEAR_ALL_DATA' };

// --- Initial State -----------------------------------------------------------

const initialState: CaregiverState = {
  monitoredPerson: null,
  alerts: [],
  isLoading: true,
  unreadCount: 0,
};

// --- Reducer -----------------------------------------------------------------

function caregiverReducer(state: CaregiverState, action: CaregiverAction): CaregiverState {
  switch (action.type) {
    case 'LOAD_STATE': {
      const next = { ...state, ...action.payload, isLoading: false };
      next.unreadCount = next.alerts.filter((a) => !a.acknowledged).length;
      return next;
    }

    case 'SET_MONITORED_PERSON':
      return { ...state, monitoredPerson: action.payload };

    case 'UNLINK_MONITORED_PERSON':
      return { ...state, monitoredPerson: null, alerts: [], unreadCount: 0 };

    case 'ADD_ALERT': {
      const alerts = [action.payload, ...state.alerts].slice(0, 100);
      return { ...state, alerts, unreadCount: state.unreadCount + 1 };
    }

    case 'ACKNOWLEDGE_ALERT': {
      const alerts = state.alerts.map((a) =>
        a.id === action.payload ? { ...a, acknowledged: true } : a
      );
      return { ...state, alerts, unreadCount: alerts.filter((a) => !a.acknowledged).length };
    }

    case 'ACKNOWLEDGE_ALL_ALERTS': {
      const alerts = state.alerts.map((a) => ({ ...a, acknowledged: true }));
      return { ...state, alerts, unreadCount: 0 };
    }

    case 'CLEAR_ALL_DATA':
      return { ...initialState, isLoading: false };

    default:
      return state;
  }
}

// --- Context -----------------------------------------------------------------

interface CaregiverContextValue {
  state: CaregiverState;
  dispatch: React.Dispatch<CaregiverAction>;
  linkMonitoredPerson: (code: string) => Promise<{ success: boolean; error?: string }>;
  refreshMonitoredStatus: () => Promise<void>;
}

const CaregiverContext = createContext<CaregiverContextValue | null>(null);

const STORAGE_KEY = 'vigora_caregiver_state';

export function CaregiverProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(caregiverReducer, initialState);

  // Carregar estado persistido
  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as Partial<CaregiverState>;
          dispatch({ type: 'LOAD_STATE', payload: parsed });
        } else {
          dispatch({ type: 'LOAD_STATE', payload: {} });
        }
      } catch {
        dispatch({ type: 'LOAD_STATE', payload: {} });
      }
    })();
  }, []);

  // Persistir estado a cada mudança
  useEffect(() => {
    if (state.isLoading) return;
    const { isLoading: _l, ...persistable } = state;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(persistable)).catch(() => {});
  }, [state]);

  /**
   * Vincula o cuidador a um monitorado usando um código de convite.
   * TODO: implementar chamada real ao backend quando auth estiver pronto.
   */
  const linkMonitoredPerson = useCallback(async (code: string): Promise<{ success: boolean; error?: string }> => {
    // Validação básica do formato do código (6 caracteres alfanuméricos)
    if (!/^[A-Z0-9]{6}$/i.test(code.trim())) {
      return { success: false, error: 'Código inválido. Use o código de 6 caracteres gerado pelo monitorado.' };
    }

    // TODO: chamar backend para validar o código e retornar os dados do monitorado
    // Por enquanto usa dados simulados para desenvolvimento
    const mockPerson: MonitoredPerson = {
      id: 'mock-monitored-001',
      name: 'João Silva',
      phone: '(11) 98765-4321',
      lastSeenAt: Date.now() - 12 * 60 * 1000, // 12 minutos atrás
      lastAlarmAt: Date.now() - 2 * 60 * 60 * 1000, // 2 horas atrás
      lastAlarmDescription: 'Losartana 50mg',
      lastAlarmResponded: true,
      lastLocation: { latitude: -23.5505, longitude: -46.6333 },
      lastHealthMetrics: {
        heartRate: 72,
        bloodPressure: 118,
        glucose: 95,
      },
      status: 'ok',
    };

    dispatch({ type: 'SET_MONITORED_PERSON', payload: mockPerson });
    return { success: true };
  }, []);

  /**
   * Atualiza o status do monitorado buscando dados do backend.
   * TODO: implementar chamada real ao backend.
   */
  const refreshMonitoredStatus = useCallback(async () => {
    if (!state.monitoredPerson) return;
    // TODO: buscar dados atualizados do backend
  }, [state.monitoredPerson]);

  return (
    <CaregiverContext.Provider value={{ state, dispatch, linkMonitoredPerson, refreshMonitoredStatus }}>
      {children}
    </CaregiverContext.Provider>
  );
}

export function useCaregiverContext(): CaregiverContextValue {
  const ctx = useContext(CaregiverContext);
  if (!ctx) throw new Error('useCaregiverContext must be used within CaregiverProvider');
  return ctx;
}

// --- Helpers -----------------------------------------------------------------

export function getMonitoredStatusConfig(status: MonitoredPerson['status']): {
  label: string;
  color: string;
  bg: string;
  icon: string;
} {
  switch (status) {
    case 'ok':
      return { label: 'Tudo bem', color: '#16A34A', bg: '#DCFCE7', icon: 'check-circle' };
    case 'warning':
      return { label: 'Atenção', color: '#D97706', bg: '#FEF3C7', icon: 'warning' };
    case 'missed_alarm':
      return { label: 'Alarme perdido!', color: '#DC2626', bg: '#FEE2E2', icon: 'notification-important' };
    case 'unknown':
    default:
      return { label: 'Sem sinal', color: '#6B7280', bg: '#F3F4F6', icon: 'help' };
  }
}

export function formatLastSeen(timestamp: number | null): string {
  if (!timestamp) return 'Nunca';
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Agora mesmo';
  if (minutes < 60) return `${minutes} min atrás`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h atrás`;
  const days = Math.floor(hours / 24);
  return `${days} dia(s) atrás`;
}
