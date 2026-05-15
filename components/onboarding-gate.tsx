import React, { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Auth from '@/lib/_core/auth';

const ONBOARDING_KEY = 'vigora_onboarding_completed';
const LOGIN_COMPLETED_KEY = 'vigora_login_completed';

/**
 * Runs once at app startup to enforce the onboarding → login funnel.
 *
 * Decision table (checked in parallel for performance):
 *   onboarding not done                        → /onboarding (first time)
 *   onboarding done, never logged in before    → /onboarding (so user sees slides → login)
 *   onboarding done, logged in before, no user → /login (returning user, session gone)
 *   authenticated                              → stay on tabs
 */
export function OnboardingGate() {
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (checked) return;

    (async () => {
      try {
        const [onboardingDone, loginCompleted, user] = await Promise.all([
          AsyncStorage.getItem(ONBOARDING_KEY),
          AsyncStorage.getItem(LOGIN_COMPLETED_KEY),
          Auth.getUserInfo(),
        ]);

        if (!onboardingDone || (!loginCompleted && !user)) {
          // Never done onboarding OR never logged in → full funnel: slides → login
          router.replace('/onboarding?firstLaunch=true');
          return;
        }

        if (!user) {
          // Has logged in before but session is gone → skip slides, go straight to login
          router.replace('/login');
        }
      } catch {
        // On error, don't block app startup
      } finally {
        setChecked(true);
      }
    })();
  }, [checked, router]);

  return null;
}
