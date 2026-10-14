/**
 * health-plan-phone.ts
 *
 * Telefone de emergência do plano de saúde (o que a tela Ambulância disca).
 * Era o "Número do plano" — o número da CARTEIRINHA — o que o app tentava
 * discar. Só dígitos, número nacional: de 8 (4004-xxxx) a 11 (DDD 9xxxx-xxxx
 * ou 0800). O "55" do país é descartado ("tel:5511..." seria lido como DDD 55).
 */
export const PLAN_PHONE_MIN = 8;
export const PLAN_PHONE_MAX = 11;
/** Cabe um número colado com +55 antes de normalizar. */
const PLAN_PHONE_RAW_MAX = 13;

export function sanitizePlanPhone(input: string): string {
  const digits = input.replace(/\D/g, '').slice(0, PLAN_PHONE_RAW_MAX);
  return (digits.length === 12 || digits.length === 13) && digits.startsWith('55')
    ? digits.slice(2)
    : digits;
}

export function isValidPlanPhone(digits: string | undefined | null): boolean {
  return (
    !!digits &&
    /^\d+$/.test(digits) &&
    digits.length >= PLAN_PHONE_MIN &&
    digits.length <= PLAN_PHONE_MAX
  );
}
