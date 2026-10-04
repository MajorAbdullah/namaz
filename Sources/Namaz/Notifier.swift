import Foundation
import UserNotifications

/// Posts prayer notifications to Notification Center.
///
/// These are a companion to the in-app alarm, not the alarm itself: they carry no sound, because
/// the app plays its own, and the alarm still rings if the user has notifications turned off.
@MainActor
final class Notifier: NSObject, UNUserNotificationCenterDelegate {
    private nonisolated static let alarmCategory = "PRAYER_ALARM"
    private static let stopAction = "STOP_ALARM"
    private static let alarmIdentifier = "prayer-alarm"

    /// Called when the user dismisses an alarm from its notification.
    var onStopRequested: (() -> Void)?

    /// Notification Center needs a bundle identity, which is missing when the bare executable is
    /// run outside the .app (as `swift run` does).
    private var center: UNUserNotificationCenter? {
        Bundle.main.bundleIdentifier == nil ? nil : UNUserNotificationCenter.current()
    }

    func start() {
        guard let center else { return }
        center.delegate = self
        let stop = UNNotificationAction(identifier: Self.stopAction, title: "Stop", options: [])
        center.setNotificationCategories([
            UNNotificationCategory(
                identifier: Self.alarmCategory, actions: [stop], intentIdentifiers: [], options: [])
        ])
        center.requestAuthorization(options: [.alert]) { _, _ in }
    }

    func postAlarm(title: String, body: String) {
        post(identifier: Self.alarmIdentifier, title: title, body: body, category: Self.alarmCategory)
    }

    func postReminder(title: String, body: String) {
        post(identifier: "prayer-reminder", title: title, body: body, category: nil)
    }

    /// Takes a stopped alarm's notification off screen.
    func clearAlarm() {
        center?.removeDeliveredNotifications(withIdentifiers: [Self.alarmIdentifier])
    }

    private func post(identifier: String, title: String, body: String, category: String?) {
        guard let center else { return }
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        if let category { content.categoryIdentifier = category }
        // Reusing the identifier replaces the previous notification instead of stacking them.
        center.add(UNNotificationRequest(identifier: identifier, content: content, trigger: nil))
    }

    // MARK: - UNUserNotificationCenterDelegate

    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        // Show the banner even while one of the app's own windows is frontmost.
        completionHandler([.banner, .list])
    }

    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        // Clicking an alarm's notification, or its Stop button, silences the alarm.
        let isAlarm = response.notification.request.content.categoryIdentifier == Self.alarmCategory
        if isAlarm {
            Task { @MainActor in self.onStopRequested?() }
        }
        completionHandler()
    }
}
