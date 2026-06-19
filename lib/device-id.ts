/**
 * device-id.ts
 *
 * Generates and persists a stable UUID for this device.
 * Used to identify the device in the server-side monitoring system.
 * Stored in SecureStore so it survives app updates but not device wipes.
 *
 * SECURITY: We use expo-crypto.randomUUID (CSPRNG-backed) instead of
 * Math.random. The old generator could be brute-forced; combined with
 * the previous public monitoring router (Fix #1), that would let an
 * attacker enumerate deviceIds and read other users' contacts.
 */
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const DEVICE_ID_KEY = "vigora_device_id";

export function generateUUID(): string {
  // expo-crypto.randomUUID is backed by SecRandomCopyBytes (iOS) /
  // SecureRandom (Android) / crypto.getRandomValues (web). RFC 4122 v4.
  return Crypto.randomUUID();
}

let cachedDeviceId: string | null = null;

/**
 * Get or create a stable device ID.
 * Uses SecureStore on native, AsyncStorage on web.
 */
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
