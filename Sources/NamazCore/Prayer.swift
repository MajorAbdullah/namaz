import Foundation

/// The six daily events the app tracks: the five prayers, plus sunrise, which closes the Fajr window.
public enum Prayer: String, CaseIterable, Codable, Sendable, Identifiable {
    case fajr, sunrise, dhuhr, asr, maghrib, isha

    public var id: String { rawValue }

    public var name: String {
        switch self {
        case .fajr: "Fajr"
        case .sunrise: "Sunrise"
        case .dhuhr: "Dhuhr"
        case .asr: "Asr"
        case .maghrib: "Maghrib"
        case .isha: "Isha"
        }
    }

    /// False for sunrise, which is shown and can be alarmed but is not a prayer.
    public var isPrayer: Bool { self != .sunrise }
}

/// One occurrence of a prayer at a concrete instant.
public struct PrayerEvent: Hashable, Sendable, Identifiable {
    public let prayer: Prayer
    public let time: Date

    public init(prayer: Prayer, time: Date) {
        self.prayer = prayer
        self.time = time
    }

    public var id: String { "\(prayer.rawValue)@\(time.timeIntervalSinceReferenceDate)" }

    /// Display name, with Friday's Dhuhr shown as Jumu'ah.
    public func title(in timeZone: TimeZone) -> String {
        guard prayer == .dhuhr else { return prayer.name }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        return calendar.component(.weekday, from: time) == 6 ? "Jumu'ah" : prayer.name
    }
}

/// A Gregorian calendar date with no time or time zone attached.
public struct CalendarDay: Hashable, Sendable, Comparable {
    public let year: Int
    public let month: Int
    public let day: Int

    public init(year: Int, month: Int, day: Int) {
        self.year = year
        self.month = month
        self.day = day
    }

    /// The calendar date that `date` falls on in `timeZone`.
    public init(containing date: Date, in timeZone: TimeZone) {
        let parts = Self.calendar(timeZone).dateComponents([.year, .month, .day], from: date)
        self.init(year: parts.year!, month: parts.month!, day: parts.day!)
    }

    /// Midnight UTC on this date. Used as a time-zone-independent anchor for arithmetic.
    var utcMidnight: Date {
        Self.calendar(.gmt).date(from: DateComponents(year: year, month: month, day: day))!
    }

    public func adding(days: Int) -> CalendarDay {
        CalendarDay(containing: utcMidnight.addingTimeInterval(Double(days) * 86_400), in: .gmt)
    }

    /// Local noon on this date, a safe instant for formatting the date itself.
    public func noon(in timeZone: TimeZone) -> Date {
        Self.calendar(timeZone).date(from: DateComponents(year: year, month: month, day: day, hour: 12))!
    }

    public static func < (lhs: CalendarDay, rhs: CalendarDay) -> Bool {
        (lhs.year, lhs.month, lhs.day) < (rhs.year, rhs.month, rhs.day)
    }

    private static func calendar(_ timeZone: TimeZone) -> Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        return calendar
    }
}
