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

const EXPO_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";

// A Expo aceita até 1000 ids por consulta de recibos; 300 mantém a requisição pequena.
const RECEIPT_BATCH = 300;

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

export interface DataPushResult {
  token: string;
  /** Id do ticket aceito pela Expo (serve para consultar o recibo depois); null se não aceitou. */
  ticketId: string | null;
  /** A Expo disse, já no ticket, que o token não existe mais. NÃO apagamos aqui: quem chama decide. */
  deviceNotRegistered: boolean;
}

/**
 * Push SILENCIOSO (só dados): acorda o app do idoso para buscar a lista
 * gerenciada (`managed_alarms_updated`) ou provar que ainda está instalado
 * (`ping`). Sem título, corpo nem som — não aparece nada na tela.
 *
 * Diferente de sendExpoPush: devolve o resultado de cada token (para o ping
 * diário saber quem morreu) e não apaga token sozinho. Falha de rede ou HTTP
 * devolve o token com `ticketId: null` — nunca lança, nunca some em silêncio.
 * Logs só com o nome do erro (a mensagem pode trazer o token).
 */
export async function sendExpoDataPush(
  tokens: string[],
  data: Record<string, unknown>
): Promise<DataPushResult[]> {
  const valid = tokens.filter((t) => !!t);
  const results: DataPushResult[] = [];

  for (const batch of chunk(valid, MAX_BATCH)) {
    const messages = batch.map((to) => ({
      to,
      data,
      _contentAvailable: true,
      priority: "high",
    }));
    const notSent = (): DataPushResult[] =>
      batch.map((token) => ({ token, ticketId: null, deviceNotRegistered: false }));

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
        console.warn(`[Push] Expo data push request failed: HTTP ${res.status}`);
        results.push(...notSent());
        continue;
      }

      const body = (await res.json()) as { data?: ExpoTicket[] };
      const tickets = body.data ?? [];
      batch.forEach((token, i) => {
        const ticket = tickets[i];
        results.push({
          token,
          ticketId: ticket?.status === "ok" && ticket.id ? ticket.id : null,
          deviceNotRegistered:
            ticket?.status === "error" && ticket.details?.error === "DeviceNotRegistered",
        });
      });
    } catch (error) {
      console.error(
        `[Push] Network error sending data push:`,
        error instanceof Error ? error.name : "Error"
      );
      results.push(...notSent());
    }
  }

  return results;
}

export interface ExpoReceipt {
  status: "ok" | "error";
  details?: { error?: string };
}

/**
 * Consulta os recibos de entrega de tickets antigos. É nos recibos que a Expo
 * conta que o aparelho não existe mais (`DeviceNotRegistered`) — o ticket só
 * diz que a Expo aceitou a mensagem. Falha de rede ou HTTP não lança: o lote
 * é pulado e o chamador simplesmente não vê aqueles recibos nesta rodada.
 */
export async function fetchExpoReceipts(
  ticketIds: string[]
): Promise<Record<string, ExpoReceipt>> {
  const ids = ticketIds.filter((id) => !!id);
  const out: Record<string, ExpoReceipt> = {};

  for (const batch of chunk(ids, RECEIPT_BATCH)) {
    try {
      const res = await fetch(EXPO_RECEIPTS_URL, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ids: batch }),
      });
      if (!res.ok) {
        console.warn(`[Push] Expo receipts request failed: HTTP ${res.status}`);
        continue;
      }
      const body = (await res.json()) as { data?: Record<string, ExpoReceipt> };
      Object.assign(out, body.data ?? {});
    } catch (error) {
      console.warn(
        `[Push] Network error fetching receipts:`,
        error instanceof Error ? error.name : "Error"
      );
    }
  }

  return out;
}
