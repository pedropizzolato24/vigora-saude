/**
 * device-id.ts
 *
 * Generates and persists a stable UUID for this device.
 * Used to identify the device in the server-side monitoring system.
 * Stored in SecureStore so it survives app updates but not device wipes.
 */
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const DEVICE_ID_KEY = "vigora_device_id";

function generateUUID(): string {
  // Simple UUID v4 generator
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

let cachedDeviceId: string | null = null;

/**
 * Get or create a stable device ID.
 * Uses SecureStore on native, AsyncStorage on web.
 */
/**
 * Alias for getDeviceId() - used by supabase-sync.ts per Passo 2.3.
 */
export async function getOrCreateDeviceId(): Promise<string> {
  return getDeviceId();
}

export async function getDeviceId(): Promise<string> {
  if (cachedDeviceId) return cachedDeviceId;

  try {
    if (Platform.OS === "web") {
      const stored = await AsyncStorage.getItem(DEVICE_ID_KEY);
      if (stored) {
        cachedDeviceId = stored;
        return stored;
      }
      const newId = generateUUID();
      await AsyncStorage.setItem(DEVICE_ID_KEY, newId);
      cachedDeviceId = newId;
      return newId;
    } else {
      const stored = await SecureStore.getItemAsync(DEVICE_ID_KEY);
      if (stored) {
        cachedDeviceId = stored;
        return stored;
      }
      const newId = generateUUID();
      await SecureStore.setItemAsync(DEVICE_ID_KEY, newId);
      cachedDeviceId = newId;
      return newId;
    }
  } catch (error) {
    console.warn("[DeviceId] Failed to persist device ID:", error);
    // Fallback: use in-memory ID (won't survive restarts)
    if (!cachedDeviceId) {
      cachedDeviceId = generateUUID();
    }
    return cachedDeviceId;
  }
}
