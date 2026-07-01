import React, { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Auth from '@/lib/_core/auth';
import { setPendingInvite } from '@/lib/pending-invite';
import { hasCompletedCaregiverOnboarding } from '@/lib/caregiver-onboarding-flag';

const ONBOARDING_KEY = 'vigora_onboarding_completed';
const LOGIN_COMPLETED_KEY = 'vigora_login_completed';

/**
 * Runs once at app startup to enforce the onboarding → login → register funnel.
 *
 * Decision table (checked in parallel for performance):
 *   onboarding not done                          → /onboarding (first time)
 *   onboarding done, never logged in before      → /onboarding (so user sees slides → login)
 *   onboarding done, logged in before, no user   → /login (returning user, session gone)
 *   authenticated but userType is null           → /register (registration incomplete)
 *   authenticated, userType 'caregiver', onboarding flag absent → /caregiver-onboarding
 *   authenticated, userType 'caregiver', onboarding flag present → /(caregiver-tabs)
 *   authenticated, userType 'monitored'         → stay on /(tabs)
 */
export function OnboardingGate() {
  const router = useRouter();
  const pathname = usePathname();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (checked) return;

    // A deep-linked invite (/convite/[token]) and the Google OAuth callback
    // (/oauthredirect) own their own routing — don't let the startup funnel
    // clobber them. Each screen handles auth/navigation itself.
    if (
      pathname?.startsWith('/convite') ||
      pathname?.startsWith('/oauthredirect')
    ) {
      setChecked(true);
      return;
    }

    (async () => {
      try {
        // Cold-start robustness: if the app was opened via an invite link, stash
        // the token now so it survives the funnel even if pathname hasn't
        // resolved to /convite yet and we redirect to /login below.
        try {
          const initialUrl = await Linking.getInitialURL();
          const match = initialUrl?.match(/\/convite\/([^/?#]+)/);
          if (match?.[1]) await setPendingInvite(decodeURIComponent(match[1]));
          // Cold-start via Google OAuth redirect: let app/oauthredirect.tsx own
          // the navigation (pathname may still be '/' before the link resolves).
          if (initialUrl?.includes('oauthredirect')) {
            setChecked(true);
            return;
          }
        } catch {
          // best-effort
        }

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
          return;
        }

        if (!user.userType) {
          // Logged in but never finished the registration form
          router.replace('/register');
          return;
        }

        if (user.userType === 'caregiver') {
          const caregiverOnboardingDone = await hasCompletedCaregiverOnboarding(user.openId);
          router.replace(caregiverOnboardingDone ? '/(caregiver-tabs)' : '/caregiver-onboarding');
          return;
        }

        // userType === 'monitored' falls through: stays on /(tabs) (the gate
        // is mounted there, so no replace needed).
      } catch {
        // On error, don't block app startup
      } finally {
        setChecked(true);
      }
    })();
  }, [checked, router, pathname]);

  return null;
}
