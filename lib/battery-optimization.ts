import { Linking, Platform } from 'react-native';

/**
 * Abre as configurações de otimização de bateria do Android.
 *
 * OEMs agressivos (Samsung/Xiaomi) matam apps em segundo plano e impedem o
 * alarme de tocar mesmo com AlarmManager exato + foreground service. Isentar o
 * Vigora da otimização resolve. Usa Linking.sendIntent do core do RN — sem dep
 * nova e sem permission especial (abre a lista de apps).
 *
 * ponytail: abre a LISTA (IGNORE_BATTERY_OPTIMIZATION_SETTINGS); o diálogo
 * direto por-app (REQUEST_IGNORE_BATTERY_OPTIMIZATIONS) exige setData(package:)
 * que o sendIntent não passa — trocar por expo-intent-launcher se a UX exigir.
 */
export async function openBatteryOptimizationSettings(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await Linking.sendIntent('android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS');
  } catch {
    // Fallback: página de configurações do próprio app.
    await Linking.openSettings().catch(() => {});
  }
}
