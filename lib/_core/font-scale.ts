/**
 * Escala de tipografia e de alvos de toque — sem dependência de UI.
 * Usado pelo `FontSizeProvider` (lib/font-size-context.tsx).
 */

export const SCALE_FACTORS = {
  small: 0.85,
  medium: 1.0,
  large: 1.2,
} as const;

export type FontSizeKey = keyof typeof SCALE_FACTORS;

/** Tamanhos base (na escala "medium") por papel de texto. */
export const BASE_SIZES = {
  xs: 11,
  sm: 13,
  base: 15,
  md: 16,
  lg: 18,
  xl: 20,
  '2xl': 22,
  '3xl': 26,
  '4xl': 32,
} as const;

/** Piso absoluto de alvo de toque (regra de acessibilidade do app). */
export const MIN_TOUCH = 44;

/**
 * Altura mínima de um alvo de toque (botão, input, chip) para uma escala.
 *
 * O mínimo deixa de ser um número único para todo o app e passa a ser um por
 * escala: sem isso o texto encolhia/crescia mas a caixa ficava parada, e telas
 * com botão dimensionado por padding escalavam enquanto telas com altura fixa
 * não. O piso de 44px continua valendo em qualquer escala.
 */
export function touchTargetFor(base: number, scale: number): number {
  return Math.max(MIN_TOUCH, Math.round(base * scale));
}
