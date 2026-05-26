import "@/global.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "react-native-reanimated";
import { Platform } from "react-native";
import "@/lib/_core/nativewind-pressable";
import { ThemeProvider } from "@/lib/theme-provider";
import { AppProvider, useAppContext } from "@/lib/app-context";
import { CaregiverProvider } from "@/lib/caregiver-context";
import { NotificationsProvider } from "@/lib/notifications-context";
import { MenuProvider } from '@/lib/menu-context';
import { FontSizeProvider } from '@/lib/font-size-context';
import { AccessibilityProvider } from '@/lib/accessibility-context';
import { syncAlarmsOnStartup } from "@/lib/alarm-sync";
import { setupNotificationChannels, requestNotificationPermissions } from "@/lib/notifications-utils";
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { AlarmSyncInitializer } from "@/components/alarm-sync-initializer";
import { AlarmNotificationHandler } from '@/components/alarm-notification-handler';
import { MonitoringInitializer } from '@/components/monitoring-initializer';
import { CheckinInitializer } from '@/components/checkin-initializer';
import { OnboardingGate } from '@/components/onboarding-gate';
import {
  SafeAreaFrameContext,
  SafeAreaInsetsContext,
  SafeAreaProvider,
  initialWindowMetrics,
} from "react-native-safe-area-context";
import type { EdgeInsets, Rect } from "react-native-safe-area-context";

import { trpc, createTRPCClient } from "@/lib/trpc";
import { initializePurchases } from "@/lib/purchases";
import { PurchasesProvider } from "@/context/purchases-context";

const DEFAULT_WEB_INSETS: EdgeInsets = { top: 0, right: 0, bottom: 0, left: 0 };
const DEFAULT_WEB_FRAME: Rect = { x: 0, y: 0, width: 0, height: 0 };

export const unstable_settings = {
  anchor: "(tabs)",
};

export default function RootLayout() {
  const initialInsets = initialWindowMetrics?.insets ?? DEFAULT_WEB_INSETS;
  const initialFrame = initialWindowMetrics?.frame ?? DEFAULT_WEB_FRAME;

  const [insets] = useState<EdgeInsets>(initialInsets);
  const [frame] = useState<Rect>(initialFrame);

  // Initialize RevenueCat SDK on app startup
  useEffect(() => {
    initializePurchases();
  }, []);

  // Set up notification channels and request permissions on startup
  useEffect(() => {
    const init = async () => {
      await setupNotificationChannels();
      await requestNotificationPermissions();
    };
    init();
  }, []);

  // Handle notification that launched the app (app was closed/killed)
  // This catches the case where the user taps a notification when the app is not running.
  //
  // Two strategies:
  // 1. Android: expo-alarm-module fires the alarm natively. When the user taps the
  //    notification, the MainActivity opens with ALARM_UID in the Intent. We detect
  //    this by calling getAlarmState() which returns the active alarm UID.
  // 2. iOS/Web: expo-notifications fires the alarm. We read the last notification
  //    response to get the alarmId.
  useEffect(() => {
    if (Platform.OS === 'web') return;

    const checkInitialAlarm = async () => {
      // Minimal delay to ensure router and providers are mounted
      // 100ms is sufficient - the router is ready well before this point
      await new Promise(resolve => setTimeout(resolve, 100));

      try {
        // Strategy 1: Android native alarm (expo-alarm-module)
        if (Platform.OS === 'android') {
          try {
            const { getAlarmState } = require('expo-alarm-module');
            const activeUid = await getAlarmState();
            if (activeUid && typeof activeUid === 'string') {
              // activeUid is like "vigora_<alarmId>" - extract the alarmId
              // Native UIDs: "vigora_<alarmId>" or "vigora_<alarmId>_wd<0-6>"
              const match = activeUid.match(/^vigora_(.+?)(?:_wd\d+)?$/);
              const alarmId = match ? match[1] : null;
              if (alarmId) {
                console.log(`[RootLayout] Native alarm active: ${activeUid} -> alarmId: ${alarmId}`);
                const { router } = require('expo-router');
                const { loadAlarmTimer, saveAlarmTimer } = require('@/lib/alarm-timer-store');
                const AsyncStorageMod = require('@react-native-async-storage/async-storage').default;

                // Try to load persisted timer first
                let expiresAtForNav: number | null = null;
                try {
                  const timerEntry = await loadAlarmTimer(alarmId);
                  if (timerEntry && timerEntry.expiresAt > Date.now()) {
                    expiresAtForNav = timerEntry.expiresAt;
                  }
                } catch {}

                // If no valid timer exists, create one now from stored timerDuration
                if (!expiresAtForNav) {
                  try {
                    let timerDuration = 30;
                    const raw = await AsyncStorageMod.getItem('vigora_app_state');
                    if (raw) {
                      const parsed = JSON.parse(raw);
                      const stored = parsed?.settings?.timerDuration;
                      if (typeof stored === 'number' && [15, 30, 45, 60].includes(stored)) {
                        timerDuration = stored;
                      }
                    }
                    const startedAt = Date.now();
                    expiresAtForNav = startedAt + timerDuration * 1000;
                    await saveAlarmTimer({ alarmId, startedAt, expiresAt: expiresAtForNav, timerDuration });
                    console.log(`[RootLayout] Created new timer for cold start: ${timerDuration}s`);
                  } catch {}
                }

                const navUrl = expiresAtForNav
                  ? `/alarm-ring?alarmId=${alarmId}&expiresAt=${expiresAtForNav}`
                  : `/alarm-ring?alarmId=${alarmId}`;
                router.push(navUrl);
                return;
              }
            }
          } catch (e) {
            console.warn('[RootLayout] getAlarmState failed:', e);
          }
        }

        // Strategy 2: iOS/Web - expo-notifications last response
        const response = await Notifications.getLastNotificationResponseAsync();
        if (response) {
          const data = response.notification.request.content.data;
          const alarmId = data?.alarmId as string | undefined;
          const notifType = data?.type as string | undefined;

          // Check-in notification cold-start: navigate to response screen
          if (notifType === 'checkin_prompt' || notifType === 'checkin_timeout') {
            const { router: navRouter } = require('expo-router');
            navRouter.push('/checkin-response');
            Notifications.clearLastNotificationResponseAsync();
            return;
          }

          if (alarmId) {
            const { router } = require('expo-router');
            router.push(`/alarm-ring?alarmId=${alarmId}`);
            Notifications.clearLastNotificationResponseAsync();
          }
        }
      } catch (e) {
        console.warn('[RootLayout] Could not navigate to alarm-ring:', e);
      }
    };

    checkInitialAlarm();
  }, []);

  // Create clients once and reuse them
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Disable automatic refetching on window focus for mobile
            refetchOnWindowFocus: false,
            // Retry failed requests once
            retry: 1,
          },
        },
      }),
  );
  const [trpcClient] = useState(() => createTRPCClient());

  // Ensure minimum 8px padding for top and bottom on mobile
  const providerInitialMetrics = useMemo(() => {
    const metrics = initialWindowMetrics ?? { insets: initialInsets, frame: initialFrame };
    return {
      ...metrics,
      insets: {
        ...metrics.insets,
        top: Math.max(metrics.insets.top, 16),
        bottom: Math.max(metrics.insets.bottom, 12),
      },
    };
  }, [initialInsets, initialFrame]);

  const content = (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <PurchasesProvider>
      <NotificationsProvider>
        <CaregiverProvider>
        <AppProvider>
          <AlarmSyncInitializer />
          <AlarmNotificationHandler />
          <OnboardingGate />
          <FontSizeProvider>
          <AccessibilityProvider>
          <MonitoringInitializer />
          <CheckinInitializer />
          <MenuProvider>
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>
          {/* Default to hiding native headers so raw route segments don't appear (e.g. "(tabs)", "products/[id]"). */}
          {/* If a screen needs the native header, explicitly enable it and set a human title via Stack.Screen options. */}
          {/* in order for ios apps tab switching to work properly, use presentation: "fullScreenModal" for login page, whenever you decide to use presentation: "modal*/}
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen
              name="alarm-ring"
              options={{
                presentation: 'fullScreenModal',
                gestureEnabled: false,
                animation: 'fade',
              }}
            />
            <Stack.Screen
              name="checkin-response"
              options={{
                presentation: 'fullScreenModal',
                gestureEnabled: false,
                animation: 'fade',
              }}
            />
            <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
            <Stack.Screen name="login" options={{ gestureEnabled: false }} />
            <Stack.Screen name="register" options={{ gestureEnabled: false }} />
            <Stack.Screen name="(caregiver-tabs)" />
            <Stack.Screen name="caregiver-onboarding" options={{ gestureEnabled: false }} />
            <Stack.Screen name="oauth/callback" />
            <Stack.Screen
              name="(modal)/paywall"
              options={{
                presentation: 'modal',
                animation: 'slide_from_bottom',
              }}
            />
            <Stack.Screen
              name="(modal)/customer-center"
              options={{
                presentation: 'transparentModal',
                animation: 'fade',
              }}
            />
          </Stack>
          <StatusBar style="auto" />
        </QueryClientProvider>
      </trpc.Provider>
          </MenuProvider>
          </AccessibilityProvider>
          </FontSizeProvider>
        </AppProvider>
        </CaregiverProvider>
      </NotificationsProvider>
      </PurchasesProvider>
    </GestureHandlerRootView>
  );

  const shouldOverrideSafeArea = Platform.OS === "web";

  if (shouldOverrideSafeArea) {
    return (
      <ThemeProvider>
        <SafeAreaProvider initialMetrics={providerInitialMetrics}>
          <SafeAreaFrameContext.Provider value={frame}>
            <SafeAreaInsetsContext.Provider value={insets}>
              {content}
            </SafeAreaInsetsContext.Provider>
          </SafeAreaFrameContext.Provider>
        </SafeAreaProvider>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <SafeAreaProvider initialMetrics={providerInitialMetrics}>{content}</SafeAreaProvider>
    </ThemeProvider>
  );
}
