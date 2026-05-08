/**
 * crash-reporter.js
 *
 * Expo Config Plugin that injects a native crash reporter into the Android app:
 *
 * 1. MainApplication.kt → UncaughtExceptionHandler: on any Java crash, writes the
 *    full stack trace to {filesDir}/crash_report.txt before the process dies.
 *
 * 2. MainActivity.kt → reads the crash file BEFORE React Native loads and shows
 *    an AlertDialog with the stack trace. Works even when the crash happens before
 *    JS/React can render.
 */
const { withMainApplication, withMainActivity, createRunOncePlugin } = require('@expo/config-plugins');

// ─── MainApplication: write crash to file ────────────────────────────────────

const CRASH_HANDLER_INJECTION = `
        // [CrashReporter] Captures uncaught native exceptions before JS loads
        val __prevCrashHandler = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
          try {
            val sw = java.io.StringWriter()
            throwable.printStackTrace(java.io.PrintWriter(sw))
            val f = java.io.File(filesDir, "crash_report.txt")
            f.writeText("Thread: \${thread.name}\\n\\n\${sw}")
          } catch (_: Exception) {}
          __prevCrashHandler?.uncaughtException(thread, throwable)
        }`;

const withCrashHandlerInMainApp = (config) => {
  return withMainApplication(config, (mod) => {
    let src = mod.modResults.contents;

    if (src.includes('[CrashReporter]')) return mod; // idempotent

    // Inject crash handler right after super.onCreate()
    src = src.replace(
      /super\.onCreate\(\)/,
      `super.onCreate()${CRASH_HANDLER_INJECTION}`
    );

    mod.modResults.contents = src;
    return mod;
  });
};

// ─── MainActivity: read crash file and show AlertDialog ───────────────────────

// Crash check code using fully-qualified class names to avoid import conflicts
const CRASH_CHECK_CODE = `
        // [CrashReporter] Show crash from previous session BEFORE React Native loads
        try {
          val __crashFile = java.io.File(filesDir, "crash_report.txt")
          if (__crashFile.exists()) {
            val __report = try { __crashFile.readText() } catch (_: Exception) { "" }
            if (__report.isNotEmpty()) {
              __crashFile.delete()
              android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                try {
                  android.app.AlertDialog.Builder(this)
                    .setTitle("Crash detectado (sessão anterior)")
                    .setMessage(__report.take(3000))
                    .setPositiveButton("Fechar") { d, _ -> d.dismiss() }
                    .setNeutralButton("Compartilhar") { _, _ ->
                      val intent = android.content.Intent(android.content.Intent.ACTION_SEND)
                      intent.type = "text/plain"
                      intent.putExtra(android.content.Intent.EXTRA_TEXT, __report)
                      startActivity(android.content.Intent.createChooser(intent, "Compartilhar crash"))
                    }
                    .show()
                } catch (_: Exception) {}
              }, 500)
            }
          }
        } catch (_: Exception) {}
        `;

const withCrashReaderInMainActivity = (config) => {
  return withMainActivity(config, (mod) => {
    let src = mod.modResults.contents;

    if (src.includes('[CrashReporter]')) return mod; // idempotent

    if (src.includes('override fun onCreate')) {
      // onCreate already exists — inject crash check BEFORE super.onCreate(savedInstanceState)
      // Uses a non-greedy match to find the first super.onCreate call inside the file
      src = src.replace(
        /(override fun onCreate\([^)]*\)\s*\{)([\s\S]*?)(super\.onCreate\()/,
        (match, head, body, superCall) => {
          return `${head}${CRASH_CHECK_CODE}${body}${superCall}`;
        }
      );
    } else {
      // No existing onCreate — add one (needs Bundle import)
      // Only add import android.os.Bundle if not already present
      if (!src.includes('import android.os.Bundle')) {
        src = src.replace(
          /^(package .+)(\r?\n)/m,
          `$1$2\nimport android.os.Bundle\n`
        );
      }

      const NEW_ON_CREATE = `
  override fun onCreate(savedInstanceState: Bundle?) {
${CRASH_CHECK_CODE}
    super.onCreate(savedInstanceState)
  }
`;
      // Inject before the last closing brace of the class
      src = src.replace(
        /^(class MainActivity[\s\S]*?)(\})\s*$/m,
        (match, classBody, closeBrace) => `${classBody}${NEW_ON_CREATE}\n${closeBrace}`
      );
    }

    mod.modResults.contents = src;
    return mod;
  });
};

// ─── Compose both plugins ─────────────────────────────────────────────────────

const withNativeCrashReporter = (config) => {
  config = withCrashHandlerInMainApp(config);
  config = withCrashReaderInMainActivity(config);
  return config;
};

module.exports = createRunOncePlugin(
  withNativeCrashReporter,
  'crash-reporter',
  '1.0.0'
);
