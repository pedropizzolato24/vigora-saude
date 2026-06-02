/**
 * pending-invite.ts
 *
 * Stashes a share-invite token across the auth funnel. When a monitored person
 * opens an invite link while logged out (or before finishing registration), the
 * accept screen saves the token here; the post-auth routers (login.tsx /
 * register.tsx) read it and route back to /convite/[token] once auth completes.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'vigora_pending_invite_token';

export async function setPendingInvite(token: string): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, token);
  } catch {
    // best-effort
  }
}

export async function getPendingInvite(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export async function clearPendingInvite(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // best-effort
  }
}
