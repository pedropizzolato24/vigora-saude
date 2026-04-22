/**
 * monitoring-job.ts
 *
 * Server-side background job that runs every 5 minutes to:
 * 1. Detect alarm events that expired without device confirmation
 *    → If device was offline (no heartbeat): mark as "not_sent"
 *    → If device was online but user didn't respond: mark as "missed"
 * 2. Check for devices that have been offline for 24h+ with unresolved alarms
 *    → Send progressive warning messages to emergency contacts via:
 *       WhatsApp (primary) → Email (fallback) → SMS (last resort)
 *
 * Warning escalation levels:
 *   Level 1 (24h)  → Aviso leve: dispositivo sem atividade
 *   Level 2 (48h)  → Preocupação moderada: múltiplos alarmes perdidos
 *   Level 3 (72h+) → Alerta sério: possível emergência
 */
import {
  getAppUser,
  getExpiredPendingEvents,
  getInactiveDevices,
  getLastHeartbeat,
  getLastWarning,
  getWarningHistory,
  markEventWarningSent,
  recordWarning,
  updateAlarmEventStatus,
} from "./db-monitoring";
import { sendWhatsAppMessage, isWhatsAppApiConfigured } from "./whatsapp";
import { sendEmail, isEmailConfigured } from "./email";
import { sendSms, isSmsConfigured } from "./sms";

// Grace period: how long after scheduledAt we wait before resolving a pending event
const GRACE_PERIOD_MINUTES = 15;

// Heartbeat threshold: if device hasn't pinged in this many minutes, it's considered offline
const OFFLINE_THRESHOLD_MINUTES = 30;

// Warning thresholds in hours
const WARNING_LEVELS = [
  { level: 1, hours: 24, label: "aviso leve" },
  { level: 2, hours: 48, label: "preocupação moderada" },
  { level: 3, hours: 72, label: "alerta sério" },
];

// Minimum interval between warnings of the same level (hours)
const MIN_WARNING_INTERVAL_HOURS = 12;

/**
 * Build a progressive warning message based on escalation level.
 */
function buildWarningMessage(
  userName: string,
  level: number,
  offlineHours: number,
  locationUrl?: string
): string {
  const name = userName || "O usuário do Vigora Saúde";

  let header: string;
  let body: string;

  if (level === 1) {
    header = "⚠️ AVISO — Vigora Saúde";
    body =
      `${name} está sem atividade no aplicativo há aproximadamente ${offlineHours} horas.\n\n` +
      `Os alarmes de medicamento/saúde não estão sendo confirmados. ` +
      `Isso pode indicar que o celular está desligado, sem bateria ou sem conexão.\n\n` +
      `Recomendamos entrar em contato para verificar se está tudo bem.`;
  } else if (level === 2) {
    header = "⚠️⚠️ ATENÇÃO — Vigora Saúde";
    body =
      `${name} está sem atividade há aproximadamente ${offlineHours} horas.\n\n` +
      `Múltiplos alarmes de saúde não foram confirmados. ` +
      `Por favor, tente entrar em contato com urgência.`;
  } else {
    header = "🚨 ALERTA SÉRIO — Vigora Saúde";
    body =
      `${name} está sem atividade há mais de ${offlineHours} horas.\n\n` +
      `Todos os alarmes de saúde do período ficaram sem resposta. ` +
      `Esta situação requer atenção imediata. ` +
      `Considere acionar serviços de emergência se não conseguir contato.`;
  }

  let message = `${header}\n\n${body}`;

  if (locationUrl) {
    message += `\n\n📍 Última localização registrada:\n${locationUrl}`;
  }

  message += `\n\n— Enviado automaticamente pelo Vigora Saúde`;
  return message;
}

/**
 * Build email subject based on warning level.
 */
function buildEmailSubject(userName: string, level: number): string {
  const name = userName || "Usuário do Vigora Saúde";
  if (level === 1) return `⚠️ Aviso: ${name} sem atividade no Vigora Saúde`;
  if (level === 2) return `⚠️⚠️ Atenção: ${name} sem atividade há 48h — Vigora Saúde`;
  return `🚨 ALERTA SÉRIO: ${name} sem atividade há 72h+ — Vigora Saúde`;
}

/**
 * Send a message to a single contact using fallback chain:
 * WhatsApp → Email → SMS
 *
 * Returns the channel that succeeded, or null if all failed.
 */
async function sendWithFallback(
  contact: { name: string; phone: string; email?: string; whatsapp?: boolean },
  message: string,
  emailSubject: string
): Promise<{ channel: "whatsapp" | "email" | "sms" | null; error?: string }> {

  // ── 1. WhatsApp (primary) ─────────────────────────────────────────────────
  if (contact.whatsapp && contact.phone && isWhatsAppApiConfigured()) {
    const result = await sendWhatsAppMessage(contact.phone, message);
    if (result.success) {
      console.log(`[Monitor] ✅ WhatsApp sent to ${contact.name} (${contact.phone})`);
      return { channel: "whatsapp" };
    }
    console.warn(`[Monitor] ⚠️ WhatsApp failed for ${contact.name}: ${result.error}`);
  } else if (!isWhatsAppApiConfigured()) {
    console.log(`[Monitor] WhatsApp API not configured, trying next channel`);
  }

  // ── 2. Email (fallback) ───────────────────────────────────────────────────
  if (contact.email && isEmailConfigured()) {
    const result = await sendEmail(contact.email, emailSubject, message);
    if (result.success) {
      console.log(`[Monitor] ✅ Email sent to ${contact.name} (${contact.email})`);
      return { channel: "email" };
    }
    console.warn(`[Monitor] ⚠️ Email failed for ${contact.name}: ${result.error}`);
  } else if (contact.email && !isEmailConfigured()) {
    console.log(`[Monitor] Email API not configured, trying next channel`);
  }

  // ── 3. SMS (last resort) ──────────────────────────────────────────────────
  if (contact.phone && isSmsConfigured()) {
    const result = await sendSms(contact.phone, message);
    if (result.success) {
      console.log(`[Monitor] ✅ SMS sent to ${contact.name} (${contact.phone})`);
      return { channel: "sms" };
    }
    console.warn(`[Monitor] ⚠️ SMS failed for ${contact.name}: ${result.error}`);
    return { channel: null, error: result.error };
  }

  return {
    channel: null,
    error: "No configured channel available (WhatsApp, Email, or SMS)",
  };
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
 * Main monitoring job — called every 5 minutes by the scheduler.
 */
export async function runMonitoringJob(): Promise<void> {
  const now = new Date();
  console.log(`[Monitor] Running monitoring job at ${now.toISOString()}`);

  try {
    // ── Step 1: Resolve expired pending alarm events ──────────────────────────
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
          `[Monitor] Event ${event.id} (alarm ${event.alarmId}) → not_sent (device offline)`
        );
      } else {
        await updateAlarmEventStatus(event.id, "missed");
        console.log(
          `[Monitor] Event ${event.id} (alarm ${event.alarmId}) → missed (user didn't respond)`
        );
      }
    }

    // ── Step 2: Check for devices needing warning messages ───────────────────
    const inactiveDevices = await getInactiveDevices(OFFLINE_THRESHOLD_MINUTES);
    console.log(`[Monitor] Found ${inactiveDevices.length} inactive devices`);

    for (const device of inactiveDevices) {
      const offlineMs = now.getTime() - device.lastSeenAt.getTime();
      const offlineHours = Math.floor(offlineMs / (1000 * 60 * 60));

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

      if (contacts.length === 0) {
        console.log(
          `[Monitor] Device ${device.deviceId}: no contacts configured, skipping`
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

      const message = buildWarningMessage(
        appUser.userName || "",
        warningLevel,
        offlineHours,
        locationUrl
      );
      const emailSubject = buildEmailSubject(appUser.userName || "", warningLevel);

      console.log(
        `[Monitor] Sending level ${warningLevel} warning for device ${device.deviceId} (${offlineHours}h offline)`
      );
      console.log(
        `[Monitor] Available channels: WhatsApp=${isWhatsAppApiConfigured()}, Email=${isEmailConfigured()}, SMS=${isSmsConfigured()}`
      );

      let totalSent = 0;
      let totalFailed = 0;
      const channelSummary: Record<string, number> = { whatsapp: 0, email: 0, sms: 0, failed: 0 };

      for (const contact of contacts) {
        const result = await sendWithFallback(
          {
            name: contact.name,
            phone: contact.phone,
            email: contact.email,
            whatsapp: contact.whatsapp,
          },
          message,
          emailSubject
        );

        if (result.channel) {
          totalSent++;
          channelSummary[result.channel] = (channelSummary[result.channel] || 0) + 1;
        } else {
          totalFailed++;
          channelSummary.failed++;
          console.warn(
            `[Monitor] ❌ All channels failed for ${contact.name}: ${result.error}`
          );
        }

        // Small delay between contacts
        await new Promise((r) => setTimeout(r, 500));
      }

      await recordWarning({
        deviceId: device.deviceId,
        level: warningLevel,
        offlineHours,
        contactsReached: totalSent,
        locationIncluded: !!locationUrl,
      });

      console.log(
        `[Monitor] Warning sent: ${totalSent} contacts reached (WhatsApp: ${channelSummary.whatsapp}, Email: ${channelSummary.email}, SMS: ${channelSummary.sms}), ${totalFailed} failed`
      );
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
