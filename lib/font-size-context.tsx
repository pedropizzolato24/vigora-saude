import React, { createContext, useContext, useMemo } from 'react';
import { useAppContext } from '@/lib/app-context';
import { BASE_SIZES, SCALE_FACTORS, touchTargetFor } from '@/lib/_core/font-scale';

export type { FontSizeKey } from '@/lib/_core/font-scale';

// --- Scaled Font Sizes ------------------------------------------------------

export type ScaledFontSizes = {
  scale: number;
  xs: number;
  sm: number;
  base: number;
  md: number;
  lg: number;
  xl: number;
  '2xl': number;
  '3xl': number;
  '4xl': number;
  /** Apply scale to any arbitrary font size */
  scaled: (size: number) => number;
  /**
   * Altura mínima de um alvo de toque (botão, input, chip) NA ESCALA ATUAL.
   * O mínimo deixa de ser um número único para todo o app e passa a ser um por
   * escala: sem isso o texto encolhia/crescia mas a caixa ficava parada, e
   * telas com botão dimensionado por padding escalavam enquanto telas com
   * altura fixa não. O piso de 44px continua valendo em qualquer escala.
   */
  touch: (base: number) => number;
};

// --- Context ----------------------------------------------------------------

const FontSizeContext = createContext<ScaledFontSizes | null>(null);

export function FontSizeProvider({ children }: { children: React.ReactNode }) {
  const { state } = useAppContext();
  const fontSizePref = state.settings.fontSize ?? 'medium';
  const factor = SCALE_FACTORS[fontSizePref] ?? 1;

  const sizes = useMemo<ScaledFontSizes>(() => {
    const result: Record<string, number | ((s: number) => number)> = {
      scale: factor,
      scaled: (size: number) => Math.round(size * factor),
      touch: (base: number) => touchTargetFor(base, factor),
    };
    for (const [key, base] of Object.entries(BASE_SIZES)) {
      result[key] = Math.round(base * factor);
    }
    return result as unknown as ScaledFontSizes;
  }, [factor]);

  return (
    <FontSizeContext.Provider value={sizes}>
      {children}
    </FontSizeContext.Provider>
  );
}

export function useFontSize(): ScaledFontSizes {
  const ctx = useContext(FontSizeContext);
  if (!ctx) throw new Error('useFontSize must be used within FontSizeProvider');
  return ctx;
}
