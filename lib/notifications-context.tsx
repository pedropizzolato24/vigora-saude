import * as Notifications from 'expo-notifications';
import React, { createContext, useContext } from 'react';
import { Platform } from 'react-native';

/**
 * Notifications context — provides helper methods for sending notifications.
 *
 * IMPORTANT: The global setNotificationHandler and channel setup are handled
 * exclusively in notifications-utils.ts (called from _layout.tsx on startup).
 * Do NOT duplicate them here to avoid conflicts.
 */

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
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data,
        sound: 'default',
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
