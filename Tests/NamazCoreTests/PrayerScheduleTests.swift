import Foundation
import Testing
@testable import NamazCore

@Suite struct PrayerScheduleTests {
    static let pakistan = TimeZone(identifier: "Asia/Karachi")!
    static let karachi = Coordinates(latitude: 24.8607, longitude: 67.0011)
    static let configuration = PrayerConfiguration(method: .karachi, madhab: .hanafi)

    /// 4 October 2026 in Karachi: Fajr 05:09, sunrise 06:25, Dhuhr 12:21, Asr 16:37,
    /// Maghrib 18:16, Isha 19:32 (give or take a minute).
    func schedule(at clock: String) throws -> (PrayerSchedule, Date) {
        let now = try #require(PrayerTimesTests.date(
            clock, on: CalendarDay(year: 2026, month: 10, day: 4), in: Self.pakistan))
        let schedule = try #require(PrayerSchedule(
            around: now, at: Self.karachi, timeZone: Self.pakistan, configuration: Self.configuration))
        return (schedule, now)
    }

    @Test func afternoonIsDhuhrWithAsrNext() throws {
        let (schedule, now) = try schedule(at: "14:00")
        #expect(schedule.current(at: now)?.prayer == .dhuhr)
        #expect(schedule.next(after: now)?.prayer == .asr)
        #expect(schedule.next(after: now)?.time == schedule.today.asr)
        #expect(schedule.displayDay(at: now) == schedule.today)
    }

    @Test func sunriseIsTheNextEventAfterFajr() throws {
        let (schedule, now) = try schedule(at: "05:30")
        #expect(schedule.current(at: now)?.prayer == .fajr)
        #expect(schedule.next(after: now)?.prayer == .sunrise)
    }

    @Test func beforeFajrWeAreStillInYesterdaysIsha() throws {
        let (schedule, now) = try schedule(at: "02:00")
        #expect(schedule.current(at: now)?.time == schedule.yesterday.isha)
        #expect(schedule.next(after: now)?.time == schedule.today.fajr)
        #expect(schedule.displayDay(at: now) == schedule.today)
    }

    @Test func afterIshaTheNextPrayerIsTomorrowsFajr() throws {
        let (schedule, now) = try schedule(at: "22:00")
        #expect(schedule.current(at: now)?.time == schedule.today.isha)
        #expect(schedule.next(after: now)?.time == schedule.tomorrow.fajr)
        #expect(schedule.displayDay(at: now) == schedule.tomorrow)
    }

    @Test func aPrayerBecomesCurrentAtItsExactTime() throws {
        let (schedule, _) = try schedule(at: "12:00")
        let asr = schedule.today.asr
        #expect(schedule.current(at: asr)?.prayer == .asr)
        #expect(schedule.next(after: asr)?.prayer == .maghrib)
        #expect(schedule.next(after: asr - 1)?.prayer == .asr)
    }

    @Test func progressRunsFromZeroToOneBetweenEvents() throws {
        let (schedule, _) = try schedule(at: "12:00")
        let (dhuhr, asr) = (schedule.today.dhuhr, schedule.today.asr)
        #expect(schedule.progress(at: dhuhr) == 0)
        #expect(abs(schedule.progress(at: dhuhr + asr.timeIntervalSince(dhuhr) / 2) - 0.5) < 0.001)
        #expect(schedule.progress(at: asr - 1) > 0.99)
    }

    @Test func fridayDhuhrIsCalledJumuah() throws {
        // 2 October 2026 is a Friday.
        let friday = try #require(PrayerTimesCalculator.times(
            for: CalendarDay(year: 2026, month: 10, day: 2), at: Self.karachi,
            timeZone: Self.pakistan, configuration: Self.configuration))
        let (schedule, _) = try schedule(at: "12:00")  // a Sunday
        let fridayDhuhr = PrayerEvent(prayer: .dhuhr, time: friday.dhuhr)
        let fridayAsr = PrayerEvent(prayer: .asr, time: friday.asr)
        let sundayDhuhr = PrayerEvent(prayer: .dhuhr, time: schedule.today.dhuhr)

        #expect(fridayDhuhr.title(in: Self.pakistan) == "Jumu'ah")
        #expect(fridayAsr.title(in: Self.pakistan) == "Asr")
        #expect(sundayDhuhr.title(in: Self.pakistan) == "Dhuhr")
    }

    @Test func alarmsCoverOnlyEnabledPrayersInFiringOrder() throws {
        let (schedule, now) = try schedule(at: "12:00")
        let alarms = schedule.alarms(enabled: [.asr, .maghrib], reminderLead: 600)

        #expect(alarms.allSatisfy { [.asr, .maghrib].contains($0.event.prayer) })
        #expect(alarms.map(\.fireDate) == alarms.map(\.fireDate).sorted())

        let upcoming = alarms.filter { $0.fireDate > now }.prefix(4)
        #expect(upcoming.map(\.kind) == [.reminder, .prayerTime, .reminder, .prayerTime])
        #expect(upcoming.map(\.event.prayer) == [.asr, .asr, .maghrib, .maghrib])
        #expect(upcoming.first?.fireDate == schedule.today.asr - 600)
    }

    @Test func noReminderLeadMeansNoReminders() throws {
        let (schedule, _) = try schedule(at: "12:00")
        #expect(schedule.alarms(enabled: Set(Prayer.allCases), reminderLead: nil)
            .allSatisfy { $0.kind == .prayerTime })
        #expect(schedule.alarms(enabled: [], reminderLead: 600).isEmpty)
    }

    @Test func dueAlarmsRingOnceAndNeverLate() throws {
        let (schedule, _) = try schedule(at: "12:00")
        let asr = schedule.today.asr
        func due(after cursor: Date, upTo now: Date) -> [Prayer] {
            schedule.dueAlarms(
                after: cursor, upTo: now, enabled: [.asr], reminderLead: nil, grace: 120
            ).map(\.event.prayer)
        }

        #expect(due(after: asr - 30, upTo: asr + 0.1) == [.asr], "rings when the time arrives")
        #expect(due(after: asr - 30, upTo: asr) == [.asr], "rings at the exact instant")
        #expect(due(after: asr - 30, upTo: asr - 1).isEmpty, "not before its time")
        #expect(due(after: asr + 0.1, upTo: asr + 5).isEmpty, "not a second time")
        #expect(due(after: asr - 30, upTo: asr + 3600).isEmpty, "not an hour late after sleep")
    }

    @Test func nextChangeIsTheSoonerOfAnAlarmAndAPeriodBoundary() throws {
        let (schedule, now) = try schedule(at: "14:00")
        let asr = schedule.today.asr

        #expect(schedule.nextChange(after: now, enabled: [], reminderLead: nil) == asr)
        #expect(schedule.nextChange(after: now, enabled: [.asr], reminderLead: 900) == asr - 900)
        // Maghrib's reminder is further away than Asr itself.
        #expect(schedule.nextChange(after: now, enabled: [.maghrib], reminderLead: 900) == asr)
    }

    @Test func hijriDateAdvancesAtMaghrib() throws {
        // Aladhan gives 4 October 2026 as 23 Rabi' al-Thani 1448.
        let noon = CalendarDay(year: 2026, month: 10, day: 4).noon(in: Self.pakistan)
        let day = HijriDate.string(for: noon, timeZone: Self.pakistan)
        let evening = HijriDate.string(for: noon, timeZone: Self.pakistan, afterMaghrib: true)
        let sightedLate = HijriDate.string(for: noon, timeZone: Self.pakistan, dayOffset: -1)

        #expect(day.hasPrefix("23 ") && day.hasSuffix(" 1448"))
        #expect(evening.hasPrefix("24 "))
        #expect(sightedLate.hasPrefix("22 "))
    }

    @Test func regionalDefaultsFollowTheTimeZone() {
        let pakistan = RegionalDefaults.forTimeZone(Self.pakistan)
        #expect(pakistan.city.name == "Karachi")
        #expect(pakistan.method == .karachi)
        #expect(pakistan.madhab == .hanafi)

        let newYork = RegionalDefaults.forTimeZone(TimeZone(identifier: "America/New_York")!)
        #expect(newYork.method == .northAmerica)
        #expect(newYork.madhab == .standard)

        let unknown = RegionalDefaults.forTimeZone(TimeZone(identifier: "Pacific/Tahiti")!)
        #expect(unknown.city.name == "Makkah")
    }
}
