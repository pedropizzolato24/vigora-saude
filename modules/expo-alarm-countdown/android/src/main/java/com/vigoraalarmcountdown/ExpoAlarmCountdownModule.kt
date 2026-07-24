package com.vigoraalarmcountdown

import android.app.AlarmManager
import android.app.KeyguardManager
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import android.view.WindowManager
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * ExpoAlarmCountdownModule
 *
 * Native Android module that updates the alarm foreground-service notification
 * (created by expo-alarm-module) in real time to show a countdown timer.
 *
 * Strategy:
 * - expo-alarm-module calls startForeground(1, notification) with channel "expo-alarm-module"
 * - We call NotificationManager.notify(1, updatedNotification) using the SAME channel ID and
 *   notification ID to replace the notification text in-place, without flickering.
 * - The foreground service keeps running — we only update the visible text.
 *
 * This avoids the need to modify expo-alarm-module source code.
 */
class ExpoAlarmCountdownModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "ExpoAlarmCountdown"
        // Must match expo-alarm-module's notification ID (startForeground(1, ...))
        const val ALARM_NOTIFICATION_ID = 1
        // Must match expo-alarm-module's channel ID (strings.xml: notification_channel_id)
        const val ALARM_CHANNEL_ID = "expo-alarm-module"
    }

    override fun getName(): String = NAME

    /**
     * Updates the alarm notification text to show the countdown.
     *
     * @param title - Alarm/medication name shown as notification title
     * @param secondsLeft - Seconds remaining until escalation
     */
    @ReactMethod
    fun updateAlarmNotification(title: String, secondsLeft: Int) {
        try {
            val context = reactContext.applicationContext
            val notificationManager =
                context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

            val minutes = secondsLeft / 60
            val seconds = secondsLeft % 60
            val countdownText = if (minutes > 0) {
                "Responda em ${minutes}m ${seconds}s para evitar escalação"
            } else {
                "Responda em ${seconds}s para evitar escalação"
            }

            val notification = buildNotification(context, title, countdownText, ongoing = true)
            notificationManager.notify(ALARM_NOTIFICATION_ID, notification)
        } catch (e: Exception) {
            // Silently fail — countdown in notification is a nice-to-have
            android.util.Log.w(NAME, "updateAlarmNotification failed: ${e.message}")
        }
    }

    /**
     * Clears the countdown from the alarm notification (call on dismiss).
     *
     * @param title - Alarm/medication name
     */
    @ReactMethod
    fun clearAlarmNotification(title: String) {
        try {
            val context = reactContext.applicationContext
            val notificationManager =
                context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

            val notification = buildNotification(
                context,
                title,
                "Toque para abrir o Vigora",
                ongoing = false
            )
            notificationManager.notify(ALARM_NOTIFICATION_ID, notification)
        } catch (e: Exception) {
            android.util.Log.w(NAME, "clearAlarmNotification failed: ${e.message}")
        }
    }

    /**
     * Whether the app can schedule exact alarms (Android 12+: permissão
     * "Alarmes e lembretes"). Always true below API 31.
     */
    @ReactMethod
    fun canScheduleExactAlarms(promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val alarmManager =
                    reactContext.getSystemService(Context.ALARM_SERVICE) as AlarmManager
                promise.resolve(alarmManager.canScheduleExactAlarms())
            } else {
                promise.resolve(true)
            }
        } catch (e: Exception) {
            // Fail-open: se não dá para checar, não incomoda o usuário
            promise.resolve(true)
        }
    }

    /**
     * Whether the app is exempt from battery optimization (Doze/App Standby).
     * OEMs agressivos (Samsung/Xiaomi) matam o app em segundo plano sem isso e o
     * alarme não toca. Always true below API 23 (no such restriction).
     */
    @ReactMethod
    fun isIgnoringBatteryOptimizations(promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                val powerManager =
                    reactContext.getSystemService(Context.POWER_SERVICE) as PowerManager
                promise.resolve(
                    powerManager.isIgnoringBatteryOptimizations(reactContext.packageName)
                )
            } else {
                promise.resolve(true)
            }
        } catch (e: Exception) {
            // Fail-open: se não dá para checar, não incomoda o usuário
            promise.resolve(true)
        }
    }

    /**
     * Opens the system "Alarms & reminders" screen for THIS app (Android 12+).
     */
    @ReactMethod
    fun openExactAlarmSettings(promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val intent = Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM).apply {
                    data = Uri.parse("package:${reactContext.packageName}")
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                reactContext.startActivity(intent)
            }
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("open_settings_failed", e.message, e)
        }
    }

    /**
     * Android 14+ (API 34): whether USE_FULL_SCREEN_INTENT is granted. Deixou de
     * ser auto-concedida no install para apps fora da categoria alarme/chamada
     * da Play Store — sem ela a notificação do alarme cai para heads-up em vez de
     * abrir a tela cheia sozinha (o diferencial do dead man's switch). Sempre true
     * abaixo do 34, onde a permissão é concedida no install.
     */
    @ReactMethod
    fun canUseFullScreenIntent(promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                promise.resolve(NotificationManagerCompat.from(reactContext).canUseFullScreenIntent())
            } else {
                promise.resolve(true)
            }
        } catch (e: Exception) {
            // Fail-open: se não dá para checar, não incomoda o usuário
            promise.resolve(true)
        }
    }

    /**
     * Opens the system "Full-screen notifications" screen for THIS app (Android 14+).
     */
    @ReactMethod
    fun openFullScreenIntentSettings(promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                val intent = Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT).apply {
                    data = Uri.parse("package:${reactContext.packageName}")
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                reactContext.startActivity(intent)
            }
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("open_settings_failed", e.message, e)
        }
    }

    /**
     * Ativa a exibição da Activity atual por cima da lock screen. Chamado ao
     * montar a tela de alarme — escopado a ela (via setShowWhenLocked em
     * runtime, não um flag fixo no manifesto) para que o resto do app
     * continue respeitando a lock screen normalmente.
     */
    @ReactMethod
    fun enterAlarmLockScreenMode(promise: Promise) {
        try {
            val activity = reactContext.currentActivity
            if (activity != null) {
                activity.runOnUiThread {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
                        activity.setShowWhenLocked(true)
                    } else {
                        activity.window.addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED)
                    }
                }
            }
            promise.resolve(null)
        } catch (e: Exception) {
            promise.resolve(null)
        }
    }

    /**
     * Desfaz o enterAlarmLockScreenMode. Se o aparelho ainda estiver
     * bloqueado, manda a Activity para trás — o usuário volta para a lock
     * screen real em vez da tela inicial do app.
     */
    @ReactMethod
    fun exitAlarmLockScreenMode(promise: Promise) {
        try {
            val activity = reactContext.currentActivity
            if (activity != null) {
                activity.runOnUiThread {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
                        activity.setShowWhenLocked(false)
                    } else {
                        activity.window.clearFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED)
                    }
                    val keyguardManager =
                        activity.getSystemService(Context.KEYGUARD_SERVICE) as? KeyguardManager
                    if (keyguardManager?.isKeyguardLocked == true) {
                        activity.moveTaskToBack(true)
                    }
                }
            }
            promise.resolve(null)
        } catch (e: Exception) {
            promise.resolve(null)
        }
    }

    private fun buildNotification(
        context: Context,
        title: String,
        text: String,
        ongoing: Boolean
    ): android.app.Notification {
        val res = context.resources
        val packageName = context.packageName

        // Ícone dedicado de notificação (glifo branco); fallback pro launcher
        val smallIconResId = res.getIdentifier("notification_icon", "drawable", packageName)
            .takeIf { it != 0 }
            ?: res.getIdentifier("ic_launcher", "mipmap", packageName)
                .takeIf { it != 0 } ?: android.R.drawable.ic_dialog_info

        val builder = NotificationCompat.Builder(context, ALARM_CHANNEL_ID)
            .setSmallIcon(smallIconResId)
            .setContentTitle(title)
            .setContentText(text)
            .setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setOngoing(ongoing)
            .setOnlyAlertOnce(true)   // Don't re-play sound on every update
            .setSound(null)
            .setVibrate(null)

        // Large icon (app launcher bitmap)
        val largeIconResId = res.getIdentifier("ic_launcher", "mipmap", packageName)
        if (largeIconResId != 0) {
            val largeIconBitmap: Bitmap? =
                BitmapFactory.decodeResource(res, largeIconResId)
            if (largeIconBitmap != null) {
                builder.setLargeIcon(largeIconBitmap)
            }
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            builder.color = android.graphics.Color.parseColor("#0033CC")
        }

        return builder.build()
    }
}
