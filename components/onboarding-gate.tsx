import React, { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Auth from '@/lib/_core/auth';

const ONBOARDING_KEY = 'vigora_onboarding_completed';

/**
 * Runs once at app startup to enforce the onboarding → login funnel.
 * - First launch: redirect to /onboarding
 * - Onboarded but not authenticated: redirect to /login
 * - Both done: stay on current route (tabs)
 */
export function OnboardingGate() {
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (checked) return;

    (async () => {
      try {
        const onboardingDone = await AsyncStorage.getItem(ONBOARDING_KEY);
        if (!onboardingDone) {
          router.replace('/onboarding?firstLaunch=true');
          return;
        }

        const user = await Auth.getUserInfo();
        if (!user) {
          router.replace('/login');
        }
      } catch {
        // On error, let the user through — don't block app startup
      } finally {
        setChecked(true);
      }
    })();
  }, [checked, router]);

  return null;
}
