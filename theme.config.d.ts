export const themeColors: {
  primary: { light: string; dark: string };
  background: { light: string; dark: string };
  surface: { light: string; dark: string };
  foreground: { light: string; dark: string };
  muted: { light: string; dark: string };
  border: { light: string; dark: string };
  success: { light: string; dark: string };
  warning: { light: string; dark: string };
  error: { light: string; dark: string };
  emergency: { light: string; dark: string };
  onPrimary: { light: string; dark: string };
  onEmergency: { light: string; dark: string };
  onSuccess: { light: string; dark: string };
  onWarning: { light: string; dark: string };
  primaryLight: { light: string; dark: string };
  emergencyLight: { light: string; dark: string };
  successLight: { light: string; dark: string };
  warningLight: { light: string; dark: string };
  warningDark: { light: string; dark: string };
  emergencyDark: { light: string; dark: string };
  errorLight: { light: string; dark: string };
};

declare const themeConfig: {
  themeColors: typeof themeColors;
};

export default themeConfig;
