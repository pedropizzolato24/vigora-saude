// Load environment variables with proper priority (system > .env)
import "./scripts/load-env.js";
import { existsSync } from "node:fs";
import type { ExpoConfig } from "expo/config";
import type { WithAndroidWidgetsParams } from 'react-native-android-widget';

const env = {
  appName: "Vigora",
  appSlug: "vigora-saude",
  logoUrl: "https://d2xsxph8kpxj0f.cloudfront.net/310519663569609351/2NcFSGrjcrdoYA2iMiwXwr/vigora-icon-new-miARvjxqHnMmn9xV9ybs5e.png",
  scheme: "vigora",
  iosBundleId: "com.vigora.saude",
  androidPackage: "com.vigora.saude",
};

// Host for Universal Links (iOS) / App Links (Android) used by caregiver
// share-invite links (https://<host>/convite/<token>). Set EXPO_PUBLIC_LINK_HOST
// to the domain serving /.well-known/{apple-app-site-association,assetlinks.json}.
// When unset, only the custom scheme (vigora://) deep links are registered.
const linkHost = process.env.EXPO_PUBLIC_LINK_HOST?.trim() || undefined;

// Sign in with Apple exige conta Apple Developer paga (a capability/entitlement
// não é provisionável com Apple ID gratuito). Mantemos DESLIGADO por padrão
// para que builds de dev (sideload re-assinado com conta grátis) não levem o
// entitlement com.apple.developer.applesignin — que faria a re-assinatura
// falhar/ser removida. Ligue (EXPO_PUBLIC_APPLE_SIGNIN_ENABLED=true) só no
// build de produção, quando a conta paga já tiver a capability ativa.
const appleSignIn = process.env.EXPO_PUBLIC_APPLE_SIGNIN_ENABLED === "true";

// FCM (Firebase Cloud Messaging) — OBRIGATÓRIO para push no Android fora do
// Expo Go. Sem o google-services.json, getExpoPushTokenAsync() lança, o token
// do cuidador nunca é registrado e o push de alarme perdido não sai (o evento
// ainda vira 'missed' e o WhatsApp ainda é enviado — só o push some).
// O arquivo NÃO vai no git (contém o sender id do projeto Firebase): local via
// ./google-services.json, CI via secret escrito nesse caminho antes do prebuild.
// Ausente ⇒ campo omitido, para o prebuild não quebrar em quem não o tem.
const googleServicesFile =
  process.env.GOOGLE_SERVICES_JSON?.trim() || "./google-services.json";
const hasGoogleServices = existsSync(googleServicesFile);
if (!hasGoogleServices) {
  console.warn(
    `[app.config] ${googleServicesFile} ausente — o build Android NÃO terá push (FCM). Ver docs/claude/alarmes.md.`
  );
}

const config: ExpoConfig = {
  name: env.appName,
  slug: env.appSlug,
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  // Array: "vigora" para deep links do app; o package (com.vigora.saude) é o
  // scheme que o expo-auth-session usa no redirect do Google
  // (`${applicationId}:/oauthredirect`) — sem ele o login não volta pro app.
  scheme: [env.scheme, env.androidPackage],
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  ios: {
    supportsTablet: true,
    bundleIdentifier: env.iosBundleId,
    // Sign in with Apple — obrigatório pela diretriz 4.8 da App Store quando o
    // app oferece login social de terceiros (Google). Gera o entitlement
    // com.apple.developer.applesignin (requer capability no App ID + conta paga).
    // Só é ligado em produção via EXPO_PUBLIC_APPLE_SIGNIN_ENABLED=true.
    ...(appleSignIn ? { usesAppleSignIn: true } : {}),
    ...(linkHost ? { associatedDomains: [`applinks:${linkHost}`] } : {}),
    // Critical Alerts — aprovado pela Apple em 12/08/2026 para o alarme de
    // medicação (pedido em docs/ios-critical-alerts-request.md). É o que
    // permite o alarme furar o silencioso físico e o Foco/Não Perturbe; sem o
    // entitlement o iOS ignora `allowCriticalAlerts` e `interruptionLevel:
    // 'critical'` em silêncio. A capability precisa seguir habilitada no App
    // ID, senão o build de produção falha na assinatura.
    "entitlements": {
      "com.apple.developer.usernotifications.critical-alerts": true,
      // AlarmKit (iOS 26+) — o expo-alarm-kit compartilha estado entre o app e
      // o intent de dismiss, que roda fora do processo do app, por App Group.
      // Sem ele, `configure()` retorna false e o dismiss não é registrado.
      "com.apple.security.application-groups": ["group.com.vigora.saude.alarms"]
    },
    "infoPlist": {
      "ITSAppUsesNonExemptEncryption": false,
      // AlarmKit (iOS 26+) — exigido para pedir a permissão de alarmes.
      "NSAlarmKitUsageDescription":
        "O Vigora usa alarmes do celular para o lembrete de remédio tocar na hora certa, mesmo no silencioso."
    }
  },
  android: {
    adaptiveIcon: {
      backgroundColor: "#0033CC",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
    package: env.androidPackage,
    ...(hasGoogleServices ? { googleServicesFile } : {}),
    permissions: [
      "POST_NOTIFICATIONS",
      "SCHEDULE_EXACT_ALARM",
      "USE_FULL_SCREEN_INTENT",
      // Exigida a partir do targetSdk 35 para o android:turnScreenOn da
      // MainActivity — sem ela o alarme não acende a tela do aparelho.
      "TURN_SCREEN_ON",
      "VIBRATE",
      "WAKE_LOCK",
      // Diálogo direto de isenção de bateria (dead man's switch: sem a isenção,
      // OEMs agressivos matam o app e o alarme não toca). A lista genérica da
      // One UI filtra os apps e o Vigora nem aparecia nela (S10).
      "REQUEST_IGNORE_BATTERY_OPTIMIZATIONS",
      "ACCESS_FINE_LOCATION",
      "ACCESS_COARSE_LOCATION",
      "ACCESS_BACKGROUND_LOCATION",
      "FOREGROUND_SERVICE",
      "FOREGROUND_SERVICE_LOCATION",
      "com.android.vending.BILLING"
    ],
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: true,
        data: [
          {
            scheme: env.scheme,
            host: "*",
          },
        ],
        category: ["BROWSABLE", "DEFAULT"],
      },
      // https App Link for caregiver share invites (verified via assetlinks.json
      // on the host). Only added when EXPO_PUBLIC_LINK_HOST is configured.
      ...(linkHost
        ? [
          {
            action: "VIEW",
            autoVerify: true,
            data: [{ scheme: "https", host: linkHost, pathPrefix: "/convite" }],
            category: ["BROWSABLE", "DEFAULT"],
          },
        ]
        : []),
    ],
  },
  web: {
    bundler: "metro",
    output: "static",
    favicon: "./assets/images/favicon.png",
  },
  plugins: [
    "expo-router",
    "expo-font",
    "expo-web-browser",
    // Sem isto o Android 11+ esconde os navegadores do aparelho e o login
    // Google não abre em quem não tem Chrome ativo (ver o plugin).
    "./plugins/with-browser-queries.js",
    [
      // Login Google pelo Play Services (sem navegador). Passar opções ativa o
      // modo "sem Firebase": só registra o URL scheme no iOS, não mexe no
      // Gradle do Android — o módulo nativo entra por autolinking.
      "@react-native-google-signin/google-signin",
      {
        iosUrlScheme:
          "com.googleusercontent.apps.39705729598-0q57pbi4hmfd231rkbld2ftgh9eqcidg",
      },
    ],
    // Plugin do Apple Sign In só entra quando habilitado (mesma razão do
    // usesAppleSignIn acima) — evita o entitlement em builds de dev.
    ...(appleSignIn ? ["expo-apple-authentication"] : []),
    [
      'react-native-android-widget',
      {
        widgets: [
          {
            name: 'NextAlarm',
            label: 'Próximo Alarme',
            description: 'Mostra o próximo alarme de medicamento',
            minWidth: '180dp',
            minHeight: '110dp',
            resizeMode: 'horizontal|vertical',
            updatePeriodMillis: 1800000, // 30 min (mínimo permitido pelo Android)
          },
          {
            name: 'Sos',
            label: 'SOS Emergência',
            description: 'Botão de emergência rápida',
            minWidth: '110dp',
            minHeight: '110dp',
            resizeMode: 'none',
          },
          {
            name: 'Health',
            label: 'Saúde',
            description: 'Métricas de saúde: freq. cardíaca, pressão e glicemia',
            minWidth: '250dp',
            minHeight: '130dp',
            resizeMode: 'horizontal|vertical',
            updatePeriodMillis: 1800000, // 30 min
          },
        ],
      } satisfies WithAndroidWidgetsParams,
    ],
    "expo-alarm-module",
    "./modules/expo-alarm-countdown/app.plugin.js",
    [
      "expo-notifications",
      {
        // Ícone dedicado de notificação (glifo branco em transparência) — sem
        // ele o Android usa o ic_launcher adaptativo, que vira quadrado cinza.
        "icon": "./assets/images/android-icon-monochrome.png",
        "color": "#0033CC",
        // alarm.mp3 entra na lista só para o plugin copiá-lo para o bundle iOS:
        // o AlertSound.named do AlarmKit lê do main bundle, com a extensão.
        "sounds": ["./assets/alarm_notification.wav", "./assets/alarm.mp3"],
        "defaultChannel": "default"
      }
    ],
    [
      "expo-contacts",
      {
        contactsPermission: "Permitir que o Vigora acesse seus contatos para importar contatos de emergência."
      }
    ],
    [
      "expo-local-authentication",
      {
        faceIDPermission: "Permitir que o Vigora use o Face ID para desbloquear o aplicativo."
      }
    ],
    [
      "expo-location",
      {
        locationAlwaysAndWhenInUsePermission: "Permitir que o Vigora acesse sua localização para compartilhar em emergências.",
        locationAlwaysPermission: "Permitir que o Vigora acesse sua localização mesmo em segundo plano, para enviar sua posição em emergências.",
        locationWhenInUsePermission: "Permitir que o Vigora acesse sua localização para compartilhar em emergências.",
        isAndroidBackgroundLocationEnabled: true,
        isAndroidForegroundServiceEnabled: true
      }
    ],
    [
      "expo-audio",
      {
        microphonePermission: "Allow $(PRODUCT_NAME) to access your microphone.",
      },
    ],
    [
      "expo-splash-screen",
      {
        image: "./assets/images/splash-icon.png",
        imageWidth: 200,
        resizeMode: "contain",
        backgroundColor: "#ffffff",
        dark: {
          backgroundColor: "#000000",
        },
      },
    ],
    [
      "expo-build-properties",
      {
        android: {
          buildArchs: ["armeabi-v7a", "arm64-v8a"],
          minSdkVersion: 24,
        },
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    eas: {
      projectId: "f29046eb-38e7-430b-aad2-9ab981f44b5c",
    },
  },
};

export default config;
