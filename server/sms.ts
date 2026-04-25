/**
 * sms.ts
 *
 * SMS sending service using Twilio REST API.
 * Used as LAST RESORT FALLBACK when both WhatsApp and Email fail or are not configured.
 *
 * Requires:
 *   TWILIO_ACCOUNT_SID  — Twilio Account SID (from twilio.com console)
 *   TWILIO_AUTH_TOKEN   — Twilio Auth Token
 *   TWILIO_FROM_NUMBER  — Twilio phone number in E.164 format (e.g., "+15705590772")
 *
 * Note on Trial accounts:
 *   Twilio Trial accounts can only send SMS to verified phone numbers.
 *   To verify a number: https://www.twilio.com/console/phone-numbers/verified
 *   Upgrade to a paid account to send to any number.
 */

import { ENV } from "./_core/env";

const TWILIO_API_BASE = "https://api.twilio.com/2010-04-01";

interface SmsSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Check if SMS (Twilio) is configured.
 */
export function isSmsConfigured(): boolean {
  return !!(ENV.twilioAccountSid && ENV.twilioAuthToken && ENV.twilioFromNumber);
}

/**
 * Normalize a Brazilian phone number to E.164 format.
 * Handles formats: (11) 99999-9999, 11999999999, +5511999999999, etc.
 */
function normalizePhoneToE164(phone: string): string {
  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, "");

  // Already has country code
  if (digits.startsWith("55") && digits.length >= 12) {
    return `+${digits}`;
  }

  // Add Brazil country code
  return `+55${digits}`;
}

/**
 * Send an SMS via Twilio REST API.
 */
export async function sendSms(
  to: string,
  message: string
): Promise<SmsSendResult> {
  if (!isSmsConfigured()) {
    return {
      success: false,
      error: "SMS not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER.",
    };
  }

  const e164Phone = normalizePhoneToE164(to);

  // Twilio limits SMS to 1600 chars; truncate if needed
  const truncatedMessage = message.length > 1600
    ? message.slice(0, 1597) + "..."
    : message;

  try {
    const credentials = Buffer.from(
      `${ENV.twilioAccountSid}:${ENV.twilioAuthToken}`
    ).toString("base64");

    const body = new URLSearchParams({
      To: e164Phone,
      From: ENV.twilioFromNumber,
      Body: truncatedMessage,
    });

    const response = await fetch(
      `${TWILIO_API_BASE}/Accounts/${ENV.twilioAccountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      }
    );

    const data = (await response.json()) as any;

    if (!response.ok) {
      // Twilio error codes: https://www.twilio.com/docs/api/errors
      const errorMsg = data?.message || `HTTP ${response.status}: ${response.statusText}`;
      const errorCode = data?.code;

      // Trial account restriction: number not verified
      if (errorCode === 21608) {
        console.warn(
          `[SMS] Trial account: ${e164Phone} is not a verified number. ` +
          `Verify at: https://www.twilio.com/console/phone-numbers/verified`
        );
        return {
          success: false,
          error: `Número não verificado na conta Trial do Twilio. Verifique em twilio.com/console.`,
        };
      }

      console.error(`[SMS] Failed to send to ${e164Phone} (code ${errorCode}):`, errorMsg);
      return { success: false, error: errorMsg };
    }

    const messageId = data?.sid;
    const status = data?.status;
    console.log(`[SMS] Message sent to ${e164Phone}, SID: ${messageId}, status: ${status}`);
    return { success: true, messageId };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[SMS] Network error sending to ${e164Phone}:`, errorMsg);
    return { success: false, error: errorMsg };
  }
}

/**
 * Send emergency alert SMS to multiple contacts.
 */
export async function sendEmergencySmsAlerts(
  contacts: Array<{ name: string; phone: string }>,
  message: string
): Promise<{
  sent: number;
  failed: number;
  results: Array<{ name: string; phone: string; result: SmsSendResult }>;
}> {
  const results: Array<{ name: string; phone: string; result: SmsSendResult }> = [];
  let sent = 0;
  let failed = 0;

  for (const contact of contacts) {
    const result = await sendSms(contact.phone, message);
    results.push({ name: contact.name, phone: contact.phone, result });

    if (result.success) {
      sent++;
    } else {
      failed++;
    }

    // Small delay between messages to avoid rate limiting
    if (contacts.indexOf(contact) < contacts.length - 1) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  console.log(`[SMS] Emergency alerts: ${sent} sent, ${failed} failed`);
  return { sent, failed, results };
}
