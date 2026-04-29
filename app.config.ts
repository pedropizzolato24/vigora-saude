// Load environment variables with proper priority (system > .env)
import "./scripts/load-env.js";
import type { ExpoConfig } from "expo/config";
import type { WithAndroidWidgetsParams } from 'react-native-android-widget';

// Bundle ID format: space.manus.<project_name_dots>.<timestamp>
// e.g., "my-app" created at 2024-01-15 10:30:45 -> "space.manus.my.app.t20240115103045"
// Bundle ID can only contain letters, numbers, and dots
// Android requires each dot-separated segment to start with a letter
const rawBundleId = "space.manus.vigora.saude.t20260417141411";
const bundleId =
  rawBundleId
    .replace(/[-_]/g, ".") // Replace hyphens/underscores with dots
    .replace(/[^a-zA-Z0-9.]/g, "") // Remove invalid chars
    .replace(/\.+/g, ".") // Collapse consecutive dots
    .replace(/^\.+|\.+$/g, "") // Trim leading/trailing dots
    .toLowerCase()
    .split(".")
    .map((segment) => {
      // Android requires each segment to start with a letter
      // Prefix with 'x' if segment starts with a digit
      return /^[a-zA-Z]/.test(segment) ? segment : "x" + segment;
    })
    .join(".") || "space.manus.app";
// Extract timestamp from bundle ID and prefix with "manus" for deep link scheme
// e.g., "space.manus.my.app.t20240115103045" -> "manus20240115103045"
const timestamp = bundleId.split(".").pop()?.replace(/^t/, "") ?? "";
const schemeFromBundleId = `manus${timestamp}`;

const env = {
  // App branding - update these values directly (do not use env vars)
  appName: "Vigora Saúde",
  appSlug: "vigora-saude",
  // S3 URL of the app logo - set this to the URL returned by generate_image when creating custom logo
  logoUrl: "https://d2xsxph8kpxj0f.cloudfront.net/310519663569609351/2NcFSGrjcrdoYA2iMiwXwr/vigora-icon-new-miARvjxqHnMmn9xV9ybs5e.png",
  scheme: schemeFromBundleId,
  iosBundleId: bundleId,
  androidPackage: bundleId,
};

const config: ExpoConfig = {
  name: env.appName,
  slug: env.appSlug,
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: env.scheme,
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  ios: {
    supportsTablet: true,
    bundleIdentifier: env.iosBundleId,
    "infoPlist": {
        "ITSAppUsesNonExemptEncryption": false
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
    permissions: [
      "POST_NOTIFICATIONS",
      "SCHEDULE_EXACT_ALARM",
      "USE_FULL_SCREEN_INTENT",
      "VIBRATE",
      "WAKE_LOCK",
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
    ],
  },
  web: {
    bundler: "metro",
    output: "static",
    favicon: "./assets/images/favicon.png",
  },
  plugins: [
    "expo-router",
    "expo-dev-client",
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
        "sounds": ["./assets/alarm_notification.wav"],
        "defaultChannel": "default"
      }
    ],
    [
      "expo-contacts",
      {
        contactsPermission: "Permitir que o Vigora Saúde acesse seus contatos para importar contatos de emergência."
      }
    ],
    [
      "expo-location",
      {
        locationAlwaysAndWhenInUsePermission: "Permitir que o Vigora Saúde acesse sua localização para compartilhar em emergências.",
        locationAlwaysPermission: "Permitir que o Vigora Saúde acesse sua localização mesmo em segundo plano, para enviar sua posição em emergências.",
        locationWhenInUsePermission: "Permitir que o Vigora Saúde acesse sua localização para compartilhar em emergências.",
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
      "expo-video",
      {
        supportsBackgroundPlayback: true,
        supportsPictureInPicture: true,
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
          minSdkVersion: 24,
          ndkVersion: "26.1.10909125",
        },
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
};

export default config;
