/**
 * sms.ts
 *
 * Envio de SMS via Twilio REST API (sem SDK — só `fetch` + Basic auth).
 *
 * O SMS sai JUNTO com o WhatsApp na escalação do dead man's switch, não como
 * fallback: são canais com modos de falha diferentes (o WhatsApp precisa de
 * internet e do app instalado no aparelho do contato; o SMS só de sinal de
 * celular), e um alerta de dead man's switch que não chega a ninguém custa
 * mais caro que a mensagem duplicada.
 *
 * Requer:
 *   TWILIO_ACCOUNT_SID  - Account SID (console do Twilio)
 *   TWILIO_AUTH_TOKEN   - Auth Token
 *   TWILIO_FROM_NUMBER  - número remetente em E.164 (ex.: "+15705590772")
 *
 * Sem as três variáveis o módulo fica inerte (isSmsConfigured() === false) e a
 * escalação segue só no WhatsApp — nunca derruba o alerta.
 *
 * Conta Trial: só entrega para números verificados manualmente no console
 * (erro 21608). Verificar em twilio.com/console/phone-numbers/verified, ou
 * fazer upgrade para conta paga.
 */

import { ENV } from "./_core/env";

const TWILIO_API_BASE = "https://api.twilio.com/2010-04-01";

/**
 * 2 segmentos GSM-7. O texto passa por toGsm7() antes, então 160 chars/segmento
 * (com um emoji ou um acento sobrando a mensagem vira UCS-2 e cai para 70 —
 * o mesmo alerta custaria 4x, por contato, por escalação).
 */
const MAX_SMS_CHARS = 320;

interface SmsSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/** Twilio configurado? Sem isto o canal SMS é simplesmente pulado. */
export function isSmsConfigured(): boolean {
  return !!(ENV.twilioAccountSid && ENV.twilioAuthToken && ENV.twilioFromNumber);
}

/**
 * Normaliza um telefone brasileiro para E.164.
 * Aceita "(11) 99999-9999", "11999999999", "+5511999999999".
 */
function normalizePhoneToE164(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length >= 12) return `+${digits}`;
  return `+55${digits}`;
}

/**
 * Telefone é dado pessoal (LGPD) e log vaza em crash reporter — mesma máscara
 * do whatsapp.ts: só os 4 últimos dígitos sobrevivem.
 */
function maskPhone(e164: string): string {
  return e164.replace(/\d(?=\d{4})/g, "*");
}

/**
 * Dobra o texto para o alfabeto GSM-7 e corta no limite de 2 segmentos.
 *
 * Remove acentos (o GSM-7 não tem á/ã/õ/í/ú/ê/ô) e emoji — qualquer um dos dois
 * força a mensagem inteira para UCS-2, com 70 chars por segmento. Exportado
 * para o teste conseguir travar a regra.
 */
export function toGsm7(text: string): string {
  const folded = text
    .normalize("NFD")
    .replace(/[^\x20-\x7E\n]/g, "")
    .replace(/\n{2,}/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

  if (folded.length <= MAX_SMS_CHARS) return folded;
  const cut = folded.slice(0, MAX_SMS_CHARS - 3);
  const lastSpace = cut.lastIndexOf(" ");
  return `${lastSpace > MAX_SMS_CHARS / 2 ? cut.slice(0, lastSpace) : cut}...`;
}

/** Envia um SMS. Nunca lança — devolve o motivo real da falha. */
export async function sendSms(to: string, message: string): Promise<SmsSendResult> {
  if (!isSmsConfigured()) {
    return {
      success: false,
      error: "SMS não configurado. Defina TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN e TWILIO_FROM_NUMBER.",
    };
  }

  const e164Phone = normalizePhoneToE164(to);
  const masked = maskPhone(e164Phone);

  try {
    const credentials = Buffer.from(
      `${ENV.twilioAccountSid}:${ENV.twilioAuthToken}`
    ).toString("base64");

    const body = new URLSearchParams({
      To: e164Phone,
      From: ENV.twilioFromNumber,
      Body: toGsm7(message),
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
      // Códigos: https://www.twilio.com/docs/api/errors
      const errorCode = data?.code;
      const errorMsg = data?.message || `HTTP ${response.status}: ${response.statusText}`;

      // Trial: número do destinatário não verificado no console.
      if (errorCode === 21608) {
        console.warn(
          `[SMS] Conta Trial: ${masked} não é um número verificado. ` +
            `Verifique em twilio.com/console/phone-numbers/verified ou faça upgrade da conta.`
        );
        return { success: false, error: "Número não verificado na conta Trial do Twilio." };
      }

      console.error(`[SMS] Falha ao enviar para ${masked} (código ${errorCode}):`, errorMsg);
      return { success: false, error: errorMsg };
    }

    console.log(`[SMS] Enviado para ${masked}, SID: ${data?.sid}, status: ${data?.status}`);
    return { success: true, messageId: data?.sid };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[SMS] Erro de rede ao enviar para ${masked}:`, errorMsg);
    return { success: false, error: errorMsg };
  }
}

/**
 * Envia o mesmo alerta por SMS para vários contatos, na ordem recebida.
 * Espelha sendEmergencyAlerts() do whatsapp.ts para o SOS manual.
 */
export async function sendSmsAlerts(
  contacts: Array<{ phone: string; name: string }>,
  message: string
): Promise<{ sent: number; failed: number; results: SmsSendResult[] }> {
  // Sai antes do laço quando o canal não existe: sem isto o SOS pagaria os
  // 500ms de intervalo por contato (até 10s com 20 contatos) só para colecionar
  // o mesmo erro de configuração 20 vezes.
  if (!isSmsConfigured()) {
    const error = "SMS não configurado.";
    return {
      sent: 0,
      failed: contacts.length,
      results: contacts.map(() => ({ success: false, error })),
    };
  }

  const results: SmsSendResult[] = [];
  let sent = 0;
  let failed = 0;

  for (const [i, contact] of contacts.entries()) {
    const result = await sendSms(contact.phone, message);
    results.push(result);
    if (result.success) sent++;
    else failed++;
    // Pequeno intervalo entre mensagens para não bater no rate limit do Twilio.
    if (i < contacts.length - 1) await new Promise((r) => setTimeout(r, 500));
  }

  console.log(`[SMS] Alertas de emergência: ${sent} enviados, ${failed} falharam`);
  return { sent, failed, results };
}
