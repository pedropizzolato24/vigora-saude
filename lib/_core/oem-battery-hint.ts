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
 * ("Cuidado do dispositivo") ficam — é o que ele precisa achar. Continua a
 * numeração dos passos do aviso (1 e 2 estão em lib/permissions-check.ts).
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
    return 'Neste celular tem mais um passo:\n3. Abra "Cuidado do dispositivo" › "Bateria" e tire o Vigora da lista "Apps em suspensão"';
  }
  if (["xiaomi", "redmi", "poco"].some((brand) => m.includes(brand))) {
    return 'Neste celular tem mais um passo:\n3. Nas configurações do Vigora, ligue "Iniciar automaticamente"';
  }
  return null;
}
