import React, { useEffect, useState } from 'react';
import { useRouter, useSegments } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ONBOARDING_KEY = 'vigora_onboarding_completed';

/**
 * Component that checks if onboarding has been completed.
 * If not, redirects to the onboarding screen on first launch.
 * Place inside the navigation tree (after Stack is mounted).
 */
export function OnboardingGate() {
  const router = useRouter();
  const segments = useSegments();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (checked) return;

    (async () => {
      try {
        const completed = await AsyncStorage.getItem(ONBOARDING_KEY);
        if (!completed) {
          // First launch — show onboarding with firstLaunch flag to hide skip button
          router.replace('/onboarding?firstLaunch=true');
        }
      } catch {
        // If error reading, skip onboarding
      } finally {
        setChecked(true);
      }
    })();
  }, [checked, router]);

  return null;
}
