import React, { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useUserMode } from '@/lib/user-mode-context';

const ONBOARDING_KEY = 'vigora_onboarding_completed';

/**
 * Controla o fluxo de entrada do app:
 * 1. Primeiro acesso → onboarding
 * 2. Sem modo salvo → seleção de modo (monitorado ou cuidador)
 * 3. Modo 'caregiver' → app de cuidadores
 * 4. Modo 'monitored' → app principal (já é o comportamento padrão)
 */
export function OnboardingGate() {
  const router = useRouter();
  const { mode, isLoadingMode } = useUserMode();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (checked) return;
    if (isLoadingMode) return; // aguarda o modo carregar do AsyncStorage

    (async () => {
      try {
        const onboardingDone = await AsyncStorage.getItem(ONBOARDING_KEY);

        if (!onboardingDone) {
          // Primeiro acesso — mostrar onboarding
          router.replace('/onboarding?firstLaunch=true');
          return;
        }

        if (!mode) {
          // Onboarding feito, mas modo ainda não escolhido
          router.replace('/mode-select');
          return;
        }

        if (mode === 'caregiver') {
          // Usuário é cuidador — redirecionar para o app de cuidadores
          router.replace('/(caregiver)/');
          return;
        }

        // mode === 'monitored' — o app abre normalmente em (tabs)
      } catch {
        // Falha silenciosa — permanece na tela padrão
      } finally {
        setChecked(true);
      }
    })();
  }, [checked, isLoadingMode, mode, router]);

  return null;
}
