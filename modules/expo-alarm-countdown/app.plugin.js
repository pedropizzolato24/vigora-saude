const {
  withAppBuildGradle,
  withPodfile,
  withAndroidManifest,
  AndroidConfig,
  createRunOncePlugin,
} = require('@expo/config-plugins');

/**
 * Expo Config Plugin for expo-alarm-countdown
 *
 * Android: Adds the local module to android/settings.gradle and android/app/build.gradle
 * iOS: The podspec is picked up automatically by CocoaPods via the local path in package.json
 */

const withAndroidModule = (config) => {
  return withAppBuildGradle(config, (mod) => {
    const buildGradle = mod.modResults.contents;

    // Add the local module as a dependency if not already present
    if (!buildGradle.includes('expo-alarm-countdown')) {
      mod.modResults.contents = buildGradle.replace(
        /dependencies\s*\{/,
        `dependencies {\n    implementation project(':expo-alarm-countdown')`
      );
    }

    return mod;
  });
};

const withAndroidSettings = (config) => {
  const { withSettingsGradle } = require('@expo/config-plugins');
  return withSettingsGradle(config, (mod) => {
    const settings = mod.modResults.contents;

    if (!settings.includes('expo-alarm-countdown')) {
      mod.modResults.contents =
        settings +
        `\ninclude ':expo-alarm-countdown'\nproject(':expo-alarm-countdown').projectDir = new File(rootProject.projectDir, '../modules/expo-alarm-countdown/android')\n`;
    }

    return mod;
  });
};

/**
 * O alvo do setFullScreenIntent do alarme é a MainActivity (app de activity
 * única do Expo Router). Sem turnScreenOn o Android até lança a activity
 * quando o alarme toca, mas a tela não acende — o idoso só veria algo ao
 * apertar o botão de energia.
 *
 * turnScreenOn não tem implicação de segurança (só acende a tela; exige
 * TURN_SCREEN_ON no targetSdk 35+), por isso fica fixo no manifesto.
 * showWhenLocked (desenhar por cima da lock screen) NÃO entra aqui de
 * propósito — é ativado em runtime só enquanto a tela de alarme está
 * montada (native-alarm-manager / alarm-ring.tsx via
 * enterAlarmLockScreenMode/exitAlarmLockScreenMode). Fixar no manifesto
 * faria o app inteiro ignorar a lock screen do sistema sempre que aberto
 * com o aparelho bloqueado (qualquer notificação, não só o alarme).
 */
const withLockScreenAlarm = (config) => {
  return withAndroidManifest(config, (mod) => {
    const activity = AndroidConfig.Manifest.getMainActivityOrThrow(mod.modResults);
    activity.$['android:turnScreenOn'] = 'true';
    return mod;
  });
};

const withExpoAlarmCountdown = (config) => {
  config = withAndroidModule(config);
  config = withAndroidSettings(config);
  config = withLockScreenAlarm(config);
  return config;
};

module.exports = createRunOncePlugin(
  withExpoAlarmCountdown,
  'expo-alarm-countdown',
  '1.0.0'
);
