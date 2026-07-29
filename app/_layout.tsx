import "@/global.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "react-native-reanimated";
import { Platform } from "react-native";
import { useFonts } from "expo-font";
import "@/lib/_core/nativewind-pressable";
import { ThemeProvider } from "@/lib/theme-provider";
import { AppProvider, useAppContext } from "@/lib/app-context";
import { CaregiverProvider } from "@/lib/caregiver-context";
import { NotificationsProvider } from "@/lib/notifications-context";
import { FontSizeProvider } from '@/lib/font-size-context';
import { AccessibilityProvider } from '@/lib/accessibility-context';
import { AppLockProvider } from '@/lib/app-lock-context';
import { AppLockGate } from '@/components/app-lock-gate';
import { UpdateBanner } from '@/components/update-banner';
import { syncAlarmsOnStartup } from "@/lib/alarm-sync";
import { setupNotificationChannels, requestNotificationPermissions } from "@/lib/notifications-utils";
import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import * as SplashScreen from 'expo-splash-screen';
import { useRouter } from 'expo-router';
import { AlarmSyncInitializer } from "@/components/alarm-sync-initializer";
import { AlarmNotificationHandler } from '@/components/alarm-notification-handler';
import { MonitoringInitializer } from '@/components/monitoring-initializer';
import { CheckinInitializer } from '@/components/checkin-initializer';
import { OnboardingGate } from '@/components/onboarding-gate';
import { refreshSessionOnStartup } from "@/lib/session-refresh";
import { subscribeSessionExpired } from "@/lib/_core/auth";
import {
  SafeAreaFrameContext,
  SafeAreaInsetsContext,
  SafeAreaProvider,
  initialWindowMetrics,
} from "react-native-safe-area-context";
import type { EdgeInsets, Rect } from "react-native-safe-area-context";

import { trpc, createTRPCClient } from "@/lib/trpc";
import { perfMark } from "@/lib/_core/perf";
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

  const [fontsLoaded] = useFonts({
    'Fraunces-Italic': require('../assets/fonts/Fraunces-Variable.ttf'),
    'PlusJakartaSans': require('../assets/fonts/PlusJakartaSans-Variable.ttf'),
    'SpaceMono-Regular': require('../assets/fonts/SpaceMono-Regular.ttf'),
    'SpaceMono-Bold': require('../assets/fonts/SpaceMono-Bold.ttf'),
  });

  // Diagnóstico do splash longo (item 2 do feedback 27/07): quanto do tempo até
  // a primeira tela é fonte, quanto é provider, quanto é rede.
  useEffect(() => {
    perfMark('RootLayout: primeiro render');
    // Só agora libera o splash nativo (segurado em index.ts): até este ponto o
    // que apareceria é o windowBackground preto do AppTheme.
    SplashScreen.hideAsync().catch(() => {});
  }, []);
  useEffect(() => {
    if (fontsLoaded) perfMark('fontes carregadas');
  }, [fontsLoaded]);

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

  // Sliding session + expired-session guard. Refresh the token on startup so an
  // actively-used device never logs out — a dead session silently disarms the
  // dead man's switch (heartbeat/sync/events all 401). If the server rejects
  // the session (token expired / user deleted), route the user back to login.
  useEffect(() => {
    refreshSessionOnStartup();
    const unsubscribe = subscribeSessionExpired(() => {
      const { router } = require('expo-router');
      router.replace('/login');
    });
    return unsubscribe;
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
            // O tap (e o full-screen) da notificação já entram por deep link
            // (vigora://alarm-ring → +native-intent) e montam a tela com o
            // timer ancorado no disparo REAL. Navegar DE NOVO aqui empilhava
            // uma segunda alarm-ring por cima da certa, com timer zerado em
            // 30s — e a de baixo, nunca respondida, expirava e escalava
            // sozinha. Este caminho fica só para o launch pelo ÍCONE com
            // alarme ativo. (Antes o bug não aparecia porque a tela matava o
            // som nativo na montagem, zerando o getAlarmState daqui.)
            const initialUrl = await Linking.getInitialURL().catch(() => null);
            if (initialUrl?.includes('alarm-ring')) return;

            const { getAlarmState } = require('expo-alarm-module');
            // ponytail: o módulo nativo pode não responder no instante 0 do cold
            // start; tenta algumas vezes antes de desistir (feedback do beta: abrir
            // o app com alarme tocando não levava à tela do alarme).
            let activeUid: string | null = null;
            for (let i = 0; i < 5; i++) {
              activeUid = await getAlarmState();
              if (activeUid && typeof activeUid === 'string') break;
              await new Promise(resolve => setTimeout(resolve, 300));
            }
            if (activeUid && typeof activeUid === 'string') {
              // activeUid is like "vigora_<alarmId>" - extract the alarmId
              // Native UIDs: "vigora_<alarmId>" or "vigora_<alarmId>_wd<0-6>"
              const match = activeUid.match(/^vigora_(.+?)(?:_wd\d+|_snooze)?$/);
              const alarmId = match ? match[1] : null;
              if (alarmId) {
                console.log(`[RootLayout] Native alarm active: ${activeUid} -> alarmId: ${alarmId}`);
                const { router } = require('expo-router');
                // Sem expiresAt e sem criar timer aqui: o initTimer da tela
                // ancora no horário real do disparo (timer persistido ou
                // lastAlarmFireMs). Criar um timer novo aqui zerava a contagem.
                router.push(`/alarm-ring?alarmId=${alarmId}`);
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

          // Check-in notification cold-start
          if (notifType === 'checkin_prompt') {
            // Confirma o check-in (deduplicado) e navega. O dedup evita navegação
            // dupla quando o response listener do CheckinInitializer também
            // processa o mesmo toque de cold start.
            const { handleCheckinPromptResponse } = require('@/lib/checkin-notification-handler');
            const ct = (data?.checkinTime as string | undefined) ?? '09:00';
            const wm = (data?.windowMinutes as number | undefined) ?? 30;
            const identifier = response.notification.request.identifier;
            const handled = await handleCheckinPromptResponse(ct, wm, identifier);
            if (handled) {
              const { router: navRouter } = require('expo-router');
              navRouter.push('/checkin-response');
            }
            Notifications.clearLastNotificationResponseAsync();
            return;
          }
          if (notifType === 'checkin_timeout') {
            // Timeout cold-start: escalona (deduplicado) e navega para confirmação.
            // O dedup por identifier evita escalonamento duplo quando o response
            // listener do CheckinInitializer também processa o mesmo toque.
            const { handleCheckinTimeout } = require('@/lib/checkin-notification-handler');
            const { loadCurrentAppStateRaw } = require('@/lib/app-state-storage');
            let handled = false;
            try {
              const raw = await loadCurrentAppStateRaw();
              const parsed = raw ? JSON.parse(raw) : null;
              const contacts = parsed?.emergencyContacts ?? [];
              const ct = (data?.checkinTime as string | undefined) ?? '09:00';
              const wm = (data?.windowMinutes as number | undefined) ?? 30;
              const identifier = response.notification.request.identifier;
              handled = await handleCheckinTimeout(ct, wm, contacts, identifier);
            } catch {}
            if (handled) {
              const { router: navRouter } = require('expo-router');
              navRouter.push('/checkin-response');
            }
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
          <OnboardingGate />
          <FontSizeProvider>
          <AccessibilityProvider>
          <AppLockProvider>
          {/* Precisa do AccessibilityProvider: renderiza AppDialog (resultado
              da escalação) — fora dele o useAccessibility lança erro. */}
          <AlarmNotificationHandler />
          <MonitoringInitializer />
          <CheckinInitializer />
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
            <Stack.Screen name="app-lock-setup" />
            <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
            <Stack.Screen name="login" options={{ gestureEnabled: false }} />
            <Stack.Screen name="email-login" />
            <Stack.Screen name="phone-login" />
            <Stack.Screen name="register" options={{ gestureEnabled: false }} />
            <Stack.Screen name="(caregiver-tabs)" />
            <Stack.Screen name="caregiver-onboarding" options={{ gestureEnabled: false }} />
            <Stack.Screen name="convite/[token]" options={{ gestureEnabled: false }} />
            <Stack.Screen name="oauthredirect" options={{ gestureEnabled: false }} />
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
          {/* Aviso de versão nova na loja — antes do AppLockGate para a tela
              de bloqueio cobrir o aviso quando o app estiver travado. */}
          <UpdateBanner />
          {/* Overlay de bloqueio: precisa ficar depois do Stack para cobrir o
              conteúdo, e dentro dos providers de tema/fonte/acessibilidade. */}
          <AppLockGate />
        </QueryClientProvider>
      </trpc.Provider>
          </AppLockProvider>
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
