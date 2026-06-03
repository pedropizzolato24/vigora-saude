/**
 * db-push.ts
 *
 * Persistence for Expo push tokens. Tokens are keyed by account `openId` so the
 * monitoring job can resolve every device a linked caregiver is signed in on.
 */
import { eq, inArray } from "drizzle-orm";
import { getDb } from "./db";
import { pushTokens } from "../drizzle/schema";

type Platform = "ios" | "android" | "web";

/**
 * Store (or refresh) a device's push token for an account. Keyed by the unique
 * token, so a device that re-registers — or signs in under a different account —
 * updates its existing row instead of creating a duplicate.
 */
export async function upsertPushToken(data: {
  openId: string;
  token: string;
  platform: Platform;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .insert(pushTokens)
    .values({ openId: data.openId, token: data.token, platform: data.platform })
    .onDuplicateKeyUpdate({
      set: { openId: data.openId, platform: data.platform },
    });
}

/** All push tokens belonging to any of the given accounts. */
export async function getPushTokensForOpenIds(openIds: string[]) {
  if (openIds.length === 0) return [];
  const db = await getDb();
  if (!db) return [];
  return db.select().from(pushTokens).where(inArray(pushTokens.openId, openIds));
}

/** Remove a token Expo reported as no longer valid (DeviceNotRegistered). */
export async function deletePushToken(token: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(pushTokens).where(eq(pushTokens.token, token));
}
