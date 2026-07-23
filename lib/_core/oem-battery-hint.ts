/**
 * oem-battery-hint.ts
 *
 * Passo extra por fabricante para a isenção de otimização de bateria. A tela
 * padrão do Android (IGNORE_BATTERY_OPTIMIZATION_SETTINGS) resolve em
 * Motorola/Pixel/stock, mas Samsung e Xiaomi têm listas próprias que ainda
 * matam o app em segundo plano se não forem ajustadas — e juntos cobrem a
 * maior parte da base brasileira.
 *
 * Função pura (sem React Native) para ficar testável; o chamador passa
 * `Platform.constants.Manufacturer`.
 *
 * ponytail: cobre os 2 OEMs dominantes no Brasil; ampliar se surgir demanda.
 */
export function oemBatteryHint(manufacturer: string): string | null {
  const m = manufacturer.trim().toLowerCase();
  if (!m) return null;
  if (m.includes("samsung")) {
    return 'Depois, no seu Samsung, abra "Cuidado do dispositivo" › "Bateria" e remova o Vigora de "Apps em suspensão".';
  }
  if (["xiaomi", "redmi", "poco"].some((brand) => m.includes(brand))) {
    return 'Depois, no seu Xiaomi/Redmi, ative "Iniciar automaticamente" (Autostart) para o Vigora nas configurações do app.';
  }
  return null;
}
