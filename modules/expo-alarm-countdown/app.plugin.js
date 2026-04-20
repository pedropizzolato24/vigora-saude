const { withAppBuildGradle, withPodfile, createRunOncePlugin } = require('@expo/config-plugins');

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

const withExpoAlarmCountdown = (config) => {
  config = withAndroidModule(config);
  config = withAndroidSettings(config);
  return config;
};

module.exports = createRunOncePlugin(
  withExpoAlarmCountdown,
  'expo-alarm-countdown',
  '1.0.0'
);
