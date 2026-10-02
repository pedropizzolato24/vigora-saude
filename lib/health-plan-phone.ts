/**
 * health-plan-phone.ts
 *
 * Telefone de emergência do plano de saúde (o que a tela Ambulância disca).
 * Era o "Número do plano" — o número da CARTEIRINHA — o que o app tentava
 * discar. Só dígitos, de 8 (4004-xxxx) a 13 (+55 DDD 9xxxx-xxxx).
 */
export const PLAN_PHONE_MIN = 8;
export const PLAN_PHONE_MAX = 13;

export function sanitizePlanPhone(input: string): string {
  return input.replace(/\D/g, '').slice(0, PLAN_PHONE_MAX);
}

export function isValidPlanPhone(digits: string | undefined | null): boolean {
  return (
    !!digits &&
    /^\d+$/.test(digits) &&
    digits.length >= PLAN_PHONE_MIN &&
    digits.length <= PLAN_PHONE_MAX
  );
}
