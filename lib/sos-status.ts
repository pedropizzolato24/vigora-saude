/**
 * sos-status.ts
 *
 * Regras puras da tela do SOS: estado dos contatos a partir do resultado REAL
 * da escalação, e os textos que não podem prometer o que o app não faz.
 *
 * O resultado de `escalateSOSToContacts` é agregado (contagens): não diz qual
 * contato foi alcançado. Por isso há o estado `partial` — dizer "enviado" para
 * um contato específico sem saber seria repetir a mentira que a tela tinha
 * (status simulado por timer).
 */
import type { EmergencyContact } from '@/lib/app-context';
import type { EscalationResult } from '@/lib/alarm-escalation';

export const SOS_CALL_NUMBER = '192';

/**
 * A voz do SOS. O app NÃO liga para o SAMU: quem liga é o usuário, tocando no
 * botão (o app nunca se integra ao 192 — linha vermelha da ANVISA).
 */
export const SOS_SPOKEN_CONFIRMATION =
  'Avisando suas pessoas. Para chamar o SAMU, toque no botão vermelho.';

/** Sem nenhum contato com WhatsApp ninguém é avisado: a voz não pode dizer que sim. */
export const SOS_SPOKEN_NO_CONTACTS =
  'Você não tem contatos cadastrados para avisar. Use o botão para ligar 192 se precisar.';

export function sosSpokenText(whatsappCount: number): string {
  return whatsappCount === 0 ? SOS_SPOKEN_NO_CONTACTS : SOS_SPOKEN_CONFIRMATION;
}

export type SosContactStatus = 'sending' | 'sent' | 'partial' | 'failed' | 'opened' | 'no_whatsapp';

export function sosContactStatus(
  contact: EmergencyContact,
  whatsappContactCount: number,
  result: EscalationResult | null
): SosContactStatus {
  if (!contact.whatsapp) return 'no_whatsapp';
  if (result === null) return 'sending';
  // Só o que o servidor enviou conta como avisado: o deep link apenas abre o
  // WhatsApp com a mensagem pronta, e o usuário ainda precisa tocar em enviar.
  if (result.serverApiSent >= whatsappContactCount) return 'sent';
  if (result.serverApiSent > 0) return 'partial';
  if (result.deepLinkSent > 0) return 'opened';
  return 'failed';
}

export function sosSummary(
  whatsappContactCount: number,
  result: EscalationResult | null
): string | null {
  if (whatsappContactCount === 0) return null;
  if (result === null) return 'Enviando os avisos…';
  if (result.serverApiSent <= 0 && result.deepLinkSent > 0) {
    return 'WhatsApp aberto: toque em enviar para avisar';
  }
  const reached = Math.min(result.serverApiSent, whatsappContactCount);
  return `${reached} de ${whatsappContactCount} contato(s) avisado(s)`;
}

/** Resultado de falha total, para quando a escalação lança. */
export function emptyEscalation(contactCount: number): EscalationResult {
  return {
    method: 'none',
    deepLinkSent: 0,
    deepLinkFailed: 0,
    serverApiSent: 0,
    serverApiFailed: 0,
    totalSent: 0,
    totalFailed: contactCount,
  };
}
