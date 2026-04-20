import Foundation
import UserNotifications

/**
 * ExpoAlarmCountdown — iOS Native Module
 *
 * Updates the alarm notification to show a live countdown timer.
 *
 * iOS Strategy:
 * - expo-alarm-module on iOS uses UNUserNotificationCenter to schedule notifications.
 * - When the alarm fires and the app is in foreground, expo-alarm-module shows a UIAlertController.
 * - We add/replace a persistent UNNotificationRequest with identifier "vigora-alarm-countdown"
 *   to show the countdown in the notification center (lock screen / notification tray).
 * - Each call to updateAlarmNotification replaces the previous request with updated text.
 * - clearAlarmNotification removes the countdown notification from the notification center.
 *
 * Note: iOS does not allow updating an existing delivered notification's text in-place
 * (unlike Android's NotificationManager.notify). The workaround is to add a new
 * UNNotificationRequest with the same identifier — iOS replaces the pending/delivered
 * notification with the new content.
 */
@objc(ExpoAlarmCountdown)
class ExpoAlarmCountdown: NSObject {

    static let countdownNotificationId = "vigora-alarm-countdown"

    /**
     * Updates the alarm notification with the current countdown text.
     *
     * @param title - Alarm/medication name
     * @param secondsLeft - Seconds remaining until escalation
     */
    @objc
    func updateAlarmNotification(_ title: String, secondsLeft: Int) {
        let center = UNUserNotificationCenter.current()

        let minutes = secondsLeft / 60
        let seconds = secondsLeft % 60
        let countdownText: String
        if minutes > 0 {
            countdownText = "Responda em \(minutes)m \(seconds)s para evitar escalação"
        } else {
            countdownText = "Responda em \(seconds)s para evitar escalação"
        }

        let content = UNMutableNotificationContent()
        content.title = title
        content.body = countdownText
        content.sound = nil  // No sound on updates — avoid spamming
        content.interruptionLevel = .timeSensitive

        // Use nil trigger = deliver immediately
        let request = UNNotificationRequest(
            identifier: ExpoAlarmCountdown.countdownNotificationId,
            content: content,
            trigger: nil
        )

        center.add(request) { error in
            if let error = error {
                print("[ExpoAlarmCountdown] updateAlarmNotification error: \(error.localizedDescription)")
            }
        }
    }

    /**
     * Removes the countdown notification from the notification center.
     * Call this when the alarm is dismissed.
     */
    @objc
    func clearAlarmNotification(_ title: String) {
        let center = UNUserNotificationCenter.current()
        center.removeDeliveredNotifications(withIdentifiers: [ExpoAlarmCountdown.countdownNotificationId])
        center.removePendingNotificationRequests(withIdentifiers: [ExpoAlarmCountdown.countdownNotificationId])
    }

    @objc
    static func requiresMainQueueSetup() -> Bool {
        return false
    }
}
