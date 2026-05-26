// lib/checkin-defaults.ts
/**
 * Defaults para as configurações de check-in diário.
 * Exportado separadamente para permitir teste unitário sem dependências nativas.
 */
export const checkinDefaults = {
  checkinEnabled: false,
  checkinTime: '09:00',        // HH:mm
  checkinWindowMinutes: 30,    // Minutos que o usuário tem para responder
} as const;
