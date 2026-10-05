/**
 * oem-battery-hint.ts
 *
 * Passo extra por fabricante para a isenção de otimização de bateria. A tela
 * padrão do sistema resolve em Motorola/Pixel/stock, mas Samsung e Xiaomi têm
 * listas próprias que ainda fecham o app se não forem ajustadas — e juntos
 * cobrem a maior parte da base brasileira.
 *
 * O texto NÃO cita a marca ("no seu Samsung"): o público 60+ não faz essa
 * associação, e o passo já só aparece em quem tem o aparelho. Os nomes de tela
 * ("Cuidado do dispositivo") ficam — é o que ele precisa achar. Devolve passos
 * soltos, sem número: quem os junta aos passos básicos (lib/permission-texts.ts)
 * e a tela é que numeram.
 *
 * Função pura (sem React Native) para ficar testável; o chamador passa
 * `Platform.constants.Manufacturer`.
 *
 * ponytail: cobre os 2 OEMs dominantes no Brasil; ampliar se surgir demanda.
 */
export function oemBatteryHint(manufacturer: string): string[] | null {
  const m = manufacturer.trim().toLowerCase();
  if (!m) return null;
  if (m.includes("samsung")) {
    return [
      'Este celular pede mais um ajuste. Abra as Configurações e toque em "Cuidado do dispositivo" › "Bateria".',
      'Se o Vigora estiver na lista "Apps em suspensão", tire-o de lá.',
    ];
  }
  if (["xiaomi", "redmi", "poco"].some((brand) => m.includes(brand))) {
    return [
      "Este celular pede mais um ajuste. Abra as Configurações e procure o Vigora na lista de apps.",
      'Nas configurações do Vigora, ligue "Iniciar automaticamente".',
    ];
  }
  return null;
}
