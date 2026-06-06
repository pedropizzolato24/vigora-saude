/** @type {const} */
const themeColors = {
  // --- Brand core ---
  primary:    { light: '#1E4D8C', dark: '#4A7EC4' }, // Azul profundo
  accent:     { light: '#C96442', dark: '#D4784A' }, // Terracota
  background: { light: '#F4EFE5', dark: '#0E1417' }, // Creme / Dark
  surface:    { light: '#FFFFFF', dark: '#1A1714' }, // Branco / Warm dark surface
  foreground: { light: '#0E1417', dark: '#F4EFE5' }, // Dark / Creme invertido
  muted:      { light: '#5B636A', dark: '#8A9298' }, // Cinza médio
  border:     { light: '#D8D1C2', dark: '#2D2722' }, // Borda quente

  // --- Semantic ---
  success:   { light: '#0F8A4A', dark: '#2CB966' },
  warning:   { light: '#F0C24A', dark: '#F5D06E' }, // Âmbar
  error:     { light: '#D6161C', dark: '#F04040' },
  emergency: { light: '#D6161C', dark: '#F04040' }, // Dead man's switch — max legibility

  // --- On-color (text sobre fundos coloridos) ---
  onPrimary:   { light: '#FFFFFF', dark: '#FFFFFF' },
  onEmergency: { light: '#FFFFFF', dark: '#FFFFFF' },
  onSuccess:   { light: '#FFFFFF', dark: '#FFFFFF' },
  onWarning:   { light: '#5C3A0A', dark: '#0E1417' },

  // --- Light tints (ghost backgrounds) ---
  primaryLight:   { light: '#1E4D8C15', dark: '#4A7EC425' },
  accentLight:    { light: '#C9644215', dark: '#D4784A25' },
  emergencyLight: { light: '#D6161C12', dark: '#F0404020' },
  successLight:   { light: '#0F8A4A15', dark: '#2CB96625' },
  warningLight:   { light: '#F0C24A20', dark: '#F5D06E25' },
  errorLight:     { light: '#D6161C12', dark: '#F0404020' },

  // --- Warning dark (text on warning bg) ---
  warningDark: { light: '#7A5200', dark: '#F5D06E' },

  // --- Emergency dark (sombra 3D do SOS / borda inferior) ---
  emergencyDark: { light: '#9E0F14', dark: '#9E0F14' },
};

module.exports = { themeColors };
