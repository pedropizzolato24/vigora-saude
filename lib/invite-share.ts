/**
 * invite-share.ts
 *
 * Texto do convite de cuidador para o compartilhamento do celular (WhatsApp,
 * SMS, e-mail). O código vale 10 minutos desde que foi gerado: o texto diz
 * quanto AINDA resta, não um prazo fixo que já pode ter passado.
 */

/** "ABCDEF" -> "ABC-DEF". */
export function formatInviteCode(code: string): string {
  return code.length === 6 ? `${code.slice(0, 3)}-${code.slice(3)}` : code;
}

export function buildInviteShareText(code: string, secondsLeft: number): string {
  const minutes = Math.max(1, Math.ceil(secondsLeft / 60));
  const unit = minutes === 1 ? 'minuto' : 'minutos';
  return (
    `Meu código do Vigora é ${formatInviteCode(code)}. ` +
    `Ele vale por mais ${minutes} ${unit}. ` +
    'Abra o app Vigora, entre como cuidador e digite o código.'
  );
}
