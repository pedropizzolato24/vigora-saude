/**
 * email.ts
 *
 * Email sending service using Resend API (https://resend.com).
 * Used as FALLBACK when WhatsApp is not configured or fails.
 *
 * Requires:
 *   RESEND_API_KEY  — API key from resend.com (free tier: 3000 emails/month)
 *   RESEND_FROM_EMAIL — Sender address (e.g., "alertas@vigora.app")
 *                       Must be a verified domain on Resend.
 *                       If not set, defaults to "onboarding@resend.dev" (Resend sandbox).
 */

import { ENV } from "./_core/env";

const RESEND_API_URL = "https://api.resend.com/emails";

interface EmailSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Check if Email (Resend) is configured.
 */
export function isEmailConfigured(): boolean {
  return !!ENV.resendApiKey;
}

/**
 * Send a plain-text email via Resend API.
 */
export async function sendEmail(
  to: string,
  subject: string,
  body: string
): Promise<EmailSendResult> {
  if (!isEmailConfigured()) {
    return {
      success: false,
      error: "Email not configured. Set RESEND_API_KEY environment variable.",
    };
  }

  const from = ENV.resendFromEmail || "Vigora Saúde <onboarding@resend.dev>";

  try {
    const response = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ENV.resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        text: body,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMsg =
        (errorData as any)?.message ||
        `HTTP ${response.status}: ${response.statusText}`;
      console.error(`[Email] Failed to send to ${to}:`, errorMsg);
      return { success: false, error: errorMsg };
    }

    const data = (await response.json()) as any;
    const messageId = data?.id;
    console.log(`[Email] Message sent to ${to}, ID: ${messageId}`);
    return { success: true, messageId };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[Email] Network error sending to ${to}:`, errorMsg);
    return { success: false, error: errorMsg };
  }
}

/**
 * Send emergency alert email to multiple contacts.
 */
export async function sendEmergencyEmailAlerts(
  contacts: Array<{ name: string; email: string }>,
  subject: string,
  message: string
): Promise<{
  sent: number;
  failed: number;
  results: Array<{ name: string; email: string; result: EmailSendResult }>;
}> {
  const results: Array<{ name: string; email: string; result: EmailSendResult }> = [];
  let sent = 0;
  let failed = 0;

  for (const contact of contacts) {
    const result = await sendEmail(contact.email, subject, message);
    results.push({ name: contact.name, email: contact.email, result });

    if (result.success) {
      sent++;
    } else {
      failed++;
    }

    // Small delay between emails to avoid rate limiting
    if (contacts.indexOf(contact) < contacts.length - 1) {
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  console.log(`[Email] Emergency alerts: ${sent} sent, ${failed} failed`);
  return { sent, failed, results };
}
