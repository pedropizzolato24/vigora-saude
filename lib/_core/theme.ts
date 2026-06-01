import { Platform } from "react-native";

import themeConfig from "@/theme.config";

export type ColorScheme = "light" | "dark";

export const ThemeColors = themeConfig.themeColors;

type ThemeColorTokens = typeof ThemeColors;
type ThemeColorName = keyof ThemeColorTokens;
type SchemePalette = Record<ColorScheme, Record<ThemeColorName, string>>;
type SchemePaletteItem = SchemePalette[ColorScheme];

function buildSchemePalette(colors: ThemeColorTokens): SchemePalette {
  const palette: SchemePalette = {
    light: {} as SchemePalette["light"],
    dark: {} as SchemePalette["dark"],
  };

  (Object.keys(colors) as ThemeColorName[]).forEach((name) => {
    const swatch = colors[name];
    palette.light[name] = swatch.light;
    palette.dark[name] = swatch.dark;
  });

  return palette;
}

export const SchemeColors = buildSchemePalette(ThemeColors);

type RuntimePalette = SchemePaletteItem & {
  text: string;
  background: string;
  tint: string;
  icon: string;
  tabIconDefault: string;
  tabIconSelected: string;
  border: string;
  onPrimary: string;
  onEmergency: string;
  onSuccess: string;
  onWarning: string;
  primaryLight: string;
  accentLight: string;
  emergencyLight: string;
  successLight: string;
  warningLight: string;
  warningDark: string;
  errorLight: string;
  accent: string;
};

// Brand accent colors — defined here directly because the JS config
// cannot propagate literal key types through TypeScript inference.
const BRAND_ACCENT = {
  light: '#C96442',
  dark:  '#D4784A',
} as const;
const BRAND_ACCENT_LIGHT = {
  light: '#C9644215',
  dark:  '#D4784A25',
} as const;

function buildRuntimePalette(scheme: ColorScheme): RuntimePalette {
  const base = SchemeColors[scheme];
  return {
    ...base,
    text: base.foreground,
    background: base.background,
    tint: base.primary,
    icon: base.muted,
    tabIconDefault: base.muted,
    tabIconSelected: base.primary,
    border: base.border,
    onPrimary: base.onPrimary,
    onEmergency: base.onEmergency,
    onSuccess: base.onSuccess,
    onWarning: base.onWarning,
    primaryLight: base.primaryLight,
    emergencyLight: base.emergencyLight,
    successLight: base.successLight,
    warningLight: base.warningLight,
    warningDark: base.warningDark,
    errorLight: base.errorLight,
    accent: BRAND_ACCENT[scheme],
    accentLight: BRAND_ACCENT_LIGHT[scheme],
  };
}

export const Colors = {
  light: buildRuntimePalette("light"),
  dark: buildRuntimePalette("dark"),
} satisfies Record<ColorScheme, RuntimePalette>;

export type ThemeColorPalette = (typeof Colors)[ColorScheme];

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: "system-ui",
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: "ui-serif",
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: "ui-rounded",
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: "ui-monospace",
  },
  default: {
    sans: "normal",
    serif: "serif",
    rounded: "normal",
    mono: "monospace",
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});

/**
 * Brand typefaces — load via expo-font before use.
 * display: Fraunces italic — headlines, wordmark, hero text.
 * body:    Plus Jakarta Sans — all UI text, labels, buttons.
 * mono:    Space Mono — timestamps, health data readouts.
 */
export const BrandFonts = {
  display: "Fraunces-Italic",
  body: "PlusJakartaSans",
  monoRegular: "SpaceMono-Regular",
  monoBold: "SpaceMono-Bold",
} as const;
