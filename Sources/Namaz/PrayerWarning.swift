import Foundation
import NamazCore

/// An open prayer that has not been marked as prayed and is close to its deadline.
struct PrayerWarning: Equatable {
    let window: PrayerWindow
    let urgency: Urgency
    /// Past the deadline with time still left to pray, which only Asr can be.
    let isOverdue: Bool

    /// The warning that applies at `now`, if there is one.
    static func current(
        schedule: PrayerSchedule?,
        settings: AppSettings,
        prayed: PrayedLog,
        now: Date,
        timeZone: TimeZone
    ) -> PrayerWarning? {
        guard settings.endOfTimeAlerts, let window = schedule?.window(at: now) else { return nil }
        return current(
            window: window, isPrayed: prayed.contains(window.event, in: timeZone),
            settings: settings, now: now)
    }

    /// The same, for a caller that already knows which prayer is open and whether it is marked.
    static func current(
        window: PrayerWindow,
        isPrayed: Bool,
        settings: AppSettings,
        now: Date
    ) -> PrayerWarning? {
        guard settings.endOfTimeAlerts, !settings.alertsArePaused(at: now), !isPrayed else { return nil }
        let urgency = window.urgency(at: now)
        guard urgency > .calm else { return nil }
        return PrayerWarning(window: window, urgency: urgency, isOverdue: window.isOverdue(at: now))
    }

    /// True for a prayer that should be prayed some time before its time ends, as Asr should.
    var hasEarlyDeadline: Bool { window.deadline < window.closes }

    /// What the countdown beside the warning runs to.
    var countdownTarget: Date { isOverdue ? window.closes : window.deadline }

    /// Where the cover's sun stands: 1 at the top of its path when the cover appears, 0 resting
    /// on the horizon at the deadline, and down to -1, fully set, when an overdue Asr's time ends.
    func sunHeight(at now: Date) -> Double {
        func clamped(_ value: Double) -> Double { min(max(value, 0), 1) }
        if isOverdue {
            let span = window.closes.timeIntervalSince(window.deadline)
            return span > 0 ? -clamped(now.timeIntervalSince(window.deadline) / span) : -1
        }
        let coverSpan = Urgency.ten.lead ?? 600
        return clamped(window.deadline.timeIntervalSince(now) / coverSpan)
    }

    /// The few words that sit beside the countdown on the island and the card.
    func title(in timeZone: TimeZone) -> String {
        let name = window.event.title(in: timeZone)
        if isOverdue { return "Pray \(name) now" }
        return hasEarlyDeadline ? "Pray \(name)" : "\(name) ends"
    }

    /// The full sentence shown on the screen cover.
    func detail(at now: Date, in timeZone: TimeZone) -> String {
        let name = window.event.title(in: timeZone)
        let left = Countdown.precise(countdownTarget.timeIntervalSince(now))
        if isOverdue { return "Maghrib is in \(left). Pray \(name) now." }
        return hasEarlyDeadline ? "Best time for \(name) ends in \(left)" : "\(name) ends in \(left)"
    }

    func menuBarTitle(at now: Date, in timeZone: TimeZone) -> String {
        let name = window.event.title(in: timeZone)
        let left = Countdown.coarse(countdownTarget.timeIntervalSince(now))
        if isOverdue { return "Pray \(name) now" }
        return hasEarlyDeadline ? "Pray \(name) · \(left)" : "\(name) ends in \(left)"
    }
}
