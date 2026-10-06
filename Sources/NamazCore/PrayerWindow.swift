import Foundation

/// How close an unprayed prayer is to its deadline.
public enum Urgency: Int, Comparable, CaseIterable, Sendable {
    case calm, twenty, fifteen, ten, five

    /// How long before the deadline this stage begins. Nil for `calm`, which has no start.
    public var lead: TimeInterval? {
        switch self {
        case .calm: nil
        case .twenty: 20 * 60
        case .fifteen: 15 * 60
        case .ten: 10 * 60
        case .five: 5 * 60
        }
    }

    /// The stage that applies with `remaining` seconds to go. A stage begins on its exact minute.
    public init(remaining: TimeInterval) {
        self = Self.allCases.last { stage in stage.lead.map { remaining <= $0 } ?? true } ?? .calm
    }

    public static func < (lhs: Urgency, rhs: Urgency) -> Bool { lhs.rawValue < rhs.rawValue }
}

/// A prayer whose time is open: when it should be prayed by, and when its time really ends.
public struct PrayerWindow: Hashable, Sendable {
    /// Delaying Asr until the sun pales is disliked, so its deadline comes this long before
    /// Maghrib.
    // ponytail: a fixed 20 minutes stands in for the sun's colour. A setting, or a rule based
    // on the sun's altitude, if this needs to follow the season or the school more closely.
    public static let asrDislikedLead: TimeInterval = 20 * 60

    public let event: PrayerEvent
    /// What the alerts count down to. The same as `closes` for every prayer but Asr.
    public let deadline: Date
    /// When the next event begins and this prayer can no longer be prayed on time.
    public let closes: Date

    public init(event: PrayerEvent, closes: Date) {
        self.event = event
        self.closes = closes
        self.deadline = event.prayer == .asr
            ? max(event.time, closes - Self.asrDislikedLead)
            : closes
    }

    public func urgency(at date: Date) -> Urgency {
        date < closes ? Urgency(remaining: deadline.timeIntervalSince(date)) : .calm
    }

    /// True once the deadline has gone but the prayer can still be prayed.
    public func isOverdue(at date: Date) -> Bool {
        date >= deadline && date < closes
    }

    /// The next moment the alert changes: a stage begins, or the deadline passes with time
    /// still left. Nil when the only change left is the end of the time itself.
    public func nextEscalation(after date: Date) -> Date? {
        var moments = Urgency.allCases.compactMap(\.lead).map { deadline - $0 }
        if deadline < closes { moments.append(deadline) }
        return moments.filter { $0 > date }.min()
    }
}

extension PrayerSchedule {
    /// The prayer whose time is open at `date`. Nil between sunrise and Dhuhr.
    public func window(at date: Date) -> PrayerWindow? {
        guard let current = current(at: date), current.prayer.isPrayer,
              let next = next(after: date)
        else { return nil }
        return PrayerWindow(event: current, closes: next.time)
    }
}

/// How long the end-of-time alerts are kept quiet.
public enum PauseLength: Sendable {
    case hour
    /// Until the next Fajr, when a new day of prayers begins.
    case restOfToday
    case days(Int)

    /// When the pause ends. Rounded up to the minute, because the end is shown to the minute.
    public func end(from now: Date, schedule: PrayerSchedule?) -> Date {
        let end: Date
        switch self {
        case .hour:
            end = now + 3600
        case .restOfToday:
            end = schedule?.events.first { $0.prayer == .fajr && $0.time > now }?.time ?? now + 86_400
        case .days(let days):
            end = now + Double(days) * 86_400
        }
        return Date(timeIntervalSinceReferenceDate: (end.timeIntervalSinceReferenceDate / 60).rounded(.up) * 60)
    }
}

/// The prayers the user has marked as prayed.
public struct PrayedLog: Codable, Equatable, Sendable {
    /// One entry per prayer, such as "2026-10-05/asr". The date is zero-padded, so entries
    /// sort in date order.
    private var entries: Set<String> = []

    public init() {}

    public func contains(_ event: PrayerEvent, in timeZone: TimeZone) -> Bool {
        entries.contains(Self.entry(for: event, in: timeZone))
    }

    public mutating func set(_ prayed: Bool, for event: PrayerEvent, in timeZone: TimeZone) {
        let entry = Self.entry(for: event, in: timeZone)
        if prayed {
            entries.insert(entry)
        } else {
            entries.remove(entry)
        }
    }

    /// Forgets marks from before `day`, so the log does not grow for ever.
    public mutating func prune(before day: CalendarDay) {
        let cutoff = Self.prefix(for: day)
        entries = entries.filter { $0 >= cutoff }
    }

    /// A prayer belongs to the day it began on, which keeps an Isha prayed after midnight
    /// with the evening it started in.
    private static func entry(for event: PrayerEvent, in timeZone: TimeZone) -> String {
        prefix(for: CalendarDay(containing: event.time, in: timeZone)) + "/" + event.prayer.rawValue
    }

    private static func prefix(for day: CalendarDay) -> String {
        String(format: "%04d-%02d-%02d", day.year, day.month, day.day)
    }
}
