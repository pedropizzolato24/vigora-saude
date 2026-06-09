/**
 * AccessibilityContext
 *
 * Provides a global `accessibilityMode` flag that, when enabled, transforms
 * the entire app into a high-contrast, large-font, simplified-layout experience
 * designed for elderly users and those with visual impairments.
 *
 * The flag is persisted via AppContext -> AsyncStorage so it survives app restarts.
 */
import React, { createContext, useContext, useMemo } from 'react';
import { useAppContext } from '@/lib/app-context';

// --- Types -------------------------------------------------------------------

export interface AccessibilityValues {
  /** Whether accessibility mode is currently active */
  isAccessibilityMode: boolean;

  // -- Typography ----------------------------------------------------------
  /** Extra-large font sizes for accessibility mode */
  a11yFontSize: {
    xs: number;
    sm: number;
    base: number;
    md: number;
    lg: number;
    xl: number;
    '2xl': number;
    '3xl': number;
    '4xl': number;
    title: number;
    scaled: (size: number) => number;
  };

  // -- Colors (high-contrast palette) --------------------------------------
  a11yColors: {
    background: string;
    /** Barras superior/inferior — creme mais escuro que o fundo, dá profundidade */
    bar: string;
    surface: string;
    foreground: string;
    muted: string;
    primary: string;
    onPrimary: string;
    border: string;
    emergency: string;
    onEmergency: string;
    success: string;
    warning: string;
    error: string;
    cardBg: string;
    cardBorder: string;
  };

  // -- Spacing --------------------------------------------------------------
  a11ySpacing: {
    /** Minimum touch target height */
    touchTarget: number;
    /** Padding inside buttons */
    buttonPadding: number;
    /** Gap between sections */
    sectionGap: number;
    /** Card border radius */
    cardRadius: number;
  };
}

// --- High-Contrast Palette ---------------------------------------------------
// Segue a linguagem visual atual do app (fundo creme, superfícies brancas,
// azul da marca) mantendo contraste alto. Ações destrutivas usam vermelho —
// nunca a mesma cor dos botões comuns.

const A11Y_COLORS: AccessibilityValues['a11yColors'] = {
  background: '#F4EFE5',
  bar: '#EBE2CD',
  surface: '#FFFFFF',
  foreground: '#14181B',
  muted: '#42494F',
  primary: '#1A4680',
  onPrimary: '#FFFFFF',
  border: '#14181B',
  emergency: '#B5070D',
  onEmergency: '#FFFFFF',
  success: '#0A6B39',
  warning: '#7A5200',
  error: '#B5070D',
  cardBg: '#FFFFFF',
  cardBorder: '#14181B',
};

// --- Accessibility Font Sizes ------------------------------------------------
// All sizes are 1.5× the "large" preset (1.2 × 1.5 = 1.8× base)

const A11Y_FONT_SIZES: AccessibilityValues['a11yFontSize'] = {
  xs: 16,
  sm: 18,
  base: 20,
  md: 22,
  lg: 24,
  xl: 28,
  '2xl': 32,
  '3xl': 38,
  '4xl': 46,
  title: 52,
  scaled: (size: number) => Math.round(size * 1.8),
};

// --- Accessibility Spacing ---------------------------------------------------

const A11Y_SPACING: AccessibilityValues['a11ySpacing'] = {
  touchTarget: 72,
  buttonPadding: 20,
  sectionGap: 20,
  cardRadius: 20,
};

// --- Context -----------------------------------------------------------------

const AccessibilityContext = createContext<AccessibilityValues | null>(null);

export function AccessibilityProvider({ children }: { children: React.ReactNode }) {
  const { state } = useAppContext();
  const isAccessibilityMode = (state.settings as any).accessibilityMode === true;

  const value = useMemo<AccessibilityValues>(
    () => ({
      isAccessibilityMode,
      a11yFontSize: A11Y_FONT_SIZES,
      a11yColors: A11Y_COLORS,
      a11ySpacing: A11Y_SPACING,
    }),
    [isAccessibilityMode]
  );

  return (
    <AccessibilityContext.Provider value={value}>
      {children}
    </AccessibilityContext.Provider>
  );
}

export function useAccessibility(): AccessibilityValues {
  const ctx = useContext(AccessibilityContext);
  if (!ctx) throw new Error('useAccessibility must be used within AccessibilityProvider');
  return ctx;
}
