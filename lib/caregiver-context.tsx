/**
 * lib/caregiver-context.tsx
 *
 * Estado global do app de cuidadores. Gerencia os dados do monitorado
 * vinculado, histórico de alertas e código de conexão.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useReducer } from 'react';
import { getApiBaseUrl } from '@/constants/oauth';
import { getDeviceId } from '@/lib/device-id';

// --- Tipos -------------------------------------------------------------------

export interface MonitoredPerson {
  /** deviceId do monitorado no backend */
  id: string;
  name: string | null;
  phone: string | null;
  /** Timestamp do último heartbeat recebido */
  lastSeenAt: number | null;
  /** Timestamp do último alarme disparado */
  lastAlarmAt: number | null;
  lastAlarmDescription: string | null;
  /** true = respondeu; false = perdeu; null = nenhum alarme ainda */
  lastAlarmResponded: boolean | null;
  lastLocation: { latitude: number; longitude: number } | null;
  lastHealthMetrics: {
    heartRate?: number;
    bloodPressure?: number;
    glucose?: number;
  };
  status: 'ok' | 'warning' | 'missed_alarm' | 'unknown';
}

export interface CaregiverAlert {
  id: string;
  alarmDescription: string;
  triggeredAt: number;
  location?: { latitude: number; longitude: number };
  healthSnapshot?: {
    heartRate?: number;
    bloodPressure?: number;
    glucose?: number;
  };
  acknowledged: boolean;
}

export interface CaregiverState {
  monitoredPerson: MonitoredPerson | null;
  alerts: CaregiverAlert[];
  isLoading: boolean;
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

// --- tRPC helpers (raw fetch — same pattern as monitoring-service.ts) --------

function parseSuperjsonResponse(data: any): any {
  const resultData = data?.result?.data;
  return resultData?.json ?? resultData ?? null;
}

async function caregiverMutation(procedure: string, input: unknown): Promise<any> {
  const url = `${getApiBaseUrl()}/api/trpc/${procedure}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ json: input }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return parseSuperjsonResponse(data);
  } catch (err) {
    console.warn('[CaregiverContext] mutation error:', procedure, err);
    return null;
  }
}

async function caregiverQuery(procedure: string, input: unknown): Promise<any> {
  const params = encodeURIComponent(JSON.stringify({ json: input }));
  const url = `${getApiBaseUrl()}/api/trpc/${procedure}?input=${params}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    return parseSuperjsonResponse(data);
  } catch (err) {
    console.warn('[CaregiverContext] query error:', procedure, err);
    return null;
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
   * Vincula o cuidador a um monitorado usando o código de convite de 6 chars.
   */
  const linkMonitoredPerson = useCallback(async (code: string): Promise<{ success: boolean; error?: string }> => {
    if (!/^[A-Z0-9]{6}$/i.test(code.trim())) {
      return { success: false, error: 'Código inválido. Use o código de 6 caracteres gerado pelo monitorado.' };
    }

    const deviceId = await getDeviceId();
    const result = await caregiverMutation('caregiver.linkWithCode', {
      caregiverDeviceId: deviceId,
      code: code.toUpperCase().trim(),
    });

    if (!result?.success) {
      return { success: false, error: result?.error ?? 'Código inválido ou expirado.' };
    }

    const { monitored } = result;

    // Parse lastLocation "lat,lng" string into coordinates
    let lastLocation: { latitude: number; longitude: number } | null = null;
    if (monitored.lastLocation) {
      const [lat, lng] = (monitored.lastLocation as string).split(',').map(Number);
      if (!isNaN(lat) && !isNaN(lng)) lastLocation = { latitude: lat, longitude: lng };
    }

    const person: MonitoredPerson = {
      id: monitored.deviceId,
      name: monitored.name,
      phone: null,
      lastSeenAt: monitored.lastSeenAt ? new Date(monitored.lastSeenAt).getTime() : null,
      lastAlarmAt: null,
      lastAlarmDescription: null,
      lastAlarmResponded: null,
      lastLocation,
      lastHealthMetrics: {},
      status: 'unknown',
    };

    dispatch({ type: 'SET_MONITORED_PERSON', payload: person });
    return { success: true };
  }, []);

  /**
   * Atualiza o status do monitorado buscando dados do backend.
   */
  const refreshMonitoredStatus = useCallback(async () => {
    if (!state.monitoredPerson) return;

    const deviceId = await getDeviceId();
    const result = await caregiverQuery('caregiver.getMonitoredStatus', {
      caregiverDeviceId: deviceId,
    });

    if (!result) return;

    let lastLocation: { latitude: number; longitude: number } | null = null;
    if (result.lastLocation) {
      const [lat, lng] = (result.lastLocation as string).split(',').map(Number);
      if (!isNaN(lat) && !isNaN(lng)) lastLocation = { latitude: lat, longitude: lng };
    }

    const lastAlarmAt = result.lastAlarm?.scheduledAt
      ? new Date(result.lastAlarm.scheduledAt).getTime()
      : null;
    const lastAlarmResponded =
      result.lastAlarm?.status === 'responded'
        ? true
        : result.lastAlarm?.status === 'missed'
        ? false
        : null;

    const updated: MonitoredPerson = {
      ...state.monitoredPerson,
      name: result.name ?? state.monitoredPerson.name,
      lastSeenAt: result.lastSeenAt ? new Date(result.lastSeenAt).getTime() : null,
      lastAlarmAt,
      lastAlarmDescription: result.lastAlarm?.description ?? null,
      lastAlarmResponded,
      lastLocation,
      status: result.status ?? 'unknown',
    };

    dispatch({ type: 'SET_MONITORED_PERSON', payload: updated });
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
