/**
 * lib/push-token.ts
 *
 * Client-side helper to obtain the Expo push token and register it with the backend.
 * Call `registerPushToken(deviceId)` once after the user grants notification permission.
 */
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import Constants from "expo-constants";

/**
 * Returns the Expo push token for this device, or null if unavailable
 * (physical device required; simulators/web return null).
 */
export async function getExpoPushToken(): Promise<string | null> {
  if (Platform.OS === "web") return null;

  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") return null;

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;

    const tokenData = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    return tokenData.data;
  } catch (err) {
    console.warn("[push-token] Could not get Expo push token:", err);
    return null;
  }
}

/**
 * Fetches the Expo push token and registers it with the backend via tRPC.
 * Safe to call multiple times — upserts on the server.
 */
export async function registerPushToken(
  deviceId: string,
  registerFn: (args: { deviceId: string; token: string }) => Promise<unknown>
): Promise<void> {
  const token = await getExpoPushToken();
  if (!token) return;

  try {
    await registerFn({ deviceId, token });
    console.log("[push-token] Registered push token:", token.slice(0, 20) + "...");
  } catch (err) {
    console.warn("[push-token] Failed to register push token on server:", err);
  }
}
