/**
 * push.ts
 *
 * Delivers in-app alerts to caregivers through Expo's push service. This is the
 * real-time companion to the WhatsApp escalation: WhatsApp reaches the
 * monitored person's emergency contacts, push reaches the linked caregiver
 * accounts inside the app.
 *
 * Expo's push endpoint is public (no server secret required). Tokens Expo
 * reports as `DeviceNotRegistered` are pruned so they aren't retried forever.
 */
import { deletePushToken } from "./db-push";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

// Expo accepts at most 100 messages per request.
const MAX_BATCH = 100;

// Android delivery channel. Must match a channel created on the device — see
// DEFAULT_CHANNEL_ID in lib/notification-constants.ts (set up at app startup).
const ANDROID_CHANNEL_ID = "default";

interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

interface ExpoTicket {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/**
 * Send a push notification to a set of Expo tokens.
 * Returns the number of messages Expo accepted. Dead tokens are removed.
 */
export async function sendExpoPush(
  tokens: string[],
  payload: PushPayload
): Promise<number> {
  const valid = tokens.filter((t) => !!t);
  if (valid.length === 0) return 0;

  let accepted = 0;

  for (const batch of chunk(valid, MAX_BATCH)) {
    const messages = batch.map((to) => ({
      to,
      title: payload.title,
      body: payload.body,
      data: payload.data ?? {},
      sound: "default",
      priority: "high",
      channelId: ANDROID_CHANNEL_ID,
    }));

    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(messages),
      });

      if (!res.ok) {
        console.warn(`[Push] Expo push request failed: HTTP ${res.status}`);
        continue;
      }

      const body = (await res.json()) as { data?: ExpoTicket[] };
      const tickets = body.data ?? [];

      // Tickets are positionally aligned with the messages we sent.
      for (let i = 0; i < tickets.length; i++) {
        const ticket = tickets[i];
        if (ticket.status === "ok") {
          accepted++;
        } else if (ticket.details?.error === "DeviceNotRegistered") {
          await deletePushToken(batch[i]);
          console.log(`[Push] Pruned unregistered token`);
        } else {
          console.warn(`[Push] Ticket error: ${ticket.message ?? "unknown"}`);
        }
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[Push] Network error sending push:`, msg);
    }
  }

  return accepted;
}
