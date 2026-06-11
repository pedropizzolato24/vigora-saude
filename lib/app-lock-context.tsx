/**
 * lib/app-lock-context.tsx
 *
 * Estado global do bloqueio de app (estilo app de banco): com o bloqueio
 * ativo, o app exige PIN ou biometria no cold start e ao voltar do
 * background depois da carência (GRACE_PERIOD_MS).
 *
 * Decisões importantes:
 * - A fonte de verdade na hora de travar é o SecureStore (re-lido a cada
 *   decisão), não o estado em memória — assim um logout que limpou as chaves
 *   nunca deixa o app travado sem PIN cadastrado.
 * - Só trava com sessão ativa: sem login não há dado de saúde para proteger.
 * - As telas /alarm-ring e /checkin-response nunca são cobertas (isso fica no
 *   AppLockGate) para não interferir no dead man's switch.
 */
import * as LocalAuthentication from 'expo-local-authentication';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { AppState, Platform } from 'react-native';
import { getSessionToken } from '@/lib/_core/auth';
import {
  attemptCooldownMs,
  INITIAL_ATTEMPT_STATE,
  registerFailedAttempt,
  shouldLockAfterBackground,
  type AttemptState,
} from '@/lib/app-lock-core';
import * as LockStorage from '@/lib/app-lock-storage';

export type AppLockStatus = 'loading' | 'unlocked' | 'locked';

export type UnlockResult = 'ok' | 'wrong' | 'cooldown';

interface AppLockValue {
  status: AppLockStatus;
  enabled: boolean;
  biometricEnabled: boolean;
  /** Hardware presente E biometria cadastrada no aparelho. */
  biometricAvailable: boolean;
  attempts: AttemptState;
  enableLock: (pin: string, useBiometric: boolean) => Promise<void>;
  /** Desativa e apaga o PIN. A verificação prévia (PIN/biometria) é da UI. */
  disableLock: () => Promise<void>;
  setBiometricEnabled: (value: boolean) => Promise<void>;
  unlockWithPin: (pin: string) => Promise<UnlockResult>;
  unlockWithBiometrics: () => Promise<boolean>;
}

const AppLockContext = createContext<AppLockValue | null>(null);

export function AppLockProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AppLockStatus>(
    Platform.OS === 'web' ? 'unlocked' : 'loading',
  );
  const [enabled, setEnabled] = useState(false);
  const [biometricEnabled, setBiometricEnabledState] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [attempts, setAttempts] = useState<AttemptState>(INITIAL_ATTEMPT_STATE);
  const backgroundedAtRef = useRef<number | null>(null);

  const refreshBiometricAvailability = useCallback(async () => {
    if (Platform.OS === 'web') return;
    try {
      const [hasHardware, isEnrolled] = await Promise.all([
        LocalAuthentication.hasHardwareAsync(),
        LocalAuthentication.isEnrolledAsync(),
      ]);
      setBiometricAvailable(hasHardware && isEnrolled);
    } catch {
      setBiometricAvailable(false);
    }
  }, []);

  /** Bloqueio só vale com flag no SecureStore E sessão ativa. */
  const shouldEnforceLock = useCallback(async (): Promise<boolean> => {
    if (Platform.OS === 'web') return false;
    const lockEnabled = await LockStorage.isLockEnabled();
    if (!lockEnabled) {
      setEnabled(false);
      return false;
    }
    const token = await getSessionToken();
    return token != null;
  }, []);

  // Cold start: decide travado/destravado antes de liberar o conteúdo
  // (o AppLockGate cobre a tela enquanto status === 'loading').
  useEffect(() => {
    if (Platform.OS === 'web') return;
    let cancelled = false;
    (async () => {
      const [lockEnabled, biometricPref, storedAttempts] = await Promise.all([
        LockStorage.isLockEnabled(),
        LockStorage.isBiometricPreferred(),
        LockStorage.loadAttemptState(),
      ]);
      // Só trava com sessão ativa: sem login não há dado de saúde exposto.
      const enforce = lockEnabled && (await getSessionToken()) != null;
      if (cancelled) return;
      setEnabled(lockEnabled);
      setBiometricEnabledState(biometricPref);
      setAttempts(storedAttempts);
      setStatus(enforce ? 'locked' : 'unlocked');
    })();
    refreshBiometricAvailability();
    return () => {
      cancelled = true;
    };
  }, [refreshBiometricAvailability]);

  // Trava ao voltar do background depois da carência. A carência evita
  // re-travar no fluxo SOS → WhatsApp → voltar e em trocas rápidas de app.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'background') {
        if (backgroundedAtRef.current == null) {
          backgroundedAtRef.current = Date.now();
        }
        return;
      }
      if (next !== 'active') return;
      const backgroundedAt = backgroundedAtRef.current;
      backgroundedAtRef.current = null;
      refreshBiometricAvailability();
      if (!shouldLockAfterBackground(backgroundedAt, Date.now())) return;
      (async () => {
        if (!(await shouldEnforceLock())) return;
        const storedAttempts = await LockStorage.loadAttemptState();
        setAttempts(storedAttempts);
        setStatus('locked');
      })();
    });
    return () => subscription.remove();
  }, [shouldEnforceLock, refreshBiometricAvailability]);

  // Logout limpa o SecureStore por fora do contexto (hooks/use-auth.ts);
  // sincroniza o estado em memória para o toggle não ficar "fantasma".
  useEffect(() => {
    return LockStorage.onAppLockCleared(() => {
      setEnabled(false);
      setBiometricEnabledState(false);
      setAttempts(INITIAL_ATTEMPT_STATE);
      setStatus('unlocked');
    });
  }, []);

  const enableLock = useCallback(async (pin: string, useBiometric: boolean) => {
    await LockStorage.saveLock(pin, useBiometric);
    setEnabled(true);
    setBiometricEnabledState(useBiometric);
    setAttempts(INITIAL_ATTEMPT_STATE);
    setStatus('unlocked');
  }, []);

  const disableLock = useCallback(async () => {
    // clearAppLockStorage notifica onAppLockCleared, que reseta o estado.
    await LockStorage.clearAppLockStorage();
  }, []);

  const setBiometricEnabled = useCallback(async (value: boolean) => {
    await LockStorage.setBiometricPreferred(value);
    setBiometricEnabledState(value);
  }, []);

  const unlockWithPin = useCallback(async (pin: string): Promise<UnlockResult> => {
    const now = Date.now();
    const currentAttempts = await LockStorage.loadAttemptState();
    if (attemptCooldownMs(currentAttempts, now) > 0) {
      setAttempts(currentAttempts);
      return 'cooldown';
    }
    if (await LockStorage.verifyPin(pin)) {
      setAttempts(INITIAL_ATTEMPT_STATE);
      await LockStorage.saveAttemptState(INITIAL_ATTEMPT_STATE);
      setStatus('unlocked');
      return 'ok';
    }
    const nextAttempts = registerFailedAttempt(currentAttempts, now);
    setAttempts(nextAttempts);
    await LockStorage.saveAttemptState(nextAttempts);
    return 'wrong';
  }, []);

  const unlockWithBiometrics = useCallback(async (): Promise<boolean> => {
    if (Platform.OS === 'web') return false;
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Desbloqueie o Vigora',
        cancelLabel: 'Usar PIN',
        // O fallback é o PIN do próprio app, não a senha do aparelho.
        disableDeviceFallback: true,
      });
      if (!result.success) return false;
      setAttempts(INITIAL_ATTEMPT_STATE);
      await LockStorage.saveAttemptState(INITIAL_ATTEMPT_STATE);
      setStatus('unlocked');
      return true;
    } catch {
      return false;
    }
  }, []);

  const value: AppLockValue = {
    status,
    enabled,
    biometricEnabled,
    biometricAvailable,
    attempts,
    enableLock,
    disableLock,
    setBiometricEnabled,
    unlockWithPin,
    unlockWithBiometrics,
  };

  return <AppLockContext.Provider value={value}>{children}</AppLockContext.Provider>;
}

export function useAppLock(): AppLockValue {
  const ctx = useContext(AppLockContext);
  if (!ctx) throw new Error('useAppLock must be used within AppLockProvider');
  return ctx;
}
