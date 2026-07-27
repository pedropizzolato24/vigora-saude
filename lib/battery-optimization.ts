import { Linking, Platform } from 'react-native';
import { requestIgnoreBatteryOptimizations } from 'expo-alarm-countdown';

/**
 * Pede a isenção de otimização de bateria do Android.
 *
 * OEMs agressivos (Samsung/Xiaomi) matam apps em segundo plano e impedem o
 * alarme de tocar mesmo com AlarmManager exato + foreground service. Isentar o
 * Vigora da otimização resolve.
 *
 * Caminho principal: diálogo direto por-app (REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
 * via módulo próprio expo-alarm-countdown) — a lista genérica da One UI filtra
 * os apps e o Vigora nem aparecia nela (feedback S10). Fallbacks: a lista
 * (IGNORE_BATTERY_OPTIMIZATION_SETTINGS) e a página do próprio app.
 */
export async function openBatteryOptimizationSettings(): Promise<void> {
  if (Platform.OS !== 'android') return;
  const opened = await requestIgnoreBatteryOptimizations();
  if (opened) return;
  try {
    await Linking.sendIntent('android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS');
  } catch {
    // Fallback: página de configurações do próprio app.
    await Linking.openSettings().catch(() => {});
  }
}
