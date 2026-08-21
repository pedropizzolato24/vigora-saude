/** @type {const} */
const themeColors = {
  // --- Brand core ---
  // Escuro clareado: como TEXTO sobre o fundo escuro dava 4,48:1. Clarear
  // era proibido enquanto esta cor também era fundo de botão (o branco por
  // cima piorava); com primarySurface assumindo esse papel, ficou livre.
  primary:    { light: '#1E4D8C', dark: '#4E82C8' }, // Azul profundo
  accent:     { light: '#C96442', dark: '#D4784A' }, // Terracota
  background: { light: '#F4EFE5', dark: '#0E1417' }, // Creme / Dark
  surface:    { light: '#FFFFFF', dark: '#1A1714' }, // Branco / Warm dark surface
  bar:        { light: '#EBE2CD', dark: '#151C20' }, // Barras superior/inferior — creme mais escuro puxado pro marrom
  foreground: { light: '#0E1417', dark: '#F4EFE5' }, // Dark / Creme invertido
  muted:      { light: '#5B636A', dark: '#8A9298' }, // Cinza médio
  border:     { light: '#D8D1C2', dark: '#2D2722' }, // Borda quente

  // --- Semantic ---
  // Claro escurecido: com #0F8A4A o branco do onSuccess dava 4,42:1 e o
  // próprio verde COMO TEXTO sobre o creme dava 4,00:1. No tema claro os
  // dois papéis puxam para o mesmo lado, então um valor resolve: agora
  // 5,42:1 com branco por cima e 4,73:1 como texto.
  success:   { light: '#0C7A40', dark: '#2CB966' },
  warning:   { light: '#F0C24A', dark: '#F5D06E' }, // Âmbar
  error:     { light: '#D6161C', dark: '#F04040' },
  emergency: { light: '#D6161C', dark: '#F04040' }, // Dead man's switch — max legibility

  // --- Superfícies de botão -------------------------------------------------
  // No ESCURO a cor de acento e a cor de fundo de botão não podem ser a mesma:
  // para o branco funcionar por cima, ela precisa ser escura (luminância
  // <= 0,1833); para ela ser legível COMO TEXTO sobre o fundo escuro, precisa
  // ser clara (>= 0,2045). A janela é vazia — não existe valor que sirva aos
  // dois papéis. Por isso `primary`/`emergency` seguem sendo o acento (texto e
  // ícone, 30 e 3 usos) e o fundo de botão passa a ser este par, escurecido só
  // no tema escuro. No claro os valores são os mesmos de sempre.
  primarySurface:   { light: '#1E4D8C', dark: '#3F6EAE' }, // branco: 8,42 / 5,18
  emergencySurface: { light: '#D6161C', dark: '#DC3535' }, // branco: 5,26 / 4,56

  // --- On-color (text sobre fundos coloridos) ---
  onPrimary:   { light: '#FFFFFF', dark: '#FFFFFF' },
  onEmergency: { light: '#FFFFFF', dark: '#FFFFFF' },
  // Escuro NÃO é branco: success dark (#2CB966) é um verde claro, e branco
  // sobre ele dá 2,55:1 — reprova até o mínimo de texto grande. Com o quase
  // preto do tema vai a 7,28:1. Vale para "Salvar Perfil", "Compartilhar"
  // e as ações de contato, que são botões de fundo verde.
  onSuccess:   { light: '#FFFFFF', dark: '#0E1417' },
  onWarning:   { light: '#5C3A0A', dark: '#0E1417' },

  // --- Light tints (ghost backgrounds) ---
  primaryLight:   { light: '#1E4D8C15', dark: '#4E82C825' },
  accentLight:    { light: '#C9644215', dark: '#D4784A25' },
  emergencyLight: { light: '#D6161C12', dark: '#F0404020' },
  successLight:   { light: '#0C7A4015', dark: '#2CB96625' },
  warningLight:   { light: '#F0C24A20', dark: '#F5D06E25' },
  errorLight:     { light: '#D6161C12', dark: '#F0404020' },

  // --- Warning dark (text on warning bg) ---
  warningDark: { light: '#7A5200', dark: '#F5D06E' },

  // --- Emergency dark (sombra 3D do SOS / borda inferior) ---
  emergencyDark: { light: '#9E0F14', dark: '#9E0F14' },
};

module.exports = { themeColors };
