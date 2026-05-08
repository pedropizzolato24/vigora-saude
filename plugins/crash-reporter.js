/**
 * crash-reporter.js
 *
 * Expo Config Plugin — native crash reporter for Android.
 *
 * Strategy:
 * 1. MainApplication.onCreate(): installs Thread.UncaughtExceptionHandler
 *    that writes the full Java stack trace to {filesDir}/crash_report.txt.
 *
 * 2. MainActivity.onCreate() BEFORE super.onCreate(): reads the crash file
 *    from the previous session and posts a HIGH-priority notification with
 *    the stack trace embedded in the body. The notification persists in the
 *    tray even after the app crashes again — so the user can read/share it
 *    without needing ADB or the app to stay open.
 *
 * Why notification instead of AlertDialog:
 * - AlertDialog needs a window (only available after super.onCreate())
 * - super.onCreate() is where the crash happens (native module loading)
 * - The notification is posted BEFORE the crash and survives process death
 */
const { withMainApplication, withMainActivity, createRunOncePlugin } = require('@expo/config-plugins');

// ─── MainApplication: write crash to file ────────────────────────────────────

const MAIN_APP_CRASH_HANDLER = `
        // [CrashReporter] Captures uncaught Java exceptions before process dies
        val __prevHandler = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
          try {
            val sw = java.io.StringWriter()
            throwable.printStackTrace(java.io.PrintWriter(sw))
            java.io.File(filesDir, "crash_report.txt")
              .writeText("Thread: \${thread.name}\\n\\n\${sw}")
          } catch (_: Exception) {}
          __prevHandler?.uncaughtException(thread, throwable)
        }`;

const withCrashHandlerInMainApp = (config) => {
  return withMainApplication(config, (mod) => {
    let src = mod.modResults.contents;
    if (src.includes('[CrashReporter]')) return mod;
    // Inject BEFORE super.onCreate() so crashes inside super.onCreate() are caught.
    // filesDir path is OS-assigned at process start and is safe before super.onCreate().
    src = src.replace(
      /super\.onCreate\(\)/,
      `${MAIN_APP_CRASH_HANDLER}\n        super.onCreate()`
    );
    mod.modResults.contents = src;
    return mod;
  });
};

// ─── MainActivity: show crash as notification (survives process death) ────────

// Uses fully-qualified class names — no imports needed, avoids conflicts.
const CRASH_NOTIFICATION_CODE = `
        // [CrashReporter] Show crash from previous session as a persistent notification
        // Runs BEFORE super.onCreate() so it fires even if React Native crashes on init.
        try {
          val __cf = java.io.File(filesDir, "crash_report.txt")
          if (__cf.exists()) {
            val __report = try { __cf.readText() } catch (_: Exception) { "" }
            if (__report.isNotEmpty()) {
              // Keep the file — don't delete yet (user may reopen app multiple times)
              val __nm = getSystemService("notification") as android.app.NotificationManager
              val __ch = android.app.NotificationChannel(
                "vigora_crash", "Crash Reporter",
                android.app.NotificationManager.IMPORTANCE_HIGH
              )
              __nm.createNotificationChannel(__ch)
              // Build share PendingIntent so user can share without opening app
              val __shareIntent = android.content.Intent(android.content.Intent.ACTION_SEND).apply {
                type = "text/plain"
                putExtra(android.content.Intent.EXTRA_TEXT, __report)
              }
              val __pi = android.app.PendingIntent.getActivity(
                this, 0,
                android.content.Intent.createChooser(__shareIntent, "Compartilhar crash"),
                android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE
              )
              val __notif = android.app.Notification.Builder(this, "vigora_crash")
                .setSmallIcon(android.R.drawable.ic_dialog_alert)
                .setContentTitle("🔴 Crash capturado — toque para compartilhar")
                .setStyle(android.app.Notification.BigTextStyle()
                  .bigText(__report.take(2000)))
                .setContentIntent(__pi)
                .setAutoCancel(true)
                .build()
              __nm.notify(88877, __notif)
              // Also delete after posting so it only appears once per crash
              __cf.delete()
            }
          }
        } catch (_: Exception) {}
        `;

const withCrashNotificationInMainActivity = (config) => {
  return withMainActivity(config, (mod) => {
    let src = mod.modResults.contents;
    if (src.includes('[CrashReporter]')) return mod;

    if (src.includes('override fun onCreate')) {
      // Inject BEFORE the existing super.onCreate() call
      src = src.replace(
        /(override fun onCreate\([^)]*\)\s*\{)([\s\S]*?)(super\.onCreate\()/,
        (_, head, body, superCall) => `${head}${CRASH_NOTIFICATION_CODE}${body}${superCall}`
      );
    } else {
      // No existing onCreate — add one that only needs android.os.Bundle
      // Add Bundle import only if missing
      if (!src.includes('import android.os.Bundle')) {
        src = src.replace(/^(package .+)(\r?\n)/m, `$1$2\nimport android.os.Bundle\n`);
      }
      const NEW_ON_CREATE = `
  override fun onCreate(savedInstanceState: Bundle?) {
${CRASH_NOTIFICATION_CODE}
    super.onCreate(savedInstanceState)
  }
`;
      src = src.replace(
        /^(class MainActivity[\s\S]*?)(\})\s*$/m,
        (_, body, close) => `${body}${NEW_ON_CREATE}\n${close}`
      );
    }

    mod.modResults.contents = src;
    return mod;
  });
};

// ─── Compose ──────────────────────────────────────────────────────────────────

const withNativeCrashReporter = (config) => {
  config = withCrashHandlerInMainApp(config);
  config = withCrashNotificationInMainActivity(config);
  return config;
};

module.exports = createRunOncePlugin(withNativeCrashReporter, 'crash-reporter', '1.0.0');
