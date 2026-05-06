/**
 * crash-reporter.js
 *
 * Expo Config Plugin that injects a native crash reporter into the Android app:
 *
 * 1. MainApplication.kt → UncaughtExceptionHandler: on any Java crash, writes the
 *    full stack trace to {filesDir}/crash_report.txt before the process dies.
 *
 * 2. MainActivity.kt → onCreate(): before React Native loads, checks for the crash
 *    file from the previous session and shows an AlertDialog with the stack trace.
 *    This works even when the crash happens before JS/React can render.
 */
const { withMainApplication, withMainActivity, createRunOncePlugin } = require('@expo/config-plugins');

// ─── MainApplication: write crash to file ────────────────────────────────────

const MAIN_APP_IMPORTS = `import java.io.File
import java.io.PrintWriter
import java.io.StringWriter`;

const CRASH_HANDLER_INJECTION = `
        // [CrashReporter] Captures uncaught native exceptions before JS loads
        val __prevCrashHandler = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
          try {
            val sw = StringWriter()
            throwable.printStackTrace(PrintWriter(sw))
            val f = File(filesDir, "crash_report.txt")
            f.writeText("Thread: \${thread.name}\\n\\n\${sw}")
          } catch (_: Exception) {}
          __prevCrashHandler?.uncaughtException(thread, throwable)
        }`;

const withCrashHandlerInMainApp = (config) => {
  return withMainApplication(config, (mod) => {
    let src = mod.modResults.contents;

    if (src.includes('[CrashReporter]')) return mod; // idempotent

    // Add imports after the package declaration line
    src = src.replace(
      /^(package .+)(\r?\n)/m,
      `$1$2\n${MAIN_APP_IMPORTS}\n`
    );

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

const MAIN_ACTIVITY_IMPORTS = `import android.app.AlertDialog
import android.os.Bundle
import java.io.File`;

const CRASH_READER_INJECTION = `
  override fun onCreate(savedInstanceState: Bundle?) {
    // [CrashReporter] Show crash from previous session BEFORE React Native loads
    val crashFile = try { File(filesDir, "crash_report.txt") } catch (_: Exception) { null }
    if (crashFile != null && crashFile.exists()) {
      val report = try { crashFile.readText() } catch (_: Exception) { "" }
      if (report.isNotEmpty()) {
        crashFile.delete()
        // Delay dialog slightly so the Activity window is ready
        android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
          try {
            AlertDialog.Builder(this)
              .setTitle("🔴 Crash detectado (sessão anterior)")
              .setMessage(report.take(3000))
              .setPositiveButton("Fechar") { d, _ -> d.dismiss() }
              .setNeutralButton("Compartilhar") { _, _ ->
                val intent = android.content.Intent(android.content.Intent.ACTION_SEND)
                intent.type = "text/plain"
                intent.putExtra(android.content.Intent.EXTRA_TEXT, report)
                startActivity(android.content.Intent.createChooser(intent, "Compartilhar crash"))
              }
              .show()
          } catch (_: Exception) {}
        }, 500)
      }
    }
    super.onCreate(savedInstanceState)
  }
`;

const withCrashReaderInMainActivity = (config) => {
  return withMainActivity(config, (mod) => {
    let src = mod.modResults.contents;

    if (src.includes('[CrashReporter]')) return mod; // idempotent

    // Add imports
    if (!src.includes('import android.app.AlertDialog')) {
      src = src.replace(
        /^(package .+)(\r?\n)/m,
        `$1$2\n${MAIN_ACTIVITY_IMPORTS}\n`
      );
    }

    // Inject onCreate BEFORE the class closing brace, but only if not present
    if (!src.includes('override fun onCreate')) {
      src = src.replace(
        /^(class MainActivity.+?\{)([\s\S]*?)(\})\s*$/m,
        (match, classHead, classBody, closeBrace) => {
          return `${classHead}${classBody}${CRASH_READER_INJECTION}\n${closeBrace}`;
        }
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
