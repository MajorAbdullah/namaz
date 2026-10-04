import Foundation
import Testing
@testable import NamazCore

/// Published times for one place and date, from the Aladhan API (api.aladhan.com, fetched
/// 2026-10-04). An independent implementation, so agreement here is evidence the maths is right.
struct Reference: Sendable, CustomTestStringConvertible {
    let label: String
    let day: CalendarDay
    let coordinates: Coordinates
    let timeZoneID: String
    let method: CalculationMethod
    var madhab = AsrMadhab.standard
    /// Fajr, sunrise, Dhuhr, Asr, Maghrib, Isha as local HH:mm.
    let expected: [String]

    var testDescription: String { label }

    static let all: [Reference] = [
        Reference(
            label: "Karachi, October, Karachi method, Hanafi",
            day: CalendarDay(year: 2026, month: 10, day: 4),
            coordinates: Coordinates(latitude: 24.8607, longitude: 67.0011),
            timeZoneID: "Asia/Karachi", method: .karachi, madhab: .hanafi,
            expected: ["05:09", "06:25", "12:21", "16:37", "18:16", "19:32"]),
        Reference(
            label: "Lahore, June solstice, Karachi method, Hanafi",
            day: CalendarDay(year: 2026, month: 6, day: 21),
            coordinates: Coordinates(latitude: 31.5204, longitude: 74.3587),
            timeZoneID: "Asia/Karachi", method: .karachi, madhab: .hanafi,
            expected: ["03:19", "04:58", "12:04", "17:01", "19:11", "20:50"]),
        Reference(
            label: "Islamabad, December solstice, Karachi method",
            day: CalendarDay(year: 2026, month: 12, day: 21),
            coordinates: Coordinates(latitude: 33.6844, longitude: 73.0479),
            timeZoneID: "Asia/Karachi", method: .karachi,
            expected: ["05:39", "07:08", "12:06", "14:45", "17:03", "18:33"]),
        Reference(
            label: "Makkah in Ramadan, Umm al-Qura (Isha 120 min after Maghrib)",
            day: CalendarDay(year: 2026, month: 3, day: 1),
            coordinates: Coordinates(latitude: 21.4225, longitude: 39.8262),
            timeZoneID: "Asia/Riyadh", method: .ummAlQura,
            expected: ["05:25", "06:41", "12:33", "15:53", "18:25", "20:25"]),
        Reference(
            label: "Makkah outside Ramadan, Umm al-Qura (Isha 90 min after Maghrib)",
            day: CalendarDay(year: 2026, month: 10, day: 4),
            coordinates: Coordinates(latitude: 21.4225, longitude: 39.8262),
            timeZoneID: "Asia/Riyadh", method: .ummAlQura,
            expected: ["04:57", "06:13", "12:09", "15:34", "18:06", "19:36"]),
        Reference(
            label: "New York in daylight saving time, ISNA",
            day: CalendarDay(year: 2026, month: 7, day: 15),
            coordinates: Coordinates(latitude: 40.7128, longitude: -74.0060),
            timeZoneID: "America/New_York", method: .northAmerica,
            expected: ["04:03", "05:38", "13:02", "17:01", "20:26", "22:01"]),
        Reference(
            label: "Jakarta, southern hemisphere, Singapore method",
            day: CalendarDay(year: 2026, month: 1, day: 10),
            coordinates: Coordinates(latitude: -6.2088, longitude: 106.8456),
            timeZoneID: "Asia/Jakarta", method: .singapore,
            expected: ["04:22", "05:46", "12:00", "15:25", "18:14", "19:29"]),
        Reference(
            label: "London in winter, Muslim World League",
            day: CalendarDay(year: 2026, month: 12, day: 15),
            coordinates: Coordinates(latitude: 51.5074, longitude: -0.1278),
            timeZoneID: "Europe/London", method: .muslimWorldLeague,
            expected: ["05:56", "08:00", "11:56", "13:36", "15:52", "17:49"]),
        Reference(
            label: "Cairo, Egyptian method",
            day: CalendarDay(year: 2026, month: 4, day: 10),
            coordinates: Coordinates(latitude: 30.0444, longitude: 31.2357),
            timeZoneID: "Africa/Cairo", method: .egyptian,
            expected: ["04:04", "05:34", "11:56", "15:29", "18:19", "19:39"]),
        Reference(
            label: "Sydney in daylight saving time, Muslim World League",
            day: CalendarDay(year: 2026, month: 11, day: 20),
            coordinates: Coordinates(latitude: -33.8688, longitude: 151.2093),
            timeZoneID: "Australia/Sydney", method: .muslimWorldLeague,
            expected: ["04:03", "05:41", "12:41", "16:24", "19:41", "21:12"]),
        Reference(
            label: "Tehran, Tehran method (Maghrib by angle)",
            day: CalendarDay(year: 2026, month: 5, day: 5),
            coordinates: Coordinates(latitude: 35.6892, longitude: 51.3890),
            timeZoneID: "Asia/Tehran", method: .tehran,
            expected: ["03:34", "05:09", "12:01", "15:46", "19:14", "20:07"]),
        Reference(
            label: "London at the June solstice, twilight never ends (angle-based cap)",
            day: CalendarDay(year: 2026, month: 6, day: 21),
            coordinates: Coordinates(latitude: 51.5074, longitude: -0.1278),
            timeZoneID: "Europe/London", method: .muslimWorldLeague,
            expected: ["02:31", "04:43", "13:02", "17:25", "21:22", "23:27"]),
    ]
}

@Suite struct PrayerTimesTests {
    @Test("Matches independently published times to the minute", arguments: Reference.all)
    func matchesPublishedTimes(_ reference: Reference) throws {
        let timeZone = try #require(TimeZone(identifier: reference.timeZoneID))
        let times = try #require(PrayerTimesCalculator.times(
            for: reference.day, at: reference.coordinates, timeZone: timeZone,
            configuration: PrayerConfiguration(method: reference.method, madhab: reference.madhab)))

        for (prayer, expected) in zip(Prayer.allCases, reference.expected) {
            let expectedDate = try #require(Self.date(expected, on: reference.day, in: timeZone))
            let differenceInMinutes = times[prayer].timeIntervalSince(expectedDate) / 60
            // Sources round differently (nearest minute, or always up), so allow one minute.
            // Aladhan's Asr additionally runs up to a minute and a half off the true shadow
            // length around the equinoxes (SunPositionTests checks ours against the sun itself).
            let tolerance: Double = prayer == .asr ? 2 : 1
            #expect(
                abs(differenceInMinutes) <= tolerance,
                "\(prayer.name): got \(Self.format(times[prayer], in: timeZone)), published \(expected)")
        }
    }

    @Test func timesAreRoundedToWholeMinutesAndInOrder() throws {
        let times = try #require(karachi(CalendarDay(year: 2026, month: 10, day: 4)))
        let dates = Prayer.allCases.map { times[$0] }
        for date in dates {
            #expect(date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: 60) == 0)
        }
        #expect(dates == dates.sorted())
    }

    @Test func hanafiAsrIsLaterThanStandard() throws {
        let day = CalendarDay(year: 2026, month: 10, day: 4)
        let hanafi = try #require(karachi(day, madhab: .hanafi))
        let standard = try #require(karachi(day, madhab: .standard))
        #expect(hanafi.asr > standard.asr)
        #expect(hanafi.dhuhr == standard.dhuhr)
    }

    @Test func adjustmentsShiftOnlyTheirOwnPrayer() throws {
        let day = CalendarDay(year: 2026, month: 10, day: 4)
        var configuration = PrayerConfiguration(method: .karachi, madhab: .hanafi)
        let base = try #require(karachi(day))
        configuration.adjustments[.fajr] = 3
        configuration.adjustments[.isha] = -2
        let adjusted = try #require(PrayerTimesCalculator.times(
            for: day, at: Self.karachiCoordinates, timeZone: Self.pakistan, configuration: configuration))

        #expect(adjusted.fajr == base.fajr + 180)
        #expect(adjusted.isha == base.isha - 120)
        #expect(adjusted.dhuhr == base.dhuhr)
    }

    @Test func everyTimeFallsOnTheRequestedLocalDate() throws {
        // Apia is UTC+13 but sits at 172°W, so its solar day belongs to the previous UTC date.
        let apia = try #require(TimeZone(identifier: "Pacific/Apia"))
        let day = CalendarDay(year: 2026, month: 10, day: 4)
        let times = try #require(PrayerTimesCalculator.times(
            for: day, at: Coordinates(latitude: -13.8333, longitude: -171.7667), timeZone: apia,
            configuration: PrayerConfiguration(method: .muslimWorldLeague, madhab: .standard)))
        for prayer in Prayer.allCases {
            #expect(CalendarDay(containing: times[prayer], in: apia) == day, "\(prayer.name)")
        }
    }

    @Test func consecutiveDaysDriftByAtMostAFewMinutes() throws {
        // Catches a calendar-date mix-up, which would show up as a jump between days.
        var previous = try #require(karachi(CalendarDay(year: 2026, month: 1, day: 1)))
        for offset in 1..<366 {
            let day = CalendarDay(year: 2026, month: 1, day: 1).adding(days: offset)
            let times = try #require(karachi(day))
            for prayer in Prayer.allCases {
                let drift = times[prayer].timeIntervalSince(previous[prayer]) - 86_400
                #expect(abs(drift) <= 180, "\(prayer.name) on \(day)")
            }
            previous = times
        }
    }

    @Test func polarNightHasNoTimes() {
        let tromso = Coordinates(latitude: 69.6492, longitude: 18.9553)
        let times = PrayerTimesCalculator.times(
            for: CalendarDay(year: 2026, month: 12, day: 21), at: tromso,
            timeZone: TimeZone(identifier: "Europe/Oslo")!,
            configuration: PrayerConfiguration(method: .muslimWorldLeague, madhab: .standard))
        #expect(times == nil)
    }

    @Test func qiblaBearingMatchesKnownValues() {
        #expect(abs(Self.karachiCoordinates.qiblaBearing - 267.7) < 0.5)
        #expect(abs(Coordinates(latitude: 40.7128, longitude: -74.0060).qiblaBearing - 58.5) < 0.5)
        #expect(abs(Coordinates(latitude: 51.5074, longitude: -0.1278).qiblaBearing - 119.0) < 0.5)
    }

    // MARK: - Helpers

    static let pakistan = TimeZone(identifier: "Asia/Karachi")!
    static let karachiCoordinates = Coordinates(latitude: 24.8607, longitude: 67.0011)

    func karachi(_ day: CalendarDay, madhab: AsrMadhab = .hanafi) -> DailyPrayerTimes? {
        PrayerTimesCalculator.times(
            for: day, at: Self.karachiCoordinates, timeZone: Self.pakistan,
            configuration: PrayerConfiguration(method: .karachi, madhab: madhab))
    }

    static func date(_ clock: String, on day: CalendarDay, in timeZone: TimeZone) -> Date? {
        let parts = clock.split(separator: ":").compactMap { Int($0) }
        guard parts.count == 2 else { return nil }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        return calendar.date(from: DateComponents(
            year: day.year, month: day.month, day: day.day, hour: parts[0], minute: parts[1]))
    }

    static func format(_ date: Date, in timeZone: TimeZone) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = timeZone
        formatter.dateFormat = "HH:mm"
        return formatter.string(from: date)
    }
}
