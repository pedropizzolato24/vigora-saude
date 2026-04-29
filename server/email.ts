/**
 * email.ts
 *
 * Email sending service using Resend API (https://resend.com).
 * Used as FALLBACK when WhatsApp is not configured or fails.
 *
 * Requires:
 *   RESEND_API_KEY     - API key from resend.com (free tier: 3000 emails/month)
 *   RESEND_FROM_EMAIL  - Sender address (e.g., "alertas@vigora.app")
 *                        Must be a verified domain on Resend.
 *                        If not set, defaults to "onboarding@resend.dev" (Resend sandbox).
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
 * Build a professional HTML email template for emergency alerts.
 */
function buildEmergencyEmailHtml(
  subject: string,
  body: string,
  severity: "info" | "warning" | "alert" = "warning"
): string {
  const colorMap = {
    info: { header: "#1a73e8", badge: "#e8f0fe", badgeText: "#1a73e8", badgeLabel: "AVISO" },
    warning: { header: "#f59e0b", badge: "#fef3c7", badgeText: "#92400e", badgeLabel: "ATENÇÃO" },
    alert: { header: "#dc2626", badge: "#fee2e2", badgeText: "#991b1b", badgeLabel: "ALERTA URGENTE" },
  };
  const colors = colorMap[severity];

  // Convert newlines to <br> for HTML display
  const htmlBody = body
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:560px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background-color:${colors.header};padding:24px 32px;text-align:center;">
              <p style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.3px;">
                ❤️ Vigora Saúde
              </p>
              <p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:13px;">
                Sistema de Monitoramento de Saúde
              </p>
            </td>
          </tr>
          <!-- Badge -->
          <tr>
            <td style="padding:24px 32px 0;text-align:center;">
              <span style="display:inline-block;background-color:${colors.badge};color:${colors.badgeText};font-size:12px;font-weight:700;letter-spacing:1px;padding:4px 12px;border-radius:20px;">
                ${colors.badgeLabel}
              </span>
            </td>
          </tr>
          <!-- Subject -->
          <tr>
            <td style="padding:16px 32px 0;text-align:center;">
              <h1 style="margin:0;color:#111827;font-size:20px;font-weight:700;line-height:1.3;">
                ${subject}
              </h1>
            </td>
          </tr>
          <!-- Divider -->
          <tr>
            <td style="padding:20px 32px 0;">
              <hr style="border:none;border-top:1px solid #e5e7eb;margin:0;">
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:20px 32px;color:#374151;font-size:15px;line-height:1.7;">
              ${htmlBody}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb;">
              <p style="margin:0;color:#6b7280;font-size:12px;text-align:center;line-height:1.6;">
                Esta mensagem foi enviada automaticamente pelo <strong>Vigora Saúde</strong>.<br>
                Não responda a este email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Detect severity level from subject/body text.
 */
function detectSeverity(subject: string, body: string): "info" | "warning" | "alert" {
  const text = (subject + " " + body).toLowerCase();
  if (text.includes("alerta sério") || text.includes("urgente") || text.includes("sos") || text.includes("emergência")) {
    return "alert";
  }
  if (text.includes("preocupação") || text.includes("atenção") || text.includes("aviso")) {
    return "warning";
  }
  return "info";
}

/**
 * Send an email via Resend API with HTML template.
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
  const severity = detectSeverity(subject, body);
  const htmlContent = buildEmergencyEmailHtml(subject, body, severity);

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
        html: htmlContent,
        text: body, // Plain text fallback
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
