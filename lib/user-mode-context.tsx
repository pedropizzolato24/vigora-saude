/**
 * lib/user-mode-context.tsx
 *
 * Controla o modo de uso do app: 'monitored' (usuário que é monitorado)
 * ou 'caregiver' (cuidador que recebe alertas).
 *
 * O modo é persistido no AsyncStorage. Futuramente será derivado do perfil
 * de autenticação do usuário.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

export type UserMode = 'monitored' | 'caregiver' | null;

const MODE_KEY = 'vigora_user_mode';

interface UserModeContextValue {
  mode: UserMode;
  isLoadingMode: boolean;
  setMode: (mode: UserMode) => Promise<void>;
  clearMode: () => Promise<void>;
}

const UserModeContext = createContext<UserModeContextValue | null>(null);

export function UserModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<UserMode>(null);
  const [isLoadingMode, setIsLoadingMode] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(MODE_KEY);
        if (stored === 'monitored' || stored === 'caregiver') {
          setModeState(stored);
        }
      } catch {
        // Falha silenciosa — modo null mantém a tela de seleção
      } finally {
        setIsLoadingMode(false);
      }
    })();
  }, []);

  const setMode = useCallback(async (newMode: UserMode) => {
    setModeState(newMode);
    if (newMode) {
      await AsyncStorage.setItem(MODE_KEY, newMode);
    }
  }, []);

  const clearMode = useCallback(async () => {
    setModeState(null);
    await AsyncStorage.removeItem(MODE_KEY);
  }, []);

  return (
    <UserModeContext.Provider value={{ mode, isLoadingMode, setMode, clearMode }}>
      {children}
    </UserModeContext.Provider>
  );
}

export function useUserMode(): UserModeContextValue {
  const ctx = useContext(UserModeContext);
  if (!ctx) throw new Error('useUserMode must be used within UserModeProvider');
  return ctx;
}
