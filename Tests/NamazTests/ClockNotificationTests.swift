import AppKit
import Testing
@testable import Namaz

/// The notifications that say the clock has moved. macOS posts some of them, the day change at
/// midnight among them, from a background thread.
@MainActor
@Suite struct ClockNotificationTests {
    @Test func aClockNotificationFromABackgroundThreadDoesNotCrashTheApp() async throws {
        _ = NSApplication.shared
        var diagnostics = Diagnostics()
        diagnostics.isActive = true
        diagnostics.mutesSound = true
        let model = AppModel(diagnostics: diagnostics)
        model.start()

        // Before the fix, this stopped the whole test run: a main-actor closure was entered off
        // the main queue, and Swift trapped on it, as it did in the app at midnight.
        await withCheckedContinuation { done in
            DispatchQueue.global().async {
                NotificationCenter.default.post(name: .NSCalendarDayChanged, object: nil)
                NotificationCenter.default.post(name: .NSSystemClockDidChange, object: nil)
                NotificationCenter.default.post(name: .NSSystemTimeZoneDidChange, object: nil)
                NSWorkspace.shared.notificationCenter.post(name: NSWorkspace.didWakeNotification, object: nil)
                done.resume()
            }
        }
        // Let the main queue take what was posted to it.
        try await Task.sleep(for: .milliseconds(200))
        #expect(model.schedule != nil)
    }
}
