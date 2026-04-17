import React, { createContext, useContext, useMemo } from 'react';
import { useAppContext } from '@/lib/app-context';

// ─── Scale Factors ──────────────────────────────────────────────────────────

const SCALE_FACTORS = {
  small: 0.85,
  medium: 1.0,
  large: 1.2,
} as const;

export type FontSizeKey = 'small' | 'medium' | 'large';

// ─── Scaled Font Sizes ──────────────────────────────────────────────────────
// Base sizes (at "medium") for common text roles

const BASE_SIZES = {
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
};

// ─── Context ────────────────────────────────────────────────────────────────

const FontSizeContext = createContext<ScaledFontSizes | null>(null);

export function FontSizeProvider({ children }: { children: React.ReactNode }) {
  const { state } = useAppContext();
  const fontSizePref = state.settings.fontSize ?? 'medium';
  const factor = SCALE_FACTORS[fontSizePref] ?? 1;

  const sizes = useMemo<ScaledFontSizes>(() => {
    const result: Record<string, number | ((s: number) => number)> = {
      scale: factor,
      scaled: (size: number) => Math.round(size * factor),
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
