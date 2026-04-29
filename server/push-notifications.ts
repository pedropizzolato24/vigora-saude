/**
 * server/push-notifications.ts
 *
 * Wrapper around the Expo Push Notification API.
 * Docs: https://docs.expo.dev/push-notifications/sending-notifications/
 */

const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";

export interface ExpoPushMessage {
  to: string | string[];
  title?: string;
  body?: string;
  data?: Record<string, unknown>;
  sound?: "default" | null;
  badge?: number;
  priority?: "default" | "normal" | "high";
  channelId?: string;
}

export interface ExpoPushTicket {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
}

/**
 * Sends push notifications to one or more Expo push tokens.
 * Batches up to 100 tokens per request (Expo limit).
 * Silently logs errors — never throws, to avoid blocking the caller.
 */
export async function sendPushNotifications(
  messages: ExpoPushMessage[]
): Promise<ExpoPushTicket[]> {
  if (messages.length === 0) return [];

  const tickets: ExpoPushTicket[] = [];

  // Expo recommends batches of ≤ 100
  for (let i = 0; i < messages.length; i += 100) {
    const batch = messages.slice(i, i + 100);
    try {
      const res = await fetch(EXPO_PUSH_ENDPOINT, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip, deflate",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(batch),
      });

      if (!res.ok) {
        console.error(`[push] Expo API returned ${res.status}: ${await res.text()}`);
        batch.forEach(() => tickets.push({ status: "error", message: `HTTP ${res.status}` }));
        continue;
      }

      const json = (await res.json()) as { data: ExpoPushTicket[] };
      tickets.push(...json.data);

      // Log any per-token errors for debugging
      for (const ticket of json.data) {
        if (ticket.status === "error") {
          console.error(`[push] Ticket error: ${ticket.message}`, ticket.details);
        }
      }
    } catch (err) {
      console.error("[push] Failed to send batch:", err);
      batch.forEach(() => tickets.push({ status: "error", message: String(err) }));
    }
  }

  return tickets;
}

/**
 * Sends a "missed alarm" notification to all caregiver push tokens of a monitored user.
 */
export async function notifyCaregiversMissedAlarm(
  caregiverTokens: string[],
  monitoredName: string | null,
  alarmDescription: string,
  scheduledAt: Date
): Promise<void> {
  if (caregiverTokens.length === 0) return;

  const name = monitoredName ?? "Monitorado";
  const time = scheduledAt.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });

  const messages: ExpoPushMessage[] = caregiverTokens.map((token) => ({
    to: token,
    title: `Alarme não respondido — ${name}`,
    body: `${name} não respondeu ao alarme "${alarmDescription}" das ${time}.`,
    data: { type: "missed_alarm", monitoredName: name, alarmDescription, scheduledAt: scheduledAt.toISOString() },
    sound: "default",
    priority: "high",
    channelId: "caregiver-alerts",
  }));

  await sendPushNotifications(messages);
}

/**
 * Sends a generic caregiver alert (e.g., offline warning, SOS).
 */
export async function notifyCaregiversAlert(
  caregiverTokens: string[],
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<void> {
  if (caregiverTokens.length === 0) return;

  const messages: ExpoPushMessage[] = caregiverTokens.map((token) => ({
    to: token,
    title,
    body,
    data: { type: "caregiver_alert", ...data },
    sound: "default",
    priority: "high",
    channelId: "caregiver-alerts",
  }));

  await sendPushNotifications(messages);
}
