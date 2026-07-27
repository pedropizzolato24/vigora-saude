const {
  withAppBuildGradle,
  withPodfile,
  withAndroidManifest,
  withMainActivity,
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

/**
 * showWhenLocked precisa valer no LANÇAMENTO da activity — é ali que o Android
 * decide se ela desenha por cima do keyguard. Ativar pelo JS (ao montar a tela
 * do alarme) é uma corrida contra o boot do bundle, perdida em cold start: o
 * alarme virava só notificação de forma intermitente.
 *
 * Por isso o flag é aplicado nativamente, em MainActivity.onCreate/onNewIntent,
 * e só quando o launch veio do alarme (deep link vigora://alarm-ring, posto
 * pelo full-screen intent do expo-alarm-module) — mantendo o resto do app
 * sujeito à lock screen. O reset continua em exitAlarmLockScreenMode.
 *
 * O marker serve de guarda de idempotência (prebuild roda sobre o gerado).
 */
const MAIN_ACTIVITY_MARKER = 'vigora-alarm-lockscreen';

const ALARM_LOCK_SCREEN_METHODS = `
  // ${MAIN_ACTIVITY_MARKER} begin (expo-alarm-countdown)
  /**
   * Deixa a activity desenhar por cima do keyguard quando — e somente quando —
   * ela foi lançada pelo alarme. Chamado antes de super.onCreate para o flag já
   * valer na criação da janela.
   */
  private fun applyAlarmLockScreenFlag(launchIntent: Intent?) {
    val isAlarmLaunch = launchIntent?.data?.toString()?.contains("alarm-ring") == true
    if (!isAlarmLaunch) return
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
    } else {
      window.addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED)
    }
  }

  override fun onNewIntent(intent: Intent) {
    applyAlarmLockScreenFlag(intent)
    super.onNewIntent(intent)
  }
  // ${MAIN_ACTIVITY_MARKER} end
`;

const withAlarmLockScreenMainActivity = (config) => {
  return withMainActivity(config, (mod) => {
    if (mod.modResults.language !== 'kt') {
      throw new Error(
        `expo-alarm-countdown: MainActivity em '${mod.modResults.language}' não suportada — esperado Kotlin (kt).`
      );
    }

    let src = mod.modResults.contents;
    if (src.includes(MAIN_ACTIVITY_MARKER)) return mod;

    // Cada replace é verificado: se o template do prebuild mudar e um âncora
    // não casar, falhamos o build em vez de gerar um APK onde o alarme volta
    // a ser intermitente.
    const inject = (pattern, replacement, what) => {
      const next = src.replace(pattern, replacement);
      if (next === src) {
        throw new Error(
          `expo-alarm-countdown: não encontrei ${what} em MainActivity — o template do prebuild mudou e o alarme na tela de bloqueio quebraria silenciosamente.`
        );
      }
      src = next;
    };

    inject(
      /^import android\.os\.Build$/m,
      'import android.content.Intent\nimport android.os.Build\nimport android.view.WindowManager',
      'o import android.os.Build'
    );

    inject(
      /class MainActivity : ReactActivity\(\) \{\n/,
      (m) => `${m}${ALARM_LOCK_SCREEN_METHODS}`,
      'a declaração da classe MainActivity'
    );

    inject(
      /override fun onCreate\(savedInstanceState: Bundle\?\) \{\n/,
      (m) => `${m}    applyAlarmLockScreenFlag(intent)\n`,
      'a abertura de onCreate'
    );

    mod.modResults.contents = src;
    return mod;
  });
};

const withExpoAlarmCountdown = (config) => {
  config = withAndroidModule(config);
  config = withAndroidSettings(config);
  config = withLockScreenAlarm(config);
  config = withAlarmLockScreenMainActivity(config);
  return config;
};

module.exports = createRunOncePlugin(
  withExpoAlarmCountdown,
  'expo-alarm-countdown',
  '1.0.0'
);
