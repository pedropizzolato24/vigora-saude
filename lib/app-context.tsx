import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import React, { createContext, useCallback, useContext, useEffect, useRef, useReducer } from 'react';
import { updateAllWidgets } from './update-widgets';
import { pullCloudData, pushCloudData, type CloudSnapshot } from './cloud-sync';

// --- Types -------------------------------------------------------------------

export interface Alarm {
  id: string;
  time: string; // HH:mm
  description: string;
  enabled: boolean;
  repeat: 'daily' | 'weekdays' | 'weekends' | 'custom';
  /** Days of week for 'custom' repeat: 0=Sun, 1=Mon, ..., 6=Sat */
  customDays?: number[];
  sound: boolean;
  vibration: boolean;
  notificationId?: string; // Expo notification ID for scheduled alarm
  nativeAlarmUids?: string[]; // Native AlarmManager UIDs (Android only)
}

export interface EmergencyContact {
  id: string;
  name: string;
  phone: string;
  relation: string;
  whatsapp: boolean;
  email?: string; // Optional email for fallback notifications
  /**
   * ANATEL opt-in: did this contact agree to receive automatic alerts?
   * The automatic dead man's switch skips contacts where this is explicitly
   * false; legacy contacts (undefined) are grandfathered as consented.
   */
  consentToAlerts?: boolean;
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
  accessibilityMode: boolean; // High-contrast, large-font, simplified layout mode
  speechRate: 0.5 | 0.75 | 1.0 | 1.25; // TTS speech rate
  speechVolume: number; // TTS volume 0-100 (independent of alarm volume)
  timerDuration: 15 | 30 | 45 | 60; // Seconds before emergency escalation
  /** Check-in diário "Você está bem?" */
  checkinEnabled: boolean;
  /** Horário do check-in no formato HH:mm */
  checkinTime: string;
  /** Minutos que o usuário tem para responder antes de escalonar */
  checkinWindowMinutes: number;
  /**
   * Consentimento destacado para tratar dados sensíveis de saúde (LGPD Art. 11).
   * epoch-ms de quando foi concedido, ou null se ainda não consentiu. As telas
   * de saúde (anamnese, métricas) não coletam dados enquanto for null.
   */
  healthConsentAt: number | null;
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
  /** Epoch ms of the last local data change. Drives cloud last-write-wins. */
  dataUpdatedAt: number;
}

// --- Actions -----------------------------------------------------------------

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

// --- Initial State ------------------------------------------------------------

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
    accessibilityMode: false,
    speechRate: 0.75,
    speechVolume: 90,
    timerDuration: 30,
    checkinEnabled: false,
    checkinTime: '09:00',
    checkinWindowMinutes: 30,
    healthConsentAt: null,
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
  dataUpdatedAt: 0,
};

// --- Reducer -----------------------------------------------------------------

/** Actions that mutate user data we want backed up to the cloud. */
const DATA_ACTIONS = new Set<AppAction['type']>([
  'ADD_ALARM',
  'UPDATE_ALARM',
  'DELETE_ALARM',
  'ADD_CONTACT',
  'UPDATE_CONTACT',
  'DELETE_CONTACT',
  'SET_ANAMNESIS',
  'ADD_HEALTH_METRIC',
  'DELETE_HEALTH_METRIC',
  'UPDATE_SETTINGS',
  'UPDATE_PROFILE',
  'CLEAR_ALL_DATA',
]);

function appReducer(state: AppState, action: AppAction): AppState {
  const next = baseReducer(state, action);
  // Stamp the change time so the cloud sync can resolve conflicts. We skip when
  // the reducer returned the same reference (no-op, e.g. alarm cap reached).
  if (next !== state && DATA_ACTIONS.has(action.type)) {
    return { ...next, dataUpdatedAt: Date.now() };
  }
  return next;
}

function baseReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'LOAD_STATE':
      return { ...state, ...action.payload, isLoading: false };

    case 'ADD_ALARM': {
      if (state.alarms.length >= 24) return state;
      const newAlarms = [...state.alarms, action.payload].sort((a, b) =>
        a.time.localeCompare(b.time)
      );
      return { ...state, alarms: newAlarms };
    }

    case 'UPDATE_ALARM': {
      const updatedAlarms = state.alarms
        .map((a) => (a.id === action.payload.id ? action.payload : a))
        .sort((a, b) => a.time.localeCompare(b.time));
      return { ...state, alarms: updatedAlarms };
    }

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

// --- Context -----------------------------------------------------------------

interface AppContextValue {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
  /**
   * Pull the cloud backup and reconcile it with local state. Called once after
   * startup and again right after login completes (when the session token only
   * becomes available after the provider has already mounted).
   */
  reconcileFromCloud: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

const STORAGE_KEY = 'vigora_app_state';

function buildSnapshot(state: AppState): CloudSnapshot {
  return {
    anamnesis: state.anamnesis,
    emergencyContacts: state.emergencyContacts,
    alarms: state.alarms,
    settings: state.settings,
    healthMetrics: state.healthMetrics,
    profile: state.profile,
    dataUpdatedAt: state.dataUpdatedAt,
  };
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  // Latest state, readable inside async callbacks without re-subscribing them.
  const stateRef = useRef(state);
  stateRef.current = state;
  // syncReady gates the debounced push (don't push before the first reconcile).
  // inFlight prevents overlapping reconciles. lastSyncedTs avoids echoing a
  // just-pulled snapshot back to the server.
  const syncReadyRef = useRef(false);
  const inFlightRef = useRef(false);
  const lastSyncedTsRef = useRef(0);
  const pushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Pull the cloud backup and reconcile. If the cloud copy is newer (e.g. after
  // a reinstall), apply it; otherwise back the local copy up. No-ops when
  // unauthenticated (cloud-sync returns null). Safe to call repeatedly — it's
  // re-invoked after login because the session token only exists by then.
  const reconcileFromCloud = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const local = stateRef.current;
      const cloud = await pullCloudData();
      if (cloud && cloud.dataUpdatedAt > local.dataUpdatedAt) {
        // Cloud wins: hydrate local state from the backup.
        const payload: Partial<AppState> = {
          anamnesis: cloud.anamnesis,
          emergencyContacts: cloud.emergencyContacts ?? [],
          alarms: cloud.alarms ?? [],
          healthMetrics: cloud.healthMetrics ?? [],
          dataUpdatedAt: cloud.dataUpdatedAt,
        };
        if (cloud.settings) payload.settings = { ...local.settings, ...cloud.settings };
        if (cloud.profile) payload.profile = { ...local.profile, ...cloud.profile };
        lastSyncedTsRef.current = cloud.dataUpdatedAt;
        dispatch({ type: 'LOAD_STATE', payload });
      } else if (local.dataUpdatedAt > 0) {
        // Local is newer (or no cloud row yet): back it up.
        const ok = await pushCloudData(buildSnapshot(local));
        if (ok) lastSyncedTsRef.current = local.dataUpdatedAt;
      }
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  // First reconcile, after the local state has loaded. For a returning user the
  // session token already exists here; for a fresh install it doesn't yet, so
  // the OAuth callback re-invokes reconcileFromCloud once login completes.
  useEffect(() => {
    if (state.isLoading || syncReadyRef.current) return;
    syncReadyRef.current = true;
    lastSyncedTsRef.current = stateRef.current.dataUpdatedAt;
    reconcileFromCloud();
  }, [state.isLoading, reconcileFromCloud]);

  // Debounced push: whenever local data changes after the first reconcile,
  // back the new snapshot up to the cloud (3s after the last change).
  useEffect(() => {
    if (state.isLoading || !syncReadyRef.current) return;
    if (state.dataUpdatedAt <= lastSyncedTsRef.current) return;

    if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
    pushTimerRef.current = setTimeout(() => {
      const snapshot = buildSnapshot(stateRef.current);
      pushCloudData(snapshot).then((ok) => {
        if (ok) lastSyncedTsRef.current = snapshot.dataUpdatedAt;
      });
    }, 3000);

    return () => {
      if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
    };
  }, [state.dataUpdatedAt, state.isLoading]);

  // Persist state on every change (except isLoading)
  useEffect(() => {
    if (state.isLoading) return;
    const { isLoading: _loading, ...persistable } = state;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(persistable)).catch(
      () => {}
    );
  }, [state]);

  // Atualiza widgets Android quando alarmes ou métricas de saúde mudarem
  useEffect(() => {
    if (state.isLoading) return;
    updateAllWidgets(state.alarms, state.healthMetrics).catch(() => {});
  }, [state.alarms, state.healthMetrics, state.isLoading]);

  return (
    <AppContext.Provider value={{ state, dispatch, reconcileFromCloud }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used within AppProvider');
  return ctx;
}

// --- Helpers -----------------------------------------------------------------

export function generateId(): string {
  // CSPRNG-backed via expo-crypto. RFC 4122 v4 — no collision worries,
  // no guessability across the API surface.
  return Crypto.randomUUID();
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
