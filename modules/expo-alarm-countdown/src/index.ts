import { NativeModules, Platform } from 'react-native';

const LINKING_ERROR =
  `The package 'expo-alarm-countdown' doesn't seem to be linked. Make sure: \n\n` +
  Platform.select({ ios: "- You have run 'pod install'\n", default: '' }) +
  '- You rebuilt the app after installing the package\n' +
  '- You are not using Expo Go\n';

const ExpoAlarmCountdown = NativeModules.ExpoAlarmCountdown
  ? NativeModules.ExpoAlarmCountdown
  : new Proxy(
      {},
      {
        get() {
          throw new Error(LINKING_ERROR);
        },
      }
    );

/**
 * Updates the alarm notification text to show the current countdown.
 *
 * Android: Calls NotificationManager.notify(1, ...) with the same channel
 * as expo-alarm-module to update the foreground service notification in-place.
 *
 * iOS: Replaces the existing UNUserNotification with a new one using the
 * same identifier, updating the subtitle with the countdown text.
 *
 * @param title - The notification title (alarm name / medication name)
 * @param secondsLeft - Seconds remaining until escalation
 */
export function updateAlarmNotification(title: string, secondsLeft: number): void {
  if (Platform.OS === 'web') return;
  try {
    ExpoAlarmCountdown.updateAlarmNotification(title, secondsLeft);
  } catch (e) {
    // Silently fail - countdown in notification is a nice-to-have, not critical
    console.warn('[ExpoAlarmCountdown] updateAlarmNotification failed:', e);
  }
}

/**
 * Clears the countdown from the alarm notification, restoring the original text.
 * Call this when the alarm is dismissed.
 *
 * @param title - The notification title to restore
 */
export function clearAlarmNotification(title: string): void {
  if (Platform.OS === 'web') return;
  try {
    ExpoAlarmCountdown.clearAlarmNotification(title);
  } catch (e) {
    console.warn('[ExpoAlarmCountdown] clearAlarmNotification failed:', e);
  }
}

/**
 * Android 12+: whether the app holds the "Alarms & reminders" special access
 * (SCHEDULE_EXACT_ALARM). Always true on other platforms/versions.
 * Fail-open: returns true when the native module is unavailable (Expo Go).
 */
export async function canScheduleExactAlarms(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  try {
    return await ExpoAlarmCountdown.canScheduleExactAlarms();
  } catch {
    return true;
  }
}

/**
 * Android 6+: whether the app is exempt from battery optimization (Doze).
 * OEMs agressivos (Samsung/Xiaomi) matam o app em segundo plano sem isso e o
 * alarme não toca. Always true on other platforms/versions. Fail-open (true)
 * when the native module is unavailable (Expo Go), como canScheduleExactAlarms.
 */
export async function isIgnoringBatteryOptimizations(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  try {
    return await ExpoAlarmCountdown.isIgnoringBatteryOptimizations();
  } catch {
    return true;
  }
}

/**
 * Android 6+: abre o diálogo do sistema de isenção de bateria direto para este
 * app (sem passar pela lista genérica, que na One UI filtra apps e escondia o
 * Vigora). Retorna true se o diálogo foi disparado; false quando indisponível
 * (plataforma/versão/módulo ausente) — o chamador cai para a lista genérica.
 */
export async function requestIgnoreBatteryOptimizations(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  try {
    return (await ExpoAlarmCountdown.requestIgnoreBatteryOptimizations()) === true;
  } catch (e) {
    console.warn('[ExpoAlarmCountdown] requestIgnoreBatteryOptimizations failed:', e);
    return false;
  }
}

/**
 * Android 12+: opens the system "Alarms & reminders" screen for this app.
 * No-op on other platforms/versions.
 */
export async function openExactAlarmSettings(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await ExpoAlarmCountdown.openExactAlarmSettings();
  } catch (e) {
    console.warn('[ExpoAlarmCountdown] openExactAlarmSettings failed:', e);
  }
}

/**
 * Ativa a exibição da tela do alarme por cima da lock screen (Android).
 * Chame ao montar a tela de alarme — escopado a ela, não afeta o resto do
 * app. No-op em outras plataformas.
 */
export async function enterAlarmLockScreenMode(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await ExpoAlarmCountdown.enterAlarmLockScreenMode();
  } catch (e) {
    console.warn('[ExpoAlarmCountdown] enterAlarmLockScreenMode failed:', e);
  }
}

/**
 * Desfaz o enterAlarmLockScreenMode. Se o aparelho ainda estiver bloqueado,
 * devolve o usuário à lock screen em vez da tela inicial do app. Chame ao
 * desmontar a tela de alarme (dismiss, soneca ou navegação para trás).
 */
export async function exitAlarmLockScreenMode(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await ExpoAlarmCountdown.exitAlarmLockScreenMode();
  } catch (e) {
    console.warn('[ExpoAlarmCountdown] exitAlarmLockScreenMode failed:', e);
  }
}

/**
 * Android 14+: whether USE_FULL_SCREEN_INTENT is granted. Sem ela a notificação
 * do alarme cai para heads-up em vez de abrir a tela cheia sozinha. Always true
 * on other platforms/versions. Fail-open (true) when the native module is
 * unavailable (Expo Go), como canScheduleExactAlarms.
 */
export async function canUseFullScreenIntent(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  try {
    return await ExpoAlarmCountdown.canUseFullScreenIntent();
  } catch {
    return true;
  }
}

/**
 * Android 14+: opens the system "Full-screen notifications" screen for this app.
 * No-op on other platforms/versions.
 */
export async function openFullScreenIntentSettings(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await ExpoAlarmCountdown.openFullScreenIntentSettings();
  } catch (e) {
    console.warn('[ExpoAlarmCountdown] openFullScreenIntentSettings failed:', e);
  }
}
