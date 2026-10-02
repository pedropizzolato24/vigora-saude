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

export type SosContactStatus = 'sending' | 'sent' | 'partial' | 'failed' | 'no_whatsapp';

export function sosContactStatus(
  contact: EmergencyContact,
  whatsappContactCount: number,
  result: EscalationResult | null
): SosContactStatus {
  if (!contact.whatsapp) return 'no_whatsapp';
  if (result === null) return 'sending';
  if (result.totalSent <= 0) return 'failed';
  if (result.totalSent >= whatsappContactCount) return 'sent';
  return 'partial';
}

export function sosSummary(
  whatsappContactCount: number,
  result: EscalationResult | null
): string | null {
  if (whatsappContactCount === 0) return null;
  if (result === null) return 'Enviando os avisos…';
  const reached = Math.min(result.totalSent, whatsappContactCount);
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
