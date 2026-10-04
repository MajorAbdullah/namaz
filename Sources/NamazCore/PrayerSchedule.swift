import Foundation

/// Prayer times for yesterday, today and tomorrow, which is enough to answer
/// "what is next?" and "what are we in now?" at any moment of today.
public struct PrayerSchedule: Hashable, Sendable {
    public let yesterday: DailyPrayerTimes
    public let today: DailyPrayerTimes
    public let tomorrow: DailyPrayerTimes
    public let timeZone: TimeZone

    /// Every event across the three days, in chronological order.
    public let events: [PrayerEvent]

    /// Nil where the sun does not rise or set (polar regions) or the coordinates are invalid.
    public init?(
        around date: Date,
        at coordinates: Coordinates,
        timeZone: TimeZone,
        configuration: PrayerConfiguration
    ) {
        let day = CalendarDay(containing: date, in: timeZone)
        func times(_ offset: Int) -> DailyPrayerTimes? {
            PrayerTimesCalculator.times(
                for: day.adding(days: offset), at: coordinates,
                timeZone: timeZone, configuration: configuration)
        }
        guard let yesterday = times(-1), let today = times(0), let tomorrow = times(1) else {
            return nil
        }
        self.yesterday = yesterday
        self.today = today
        self.tomorrow = tomorrow
        self.timeZone = timeZone
        self.events = (yesterday.events + today.events + tomorrow.events).sorted { $0.time < $1.time }
    }

    /// The first event strictly after `date`.
    public func next(after date: Date) -> PrayerEvent? {
        events.first { $0.time > date }
    }

    /// The most recent event at or before `date`: the period we are currently in.
    public func current(at date: Date) -> PrayerEvent? {
        events.last { $0.time <= date }
    }

    /// The day whose timetable is worth showing: today, until Isha has passed, then tomorrow.
    public func displayDay(at date: Date) -> DailyPrayerTimes {
        date >= today.isha ? tomorrow : today
    }

    /// How far `date` is through the gap between the current event and the next, from 0 to 1.
    public func progress(at date: Date) -> Double {
        guard let current = current(at: date), let next = next(after: date) else { return 0 }
        let span = next.time.timeIntervalSince(current.time)
        guard span > 0 else { return 0 }
        return min(max(date.timeIntervalSince(current.time) / span, 0), 1)
    }
}

/// Something the app should do at a moment in time: ring for a prayer, or warn that one is close.
public struct AlarmOccurrence: Hashable, Sendable {
    public enum Kind: Sendable {
        case reminder
        case prayerTime
    }

    public let kind: Kind
    public let event: PrayerEvent
    public let fireDate: Date
}

extension PrayerSchedule {
    /// All alarms across the schedule, in the order they fire.
    /// - Parameters:
    ///   - enabled: the events that should ring.
    ///   - reminderLead: how long before each enabled event to give an advance warning, if at all.
    public func alarms(enabled: Set<Prayer>, reminderLead: TimeInterval?) -> [AlarmOccurrence] {
        var occurrences: [AlarmOccurrence] = []
        for event in events where enabled.contains(event.prayer) {
            occurrences.append(AlarmOccurrence(kind: .prayerTime, event: event, fireDate: event.time))
            if let reminderLead, reminderLead > 0 {
                occurrences.append(AlarmOccurrence(
                    kind: .reminder, event: event, fireDate: event.time - reminderLead))
            }
        }
        return occurrences.sorted { $0.fireDate < $1.fireDate }
    }

    /// Alarms that came due in the window `(cursor, now]`.
    ///
    /// Anything more than `grace` seconds overdue is dropped rather than rung late, which is
    /// what happens to alarms that pass while the Mac is asleep.
    public func dueAlarms(
        after cursor: Date,
        upTo now: Date,
        enabled: Set<Prayer>,
        reminderLead: TimeInterval?,
        grace: TimeInterval
    ) -> [AlarmOccurrence] {
        alarms(enabled: enabled, reminderLead: reminderLead).filter {
            $0.fireDate > cursor && $0.fireDate <= now && now.timeIntervalSince($0.fireDate) <= grace
        }
    }

    /// The next moment anything changes: an alarm fires, or a new prayer period begins.
    public func nextChange(
        after now: Date,
        enabled: Set<Prayer>,
        reminderLead: TimeInterval?
    ) -> Date? {
        let alarm = alarms(enabled: enabled, reminderLead: reminderLead)
            .first { $0.fireDate > now }?.fireDate
        return [alarm, next(after: now)?.time].compactMap { $0 }.min()
    }
}
