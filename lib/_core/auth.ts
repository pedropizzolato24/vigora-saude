import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { SESSION_TOKEN_KEY, USER_INFO_KEY } from "@/constants/oauth";

export type UserType = "caregiver" | "monitored";

export type User = {
  id: number;
  openId: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  userType: UserType | null;
  birthDate: string | null;
  bloodType: string | null;
  loginMethod: string | null;
  lastSignedIn: Date;
};

// Notificação genérica de "conta ativa mudou" (openId, ou null no logout).
// setUserInfo/clearUserInfo são os pontos únicos por onde TODO login/logout passa,
// então quem precisa reagir à troca de conta (ex.: tema por conta) assina aqui em
// vez de tentar interceptar cada fluxo de login/logout. Sem UI, fica no _core.
type ActiveUserListener = (openId: string | null) => void;
const activeUserListeners = new Set<ActiveUserListener>();

export function subscribeActiveUser(listener: ActiveUserListener): () => void {
  activeUserListeners.add(listener);
  return () => {
    activeUserListeners.delete(listener);
  };
}

function notifyActiveUser(openId: string | null): void {
  activeUserListeners.forEach((listener) => {
    try {
      listener(openId);
    } catch {
      // um listener com defeito não pode quebrar o fluxo de auth
    }
  });
}

export async function getSessionToken(): Promise<string | null> {
  try {
    // Web platform uses cookie-based auth, no manual token management needed
    if (Platform.OS === "web") {
      console.log("[Auth] Web platform uses cookie-based auth, skipping token retrieval");
      return null;
    }

    // Use SecureStore for native
    console.log("[Auth] Getting session token...");
    const token = await SecureStore.getItemAsync(SESSION_TOKEN_KEY);
    console.log("[Auth] Session token", token ? "present" : "missing");
    return token;
  } catch (error) {
    console.error("[Auth] Failed to get session token:", error);
    return null;
  }
}

export async function setSessionToken(token: string): Promise<void> {
  try {
    // Web platform uses cookie-based auth, no manual token management needed
    if (Platform.OS === "web") {
      console.log("[Auth] Web platform uses cookie-based auth, skipping token storage");
      return;
    }

    // Use SecureStore for native
    console.log("[Auth] Setting session token...");
    await SecureStore.setItemAsync(SESSION_TOKEN_KEY, token);
    console.log("[Auth] Session token stored in SecureStore successfully");
  } catch (error) {
    console.error("[Auth] Failed to set session token:", error);
    throw error;
  }
}

export async function removeSessionToken(): Promise<void> {
  try {
    // Web platform uses cookie-based auth, logout is handled by server clearing cookie
    if (Platform.OS === "web") {
      console.log("[Auth] Web platform uses cookie-based auth, skipping token removal");
      return;
    }

    // Use SecureStore for native
    console.log("[Auth] Removing session token...");
    await SecureStore.deleteItemAsync(SESSION_TOKEN_KEY);
    console.log("[Auth] Session token removed from SecureStore successfully");
  } catch (error) {
    console.error("[Auth] Failed to remove session token:", error);
  }
}

export async function getUserInfo(): Promise<User | null> {
  try {
    console.log("[Auth] Getting user info...");

    let info: string | null = null;
    if (Platform.OS === "web") {
      // Use localStorage for web
      info = window.localStorage.getItem(USER_INFO_KEY);
    } else {
      // Use SecureStore for native
      info = await SecureStore.getItemAsync(USER_INFO_KEY);
    }

    if (!info) {
      console.log("[Auth] No user info found");
      return null;
    }
    const user = JSON.parse(info);
    // Never log the User object — it carries PII/health data (e-mail, phone,
    // bloodType, birthDate) that would leak into logcat / crash reporters.
    console.log("[Auth] User info retrieved");
    return user;
  } catch (error) {
    console.error("[Auth] Failed to get user info:", error);
    return null;
  }
}

export async function setUserInfo(user: User): Promise<void> {
  try {
    // Never log the User object (PII/health data — see getUserInfo).
    console.log("[Auth] Setting user info...");

    if (Platform.OS === "web") {
      // Use localStorage for web
      window.localStorage.setItem(USER_INFO_KEY, JSON.stringify(user));
      console.log("[Auth] User info stored in localStorage successfully");
      notifyActiveUser(user.openId);
      return;
    }

    // Use SecureStore for native
    await SecureStore.setItemAsync(USER_INFO_KEY, JSON.stringify(user));
    console.log("[Auth] User info stored in SecureStore successfully");
    notifyActiveUser(user.openId);
  } catch (error) {
    console.error("[Auth] Failed to set user info:", error);
  }
}

export async function clearUserInfo(): Promise<void> {
  try {
    if (Platform.OS === "web") {
      // Use localStorage for web
      window.localStorage.removeItem(USER_INFO_KEY);
      notifyActiveUser(null);
      return;
    }

    // Use SecureStore for native
    await SecureStore.deleteItemAsync(USER_INFO_KEY);
    notifyActiveUser(null);
  } catch (error) {
    console.error("[Auth] Failed to clear user info:", error);
  }
}
