import { ENV } from "./_core/env";

/**
 * WhatsApp Business API integration via Meta Cloud API.
 *
 * This module sends messages through the official WhatsApp Business API.
 * It requires:
 * 1. A Meta Business account with WhatsApp Business API access
 * 2. A verified WhatsApp Business phone number
 * 3. An API access token (permanent or system user token)
 * 4. The phone number ID from Meta Business Manager
 *
 * Messages are sent from the registered business number, not the user's personal number.
 * This is used as a FALLBACK when the user cannot send messages via deep link
 * (e.g., user is unconscious, app is in background, or deep link failed).
 */

const WHATSAPP_API_BASE = "https://graph.facebook.com/v21.0";

interface WhatsAppSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Check if WhatsApp Business API is configured.
 */
export function isWhatsAppApiConfigured(): boolean {
  return !!(ENV.whatsappApiToken && ENV.whatsappPhoneNumberId);
}

/**
 * Send a text message via WhatsApp Business API (Meta Cloud API).
 *
 * @param to - Phone number in international format (e.g., "5511999998888")
 * @param message - Text message to send
 * @returns Result with success status and message ID or error
 */
export async function sendWhatsAppMessage(
  to: string,
  message: string
): Promise<WhatsAppSendResult> {
  if (!isWhatsAppApiConfigured()) {
    return {
      success: false,
      error: "WhatsApp Business API not configured. Set WHATSAPP_API_TOKEN and WHATSAPP_PHONE_NUMBER_ID.",
    };
  }

  // Ensure phone number is in correct format (digits only, with country code)
  const cleanPhone = to.replace(/\D/g, "");
  const fullPhone = cleanPhone.length <= 11 ? `55${cleanPhone}` : cleanPhone;

  try {
    const response = await fetch(
      `${WHATSAPP_API_BASE}/${ENV.whatsappPhoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ENV.whatsappApiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: fullPhone,
          type: "text",
          text: {
            preview_url: true,
            body: message,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMsg =
        (errorData as any)?.error?.message ||
        `HTTP ${response.status}: ${response.statusText}`;
      console.error(`[WhatsApp API] Failed to send to ${fullPhone}:`, errorMsg);
      return { success: false, error: errorMsg };
    }

    const data = (await response.json()) as any;
    const messageId = data?.messages?.[0]?.id;
    console.log(`[WhatsApp API] Message sent to ${fullPhone}, ID: ${messageId}`);
    return { success: true, messageId };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[WhatsApp API] Network error sending to ${fullPhone}:`, errorMsg);
    return { success: false, error: errorMsg };
  }
}

/**
 * Send a login OTP via an approved WhatsApp *authentication template*.
 *
 * Business-initiated messages outside the 24h service window MUST use a
 * pre-approved template — plain text (sendWhatsAppMessage) won't deliver.
 * Create an "authentication" category template in Meta Business Manager
 * (with the copy-code button) and set WHATSAPP_OTP_TEMPLATE_NAME to its name.
 *
 * @param to - Digits-only phone with country code (e.g. "5551999998888")
 * @param code - The 6-digit OTP (fills the template's body + button params)
 */
export async function sendWhatsAppAuthCode(
  to: string,
  code: string
): Promise<WhatsAppSendResult> {
  const templateName = process.env.WHATSAPP_OTP_TEMPLATE_NAME ?? "";
  if (!isWhatsAppApiConfigured() || !templateName) {
    return {
      success: false,
      error:
        "WhatsApp OTP not configured. Set WHATSAPP_API_TOKEN, WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_OTP_TEMPLATE_NAME.",
    };
  }

  try {
    const response = await fetch(
      `${WHATSAPP_API_BASE}/${ENV.whatsappPhoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ENV.whatsappApiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to,
          type: "template",
          template: {
            name: templateName,
            language: { code: "pt_BR" },
            components: [
              {
                type: "body",
                parameters: [{ type: "text", text: code }],
              },
              {
                type: "button",
                sub_type: "url",
                index: "0",
                parameters: [{ type: "text", text: code }],
              },
            ],
          },
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMsg =
        (errorData as any)?.error?.message ||
        `HTTP ${response.status}: ${response.statusText}`;
      // Não logamos o número (dado pessoal) — só o motivo da falha.
      console.error(`[WhatsApp API] Failed to send OTP:`, errorMsg);
      return { success: false, error: errorMsg };
    }

    const data = (await response.json()) as any;
    return { success: true, messageId: data?.messages?.[0]?.id };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[WhatsApp API] Network error sending OTP:`, errorMsg);
    return { success: false, error: errorMsg };
  }
}

/**
 * Send emergency alert to multiple contacts via WhatsApp Business API.
 *
 * @param contacts - Array of { phone, name } objects
 * @param message - The emergency message to send
 * @returns Summary of send results
 */
export async function sendEmergencyAlerts(
  contacts: Array<{ phone: string; name: string }>,
  message: string
): Promise<{
  sent: number;
  failed: number;
  results: Array<{ name: string; phone: string; result: WhatsAppSendResult }>;
}> {
  const results: Array<{ name: string; phone: string; result: WhatsAppSendResult }> = [];
  let sent = 0;
  let failed = 0;

  for (const contact of contacts) {
    const result = await sendWhatsAppMessage(contact.phone, message);
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

  console.log(`[WhatsApp API] Emergency alerts: ${sent} sent, ${failed} failed`);
  return { sent, failed, results };
}
