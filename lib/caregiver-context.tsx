/**
 * caregiver-context.tsx
 *
 * Provider around `caregiverReducer`. The linked-monitored relationship is the
 * server's source of truth (the `link` tRPC router): on mount we hydrate from
 * `link.getMyLink` and reconcile the local cache. AsyncStorage
 * (`vigora_caregiver_state`) is kept as an offline-first cache so the caregiver
 * still sees who they're linked to with no connection. notificationPrefs remain
 * local-only.
 *
 * The provider sits outside the tRPC React provider in the tree, so it talks to
 * the server through caregiver-link-service.ts (raw fetch) rather than hooks.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useReducer, useRef, useState } from 'react';
import {
  DEFAULT_CAREGIVER_STATE,
  caregiverReducer,
  type CaregiverNotificationPrefs,
  type CaregiverState,
  type LinkedMonitored,
} from './caregiver-state';
import {
  NotAuthenticatedError,
  fetchMyLink,
  redeemInvite as svcRedeemInvite,
  revokeServerLink,
  type ServerLink,
} from './caregiver-link-service';

const STORAGE_KEY = 'vigora_caregiver_state';

interface RedeemOptions {
  displayName?: string;
  relationship?: string;
  method: 'code' | 'qr';
}

interface CaregiverContextValue {
  state: CaregiverState;
  /** Redeem a monitored person's invite code (or scanned QR) to create the link. */
  redeemInvite: (
    code: string,
    opts: RedeemOptions,
  ) => Promise<{ monitoredOpenId: string; monitoredName: string | null }>;
  clearLinkedMonitored: () => Promise<void>;
  updateNotificationPrefs: (partial: Partial<CaregiverNotificationPrefs>) => void;
  /**
   * Re-fetch the link from the server. Call this once auth becomes available
   * (e.g. from the caregiver tabs layout after login) — the provider mounts at
   * the app root before login, so the initial hydration can run unauthenticated.
   */
  refreshLink: () => Promise<void>;
}

const CaregiverContext = createContext<CaregiverContextValue | null>(null);

function mapServerLink(l: ServerLink): LinkedMonitored {
  return {
    id: l.monitoredOpenId,
    monitoredOpenId: l.monitoredOpenId,
    method: l.method,
    identifier: l.monitoredOpenId,
    displayName: l.displayName || l.monitoredName || 'Pessoa acompanhada',
    relationship: l.relationship ?? undefined,
    linkedAt: l.linkedAt,
    status: l.status === 'active' ? 'active' : 'pending',
  };
}

export function CaregiverProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(caregiverReducer, DEFAULT_CAREGIVER_STATE);
  const [loaded, setLoaded] = useState(false);

  // Track the latest link so clearLinkedMonitored can read it without being
  // re-created on every state change.
  const linkRef = useRef(state.linkedMonitored);
  useEffect(() => {
    linkRef.current = state.linkedMonitored;
  }, [state.linkedMonitored]);

  // Reconcile with the server (authoritative). Safe to call repeatedly:
  //   - link found     -> store it
  //   - no link (auth) -> drop any stale local link (old stub / revoked elsewhere)
  //   - not authed yet -> keep the cache (initial mount runs before login)
  //   - network error  -> keep the cache (offline-first)
  const refreshLink = useCallback(async () => {
    try {
      const link = await fetchMyLink();
      if (link) {
        dispatch({ type: 'SET_LINK', payload: mapServerLink(link) });
      } else {
        dispatch({ type: 'CLEAR_LINK' });
      }
    } catch (err) {
      if (err instanceof NotAuthenticatedError) return; // not logged in yet
      // network error: keep the cached link; nothing else to do
    }
  }, []);

  useEffect(() => {
    (async () => {
      // 1. Hydrate from the local cache first (offline-first).
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

      // 2. Reconcile with the server. If the user isn't authenticated yet (app
      // just opened, pre-login), this is a no-op — the caregiver tabs layout
      // calls refreshLink() again once login completes.
      await refreshLink();
    })();
  }, [refreshLink]);

  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => {});
  }, [state, loaded]);

  const redeemInvite = useCallback<CaregiverContextValue['redeemInvite']>(async (code, opts) => {
    const result = await svcRedeemInvite({
      code,
      displayName: opts.displayName,
      relationship: opts.relationship,
      method: opts.method,
    });
    const link: LinkedMonitored = {
      id: result.monitoredOpenId,
      monitoredOpenId: result.monitoredOpenId,
      method: opts.method,
      identifier: result.monitoredOpenId,
      displayName: opts.displayName?.trim() || result.monitoredName || code,
      relationship: opts.relationship,
      linkedAt: Date.now(),
      status: 'active',
    };
    dispatch({ type: 'SET_LINK', payload: link });
    return result;
  }, []);

  const clearLinkedMonitored = useCallback(async () => {
    const current = linkRef.current;
    if (current?.monitoredOpenId) {
      // Best-effort server revoke; clear locally regardless so the UI responds.
      try {
        await revokeServerLink(current.monitoredOpenId);
      } catch {
        // ignore — local state still clears
      }
    }
    dispatch({ type: 'CLEAR_LINK' });
  }, []);

  const updateNotificationPrefs = useCallback<CaregiverContextValue['updateNotificationPrefs']>(
    (partial) => dispatch({ type: 'UPDATE_PREFS', payload: partial }),
    [],
  );

  return (
    <CaregiverContext.Provider
      value={{ state, redeemInvite, clearLinkedMonitored, updateNotificationPrefs, refreshLink }}
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
