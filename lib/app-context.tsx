import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useReducer } from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Alarm {
  id: string;
  time: string; // HH:mm
  description: string;
  enabled: boolean;
  repeat: 'daily' | 'weekdays' | 'weekends' | 'custom';
  sound: boolean;
  vibration: boolean;
  notificationId?: string; // Expo notification ID for scheduled alarm
}

export interface EmergencyContact {
  id: string;
  name: string;
  phone: string;
  relation: string;
  whatsapp: boolean;
}

export interface AnamnesesData {
  fullName: string;
  birthDate: string;
  gender: 'M' | 'F' | 'O';
  allergies: string;
  medications: string;
  diseases: string;
  susNumber: string;
  healthPlanNumber: string;
  healthPlanProvider: string;
}

export interface HealthMetric {
  id: string;
  type: 'heart_rate' | 'blood_pressure' | 'glucose';
  value: number;
  unit: string;
  timestamp: number;
}

export interface AppSettings {
  notificationsEnabled: boolean;
  alarmVolume: number; // 0-100
  language: 'pt' | 'en';
  missedAlarmThreshold: number; // Number of missed alarms before WhatsApp escalation (1-10)
  vibrationEnabled: boolean;
  sosConfirmation: boolean; // Require confirmation before SOS
  autoShareLocation: boolean; // Auto-share location on SOS
  fontSize: 'small' | 'medium' | 'large';
  emergencyMessage: string; // Custom message for WhatsApp escalation
}

export interface UserProfile {
  name: string;
  photoUri: string | null;
  birthDate: string;
  bloodType: string;
  phone: string;
}

export interface Ad {
  id: string;
  title: string;
  description: string;
  imageUrl?: string;
  icon?: string;
  actionUrl?: string;
  active: boolean;
}

export interface AppState {
  alarms: Alarm[];
  emergencyContacts: EmergencyContact[];
  anamnesis: AnamnesesData | null;
  healthMetrics: HealthMetric[];
  lastSOS: number | null;
  settings: AppSettings;
  ads: Ad[];
  missedAlarmCount: number;
  profile: UserProfile;
  isLoading: boolean;
}

// ─── Actions ─────────────────────────────────────────────────────────────────

type AppAction =
  | { type: 'LOAD_STATE'; payload: Partial<AppState> }
  | { type: 'ADD_ALARM'; payload: Alarm }
  | { type: 'UPDATE_ALARM'; payload: Alarm }
  | { type: 'DELETE_ALARM'; payload: string }
  | { type: 'ADD_CONTACT'; payload: EmergencyContact }
  | { type: 'UPDATE_CONTACT'; payload: EmergencyContact }
  | { type: 'DELETE_CONTACT'; payload: string }
  | { type: 'SET_ANAMNESIS'; payload: AnamnesesData }
  | { type: 'ADD_HEALTH_METRIC'; payload: HealthMetric }
  | { type: 'DELETE_HEALTH_METRIC'; payload: string }
  | { type: 'TRIGGER_SOS' }
  | { type: 'UPDATE_SETTINGS'; payload: Partial<AppSettings> }
  | { type: 'INCREMENT_MISSED_ALARM' }
  | { type: 'RESET_MISSED_ALARM' }
  | { type: 'UPDATE_PROFILE'; payload: Partial<UserProfile> }
  | { type: 'CLEAR_ALL_DATA' };

// ─── Initial State ────────────────────────────────────────────────────────────

const initialState: AppState = {
  alarms: [],
  emergencyContacts: [],
  anamnesis: null,
  healthMetrics: [],
  lastSOS: null,
  settings: {
    notificationsEnabled: true,
    alarmVolume: 80,
    language: 'pt',
    missedAlarmThreshold: 3,
    vibrationEnabled: true,
    sosConfirmation: true,
    autoShareLocation: true,
    fontSize: 'medium',
    emergencyMessage: 'URGENTE: Não estou respondendo aos meus alarmes de saúde. Por favor, verifique se estou bem.',
  },
  ads: [],
  missedAlarmCount: 0,
  profile: {
    name: '',
    photoUri: null,
    birthDate: '',
    bloodType: '',
    phone: '',
  },
  isLoading: true,
};

// ─── Reducer ─────────────────────────────────────────────────────────────────

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'LOAD_STATE':
      return { ...state, ...action.payload, isLoading: false };

    case 'ADD_ALARM':
      if (state.alarms.length >= 24) return state;
      return { ...state, alarms: [...state.alarms, action.payload] };

    case 'UPDATE_ALARM':
      return {
        ...state,
        alarms: state.alarms.map((a) =>
          a.id === action.payload.id ? action.payload : a
        ),
      };

    case 'DELETE_ALARM':
      return {
        ...state,
        alarms: state.alarms.filter((a) => a.id !== action.payload),
      };

    case 'ADD_CONTACT':
      return {
        ...state,
        emergencyContacts: [...state.emergencyContacts, action.payload],
      };

    case 'UPDATE_CONTACT':
      return {
        ...state,
        emergencyContacts: state.emergencyContacts.map((c) =>
          c.id === action.payload.id ? action.payload : c
        ),
      };

    case 'DELETE_CONTACT':
      return {
        ...state,
        emergencyContacts: state.emergencyContacts.filter(
          (c) => c.id !== action.payload
        ),
      };

    case 'SET_ANAMNESIS':
      return { ...state, anamnesis: action.payload };

    case 'ADD_HEALTH_METRIC':
      return {
        ...state,
        healthMetrics: [action.payload, ...state.healthMetrics].slice(0, 50),
      };

    case 'DELETE_HEALTH_METRIC':
      return {
        ...state,
        healthMetrics: state.healthMetrics.filter(
          (m) => m.id !== action.payload
        ),
      };

    case 'TRIGGER_SOS':
      return { ...state, lastSOS: Date.now() };

    case 'UPDATE_SETTINGS':
      return {
        ...state,
        settings: { ...state.settings, ...action.payload },
      };

    case 'INCREMENT_MISSED_ALARM':
      return { ...state, missedAlarmCount: state.missedAlarmCount + 1 };

    case 'RESET_MISSED_ALARM':
      return { ...state, missedAlarmCount: 0 };

    case 'UPDATE_PROFILE':
      return {
        ...state,
        profile: { ...state.profile, ...action.payload },
      };

    case 'CLEAR_ALL_DATA':
      return {
        ...initialState,
        isLoading: false,
      };

    default:
      return state;
  }
}

// ─── Context ─────────────────────────────────────────────────────────────────

interface AppContextValue {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
}

const AppContext = createContext<AppContextValue | null>(null);

const STORAGE_KEY = 'vigora_app_state';

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  // Load persisted state on mount
  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as Partial<AppState>;
          dispatch({ type: 'LOAD_STATE', payload: parsed });
        } else {
          dispatch({ type: 'LOAD_STATE', payload: {} });
        }
      } catch {
        dispatch({ type: 'LOAD_STATE', payload: {} });
      }
    })();
  }, []);

  // Persist state on every change (except isLoading)
  useEffect(() => {
    if (state.isLoading) return;
    const { isLoading: _loading, ...persistable } = state;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(persistable)).catch(
      () => {}
    );
  }, [state]);

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used within AppProvider');
  return ctx;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function getNextAlarm(alarms: Alarm[]): Alarm | null {
  const enabled = alarms.filter((a) => a.enabled);
  if (enabled.length === 0) return null;
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const sorted = [...enabled].sort((a, b) => {
    const [ah, am] = a.time.split(':').map(Number);
    const [bh, bm] = b.time.split(':').map(Number);
    const aMin = ah * 60 + am;
    const bMin = bh * 60 + bm;
    const aDiff = aMin >= nowMinutes ? aMin - nowMinutes : aMin + 1440 - nowMinutes;
    const bDiff = bMin >= nowMinutes ? bMin - nowMinutes : bMin + 1440 - nowMinutes;
    return aDiff - bDiff;
  });
  return sorted[0] ?? null;
}

export function getHealthStatus(
  type: HealthMetric['type'],
  value: number
): 'normal' | 'warning' | 'critical' {
  switch (type) {
    case 'heart_rate':
      if (value >= 60 && value <= 100) return 'normal';
      if (value >= 50 && value <= 120) return 'warning';
      return 'critical';
    case 'blood_pressure':
      if (value >= 90 && value <= 120) return 'normal';
      if (value >= 80 && value <= 140) return 'warning';
      return 'critical';
    case 'glucose':
      if (value >= 70 && value <= 100) return 'normal';
      if (value >= 60 && value <= 140) return 'warning';
      return 'critical';
    default:
      return 'normal';
  }
}
