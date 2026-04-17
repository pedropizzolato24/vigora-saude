import * as Notifications from 'expo-notifications';
import React, { createContext, useContext, useEffect, useRef } from 'react';
import { Platform } from 'react-native';

// Configure how notifications appear when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

interface NotificationsContextValue {
  sendNotification: (
    title: string,
    body: string,
    data?: Record<string, unknown>
  ) => Promise<void>;
  scheduleNotification: (
    title: string,
    body: string,
    secondsFromNow: number,
    data?: Record<string, unknown>
  ) => Promise<string | null>;
  requestPermissions: () => Promise<boolean>;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const notificationListener = useRef<Notifications.EventSubscription | null>(null);
  const responseListener = useRef<Notifications.EventSubscription | null>(null);

  useEffect(() => {
    // Set up Android notification channels
    if (Platform.OS === 'android') {
      Notifications.setNotificationChannelAsync('sos', {
        name: 'Emergência SOS',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 500, 200, 500, 200, 500],
        lightColor: '#FF0000',
        sound: 'default',
      });
      Notifications.setNotificationChannelAsync('alarm', {
        name: 'Alarmes',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        sound: 'default',
      });
      Notifications.setNotificationChannelAsync('default', {
        name: 'Padrão',
        importance: Notifications.AndroidImportance.DEFAULT,
        sound: 'default',
      });
    }

    // Request permissions on mount
    requestPermissions();

    notificationListener.current = Notifications.addNotificationReceivedListener(() => {
      // Handle received notification
    });

    responseListener.current = Notifications.addNotificationResponseReceivedListener(() => {
      // Handle notification tap
    });

    return () => {
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, []);

  const requestPermissions = async (): Promise<boolean> => {
    if (Platform.OS === 'web') return false;
    const { status: existing } = await Notifications.getPermissionsAsync();
    if (existing === 'granted') return true;
    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  };

  const sendNotification = async (
    title: string,
    body: string,
    data: Record<string, unknown> = {}
  ): Promise<void> => {
    if (Platform.OS === 'web') return;
    const channelId = data.type === 'sos' ? 'sos' : data.type === 'alarm' ? 'alarm' : 'default';
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data,
        sound: 'default',
        ...(Platform.OS === 'android' ? { channelId } : {}),
      },
      trigger: null, // immediate
    });
  };

  const scheduleNotification = async (
    title: string,
    body: string,
    secondsFromNow: number,
    data: Record<string, unknown> = {}
  ): Promise<string | null> => {
    if (Platform.OS === 'web') return null;
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data,
        sound: 'default',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: secondsFromNow,
      },
    });
    return id;
  };

  return (
    <NotificationsContext.Provider
      value={{ sendNotification, scheduleNotification, requestPermissions }}
    >
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications(): NotificationsContextValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationsProvider');
  return ctx;
}
