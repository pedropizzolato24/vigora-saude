/**
 * caregiver-context.tsx
 *
 * Provider around `caregiverReducer` that hydrates from / persists to
 * AsyncStorage under `vigora_caregiver_state`. Mounted in `app/_layout.tsx`
 * alongside `AppProvider`.
 *
 * Caregiver state is local-only in the shell — when real caregiver↔monitored
 * sync is built, this provider will hydrate from the server instead and the
 * `LinkedMonitored.status` will transition from 'pending' to 'active'.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import React, { createContext, useCallback, useContext, useEffect, useReducer, useState } from 'react';
import {
  DEFAULT_CAREGIVER_STATE,
  caregiverReducer,
  type CaregiverNotificationPrefs,
  type CaregiverState,
  type LinkMethod,
  type LinkedMonitored,
} from './caregiver-state';

const STORAGE_KEY = 'vigora_caregiver_state';

interface CaregiverContextValue {
  state: CaregiverState;
  setLinkedMonitored: (input: {
    method: LinkMethod;
    identifier: string;
    displayName: string;
    relationship?: string;
  }) => LinkedMonitored;
  clearLinkedMonitored: () => void;
  updateNotificationPrefs: (partial: Partial<CaregiverNotificationPrefs>) => void;
}

const CaregiverContext = createContext<CaregiverContextValue | null>(null);

export function CaregiverProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(caregiverReducer, DEFAULT_CAREGIVER_STATE);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<CaregiverState>;
          dispatch({
            type: 'LOAD',
            payload: {
              linkedMonitored: parsed.linkedMonitored ?? null,
              notificationPrefs: {
                ...DEFAULT_CAREGIVER_STATE.notificationPrefs,
                ...(parsed.notificationPrefs ?? {}),
              },
            },
          });
        }
      } catch {
        // ignore parse errors — start with defaults
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => {});
  }, [state, loaded]);

  const setLinkedMonitored = useCallback<CaregiverContextValue['setLinkedMonitored']>((input) => {
    const stub: LinkedMonitored = {
      id: Crypto.randomUUID(),
      method: input.method,
      identifier: input.identifier,
      displayName: input.displayName,
      relationship: input.relationship,
      linkedAt: Date.now(),
      status: 'pending',
    };
    dispatch({ type: 'SET_LINK', payload: stub });
    return stub;
  }, []);

  const clearLinkedMonitored = useCallback(() => dispatch({ type: 'CLEAR_LINK' }), []);
  const updateNotificationPrefs = useCallback<CaregiverContextValue['updateNotificationPrefs']>(
    (partial) => dispatch({ type: 'UPDATE_PREFS', payload: partial }),
    [],
  );

  return (
    <CaregiverContext.Provider
      value={{ state, setLinkedMonitored, clearLinkedMonitored, updateNotificationPrefs }}
    >
      {children}
    </CaregiverContext.Provider>
  );
}

export function useCaregiverContext(): CaregiverContextValue {
  const ctx = useContext(CaregiverContext);
  if (!ctx) throw new Error('useCaregiverContext must be used within CaregiverProvider');
  return ctx;
}
