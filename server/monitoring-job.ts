/**
 * monitoring-job.ts
 *
 * Server-side background job that runs every 5 minutes to:
 * 1. Detect alarm events that expired without device confirmation
 *    -> If device was offline (no heartbeat): mark as "not_sent"
 *    -> If device was online but user didn't respond: mark as "missed"
 * 2. Check for devices that have been offline for 12h+ with unresolved alarms
 *    -> Send progressive warning messages to emergency contacts via WhatsApp
 *
 * Warning escalation levels:
 *   Level 1 (30min) -> Aviso leve: dispositivo sem atividade
 *   Level 2 (2h)    -> Preocupação moderada: múltiplos alarmes perdidos
 *   Level 3 (6h+)   -> Alerta sério: possível emergência
 */
import {
  claimWarning,
  getAppUser,
  getExpiredPendingEvents,
  getInactiveDevices,
  getLastHeartbeat,
  getLastWarning,
  getMissedCheckinEvents,
  getWarningHistory,
  markEventWarningSent,
  updateAlarmEventStatus,
  updateWarningResult,
} from "./db-monitoring";
import { sendWhatsAppMessage, isWhatsAppApiConfigured } from "./whatsapp";
import { getActiveCaregiversForMonitored } from "./db-links";
import { getPushTokensForOpenIds } from "./db-push";
import { sendExpoPush } from "./push";

// Grace period: how long after scheduledAt we wait before resolving a pending event
const GRACE_PERIOD_MINUTES = 15;

// Heartbeat threshold: if device hasn't pinged in this many minutes, it's considered offline
const OFFLINE_THRESHOLD_MINUTES = 30;

// Warning thresholds in hours (fractional allowed, e.g. 0.5 = 30 min)
const WARNING_LEVELS = [
  { level: 1, hours: 0.5, label: "aviso leve" },
  { level: 2, hours: 2,   label: "preocupação moderada" },
  { level: 3, hours: 6,   label: "alerta sério" },
];

// Minimum interval between warnings of the same level (hours)
const MIN_WARNING_INTERVAL_HOURS = 2;

function formatOfflineDuration(offlineHours: number): string {
  if (offlineHours < 1) {
    const minutes = Math.round(offlineHours * 60);
    return `${minutes} minutos`;
  }
  const hours = Math.round(offlineHours);
  return `${hours} hora${hours !== 1 ? "s" : ""}`;
}

/**
 * Build a progressive warning message based on escalation level.
 */
function buildWarningMessage(
  userName: string,
  level: number,
  offlineHours: number,
  locationUrl?: string
): string {
  const name = userName || "O usuário do Vigora";
  const duration = formatOfflineDuration(offlineHours);

  let header: string;
  let body: string;

  if (level === 1) {
    header = "⚠️ AVISO - Vigora";
    body =
      `${name} está sem atividade no aplicativo há aproximadamente ${duration}.\n\n` +
      `Os alarmes de medicamento/saúde não estão sendo confirmados. ` +
      `Isso pode indicar que o celular está desligado, sem bateria ou sem conexão.\n\n` +
      `Recomendamos entrar em contato para verificar se está tudo bem.`;
  } else if (level === 2) {
    header = "⚠️⚠️ ATENÇÃO - Vigora";
    body =
      `${name} está sem atividade há aproximadamente ${duration}.\n\n` +
      `Múltiplos alarmes de saúde não foram confirmados. ` +
      `Por favor, tente entrar em contato com urgência.`;
  } else {
    header = "🚨 ALERTA SÉRIO - Vigora";
    body =
      `${name} está sem atividade há mais de ${duration}.\n\n` +
      `Todos os alarmes de saúde do período ficaram sem resposta. ` +
      `Esta situação requer atenção imediata. ` +
      `Considere acionar serviços de emergência se não conseguir contato.`;
  }

  let message = `${header}\n\n${body}`;

  if (locationUrl) {
    message += `\n\n📍 Última localização registrada:\n${locationUrl}`;
  }

  message += `\n\n- Enviado automaticamente pelo Vigora`;
  return message;
}

/** Short push title for an offline warning, by escalation level. */
function buildWarningPushTitle(level: number): string {
  if (level === 1) return "⚠️ Aviso — Vigora";
  if (level === 2) return "⚠️ Atenção — Vigora";
  return "🚨 Alerta sério — Vigora";
}

/** Short push body summarizing the offline duration. */
function buildWarningPushBody(userName: string, offlineHours: number): string {
  const name = userName || "A pessoa que você acompanha";
  return `${name} está sem atividade no app há ${formatOfflineDuration(offlineHours)}. Toque para ver os detalhes.`;
}

/**
 * Send a warning message to a single contact via WhatsApp.
 *
 * Returns whether the message was sent, and the error when it was not.
 */
async function sendToContact(
  contact: { name: string; phone: string; whatsapp?: boolean },
  message: string
): Promise<{ sent: boolean; error?: string }> {
  if (!isWhatsAppApiConfigured()) {
    return { sent: false, error: "WhatsApp Business API not configured" };
  }
  if (!contact.whatsapp || !contact.phone) {
    return { sent: false, error: "Contact has no WhatsApp number" };
  }

  const result = await sendWhatsAppMessage(contact.phone, message);
  if (result.success) {
    console.log(`[Monitor] ✅ WhatsApp sent to ${contact.name} (${contact.phone})`);
    return { sent: true };
  }
  console.warn(`[Monitor] ⚠️ WhatsApp failed for ${contact.name}: ${result.error}`);
  return { sent: false, error: result.error };
}

/** Open IDs of every caregiver actively linked to the monitored person. */
async function getLinkedCaregiverOpenIds(
  monitoredOpenId: string | null
): Promise<string[]> {
  if (!monitoredOpenId) return [];
  const caregivers = await getActiveCaregiversForMonitored(monitoredOpenId);
  return caregivers.map((c) => c.caregiverOpenId);
}

/**
 * Deliver an in-app push alert to every device of the given caregivers.
 * Returns the number of pushes Expo accepted.
 *
 * Runs independently of the WhatsApp escalation: a monitored person may have a
 * linked caregiver but no emergency contacts (or vice-versa), and each channel
 * must reach its own recipients.
 */
async function sendPushToCaregivers(
  caregiverOpenIds: string[],
  title: string,
  body: string,
  data: Record<string, unknown>
): Promise<number> {
  if (caregiverOpenIds.length === 0) return 0;
  const tokens = await getPushTokensForOpenIds(caregiverOpenIds);
  if (tokens.length === 0) return 0;
  return sendExpoPush(tokens.map((t) => t.token), { title, body, data });
}

/**
 * Determine the appropriate warning level based on offline hours.
 * Returns null if no warning should be sent yet.
 */
function getWarningLevel(offlineHours: number): number | null {
  let level: number | null = null;
  for (const threshold of WARNING_LEVELS) {
    if (offlineHours >= threshold.hours) {
      level = threshold.level;
    }
  }
  return level;
}

/**
 * Main monitoring job - called every 5 minutes by the scheduler.
 */
export async function runMonitoringJob(): Promise<void> {
  const now = new Date();
  console.log(`[Monitor] Running monitoring job at ${now.toISOString()}`);

  try {
    // -- Step 1: Resolve expired pending alarm events --------------------------
    const expiredEvents = await getExpiredPendingEvents(GRACE_PERIOD_MINUTES);
    console.log(`[Monitor] Found ${expiredEvents.length} expired pending events`);

    for (const event of expiredEvents) {
      const heartbeat = await getLastHeartbeat(event.deviceId);
      const deviceOnline =
        heartbeat &&
        heartbeat.lastSeenAt.getTime() >
          event.scheduledAt.getTime() - OFFLINE_THRESHOLD_MINUTES * 60 * 1000;

      if (!deviceOnline) {
        await updateAlarmEventStatus(event.id, "not_sent");
        console.log(
          `[Monitor] Event ${event.id} (alarm ${event.alarmId}) -> not_sent (device offline)`
        );
      } else {
        await updateAlarmEventStatus(event.id, "missed");
        console.log(
          `[Monitor] Event ${event.id} (alarm ${event.alarmId}) -> missed (user didn't respond)`
        );
      }
    }

    // -- Step 2: Check for devices needing warning messages -------------------
    const inactiveDevices = await getInactiveDevices(OFFLINE_THRESHOLD_MINUTES);
    console.log(`[Monitor] Found ${inactiveDevices.length} inactive devices`);

    for (const device of inactiveDevices) {
      const offlineMs = now.getTime() - device.lastSeenAt.getTime();
      const offlineHours = offlineMs / (1000 * 60 * 60);

      const warningLevel = getWarningLevel(offlineHours);
      if (warningLevel === null) continue;

      // Check if we already sent a warning at this level recently
      const warnings = await getWarningHistory(device.deviceId, 10);
      const recentWarningAtLevel = warnings.find(
        (w) =>
          w.level === warningLevel &&
          now.getTime() - w.sentAt.getTime() <
            MIN_WARNING_INTERVAL_HOURS * 60 * 60 * 1000
      );
      if (recentWarningAtLevel) {
        console.log(
          `[Monitor] Device ${device.deviceId}: level ${warningLevel} warning already sent recently, skipping`
        );
        continue;
      }

      // Get app user data (contacts, name, location)
      const appUser = await getAppUser(device.deviceId);
      if (!appUser) {
        console.log(`[Monitor] Device ${device.deviceId}: no app user found, skipping`);
        continue;
      }

      const contacts = (appUser.emergencyContacts as any[]) || [];
      const caregiverOpenIds = await getLinkedCaregiverOpenIds(appUser.openId);

      // Two independent recipient sets: WhatsApp reaches emergency contacts,
      // push reaches linked caregivers. Skip only when neither has anyone.
      if (contacts.length === 0 && caregiverOpenIds.length === 0) {
        console.log(
          `[Monitor] Device ${device.deviceId}: no contacts or caregivers, skipping`
        );
        continue;
      }

      // Build location URL if available
      let locationUrl: string | undefined;
      if (appUser.lastLocation) {
        const [lat, lng] = appUser.lastLocation.split(",");
        if (lat && lng) {
          locationUrl = `https://maps.google.com/?q=${lat},${lng}`;
        }
      }

      // Claim the warning slot BEFORE sending. A concurrent run that reads
      // warningHistory after this insert will see the row and skip its own send,
      // closing the TOCTOU window to a DB round-trip rather than the entire send loop.
      // The claim dedups both channels (WhatsApp + push) for this level.
      const claimId = await claimWarning({
        deviceId: device.deviceId,
        level: warningLevel,
        offlineHours,
        locationIncluded: !!locationUrl,
      });

      const message = buildWarningMessage(
        appUser.userName || "",
        warningLevel,
        offlineHours,
        locationUrl
      );

      console.log(
        `[Monitor] Sending level ${warningLevel} warning for device ${device.deviceId} (${offlineHours}h offline)`
      );
      console.log(`[Monitor] WhatsApp configured: ${isWhatsAppApiConfigured()}`);

      let totalSent = 0;
      let totalFailed = 0;

      for (const contact of contacts) {
        const result = await sendToContact(
          { name: contact.name, phone: contact.phone, whatsapp: contact.whatsapp },
          message
        );

        if (result.sent) {
          totalSent++;
        } else {
          totalFailed++;
          console.warn(`[Monitor] ❌ Could not reach ${contact.name}: ${result.error}`);
        }

        // Small delay between contacts
        await new Promise((r) => setTimeout(r, 500));
      }

      // In-app push to linked caregivers (real-time companion to WhatsApp).
      const pushTitle = buildWarningPushTitle(warningLevel);
      const pushBody = buildWarningPushBody(appUser.userName || "", offlineHours);
      const pushed = await sendPushToCaregivers(caregiverOpenIds, pushTitle, pushBody, {
        type: "monitoring_warning",
        level: warningLevel,
        url: "/(caregiver-tabs)/alerts",
      });

      if (claimId !== null) {
        await updateWarningResult(claimId, totalSent, !!locationUrl);
      }

      console.log(
        `[Monitor] Warning sent: ${totalSent} contacts reached via WhatsApp, ${totalFailed} failed; ${pushed} caregiver push(es) delivered`
      );
    }

    // -- Step 3: Escalate missed check-in events --------------------------------
    // Scoped to 'checkin-daily' to avoid cascading on every missed medication alarm.
    // warningSent=false means the client did not handle escalation (device was offline).
    // Look back 48h so events that missed a job run still get caught.
    const missedCheckins = await getMissedCheckinEvents("checkin-daily", 48);
    console.log(`[Monitor] Found ${missedCheckins.length} missed check-in events to escalate`);

    for (const event of missedCheckins) {
      const appUser = await getAppUser(event.deviceId);
      if (!appUser) {
        console.log(`[Monitor] Step 3: no app user for device ${event.deviceId}, skipping`);
        await markEventWarningSent(event.id);
        continue;
      }

      const contacts = (appUser.emergencyContacts as any[]) || [];
      const caregiverOpenIds = await getLinkedCaregiverOpenIds(appUser.openId);
      if (contacts.length === 0 && caregiverOpenIds.length === 0) {
        console.log(`[Monitor] Step 3: no contacts or caregivers for device ${event.deviceId}, skipping`);
        await markEventWarningSent(event.id);
        continue;
      }

      const name = appUser.userName || "O usuário do Vigora";
      const scheduledStr = event.scheduledAt.toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      });
      const message =
        `⚠️ CHECK-IN NÃO RESPONDIDO - Vigora\n\n` +
        `${name} não respondeu ao check-in de saúde previsto para ${scheduledStr}.\n\n` +
        `Por favor, entre em contato para verificar se está tudo bem.\n\n` +
        `- Enviado automaticamente pelo Vigora`;

      console.log(`[Monitor] Step 3: escalating check-in for device ${event.deviceId}`);

      let totalSent = 0;
      for (const contact of contacts) {
        const result = await sendToContact(
          { name: contact.name, phone: contact.phone, whatsapp: contact.whatsapp },
          message
        );
        if (result.sent) totalSent++;
        await new Promise((r) => setTimeout(r, 500));
      }

      const pushed = await sendPushToCaregivers(
        caregiverOpenIds,
        "⚠️ Check-in não respondido — Vigora",
        `${name} não respondeu ao check-in das ${scheduledStr}. Toque para ver os detalhes.`,
        { type: "missed_checkin", url: "/(caregiver-tabs)/alerts" }
      );

      await markEventWarningSent(event.id);
      console.log(`[Monitor] Step 3: escalated check-in event ${event.id}, ${totalSent} contacts reached, ${pushed} caregiver push(es) delivered`);
    }

    console.log(`[Monitor] Job completed successfully`);
  } catch (error) {
    console.error("[Monitor] Job failed:", error);
  }
}

/**
 * Start the monitoring job scheduler.
 * Runs every 5 minutes.
 */
export function startMonitoringScheduler(): void {
  const INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

  console.log("[Monitor] Starting monitoring scheduler (every 5 minutes)");

  // Run immediately on startup
  runMonitoringJob().catch(console.error);

  // Then run every 5 minutes
  setInterval(() => {
    runMonitoringJob().catch(console.error);
  }, INTERVAL_MS);
}
