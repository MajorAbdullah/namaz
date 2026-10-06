import Foundation
import Testing
@testable import NamazCore

@Suite struct PrayerWindowTests {
    /// The same day and place as `PrayerScheduleTests`: Fajr 05:09, sunrise 06:25, Dhuhr 12:21,
    /// Asr 16:37, Maghrib 18:16, Isha 19:32 (give or take a minute).
    func schedule(at clock: String) throws -> (PrayerSchedule, Date) {
        try PrayerScheduleTests().schedule(at: clock)
    }

    func window(at clock: String) throws -> (PrayerWindow, PrayerSchedule) {
        let (schedule, now) = try schedule(at: clock)
        return (try #require(schedule.window(at: now)), schedule)
    }

    // MARK: - Which prayer is open

    @Test func aPrayersTimeEndsWhenTheNextEventStarts() throws {
        let (fajr, day) = try window(at: "05:30")
        #expect(fajr.event.prayer == .fajr)
        #expect(fajr.closes == day.today.sunrise)

        let (dhuhr, _) = try window(at: "14:00")
        #expect(dhuhr.event.prayer == .dhuhr)
        #expect(dhuhr.closes == day.today.asr)

        let (maghrib, _) = try window(at: "18:30")
        #expect(maghrib.event.prayer == .maghrib)
        #expect(maghrib.closes == day.today.isha)

        let (isha, _) = try window(at: "22:00")
        #expect(isha.event.prayer == .isha)
        #expect(isha.closes == day.tomorrow.fajr)
    }

    @Test func beforeFajrYesterdaysIshaIsStillOpen() throws {
        let (isha, day) = try window(at: "02:00")
        #expect(isha.event.time == day.yesterday.isha)
        #expect(isha.closes == day.today.fajr)
    }

    @Test func noPrayerIsOpenBetweenSunriseAndDhuhr() throws {
        let (schedule, now) = try schedule(at: "09:00")
        #expect(schedule.window(at: now) == nil)
    }

    // MARK: - Deadlines

    @Test func theDeadlineIsTheEndOfTheTimeForEveryPrayerButAsr() throws {
        for clock in ["05:30", "14:00", "18:30", "22:00"] {
            let (window, _) = try window(at: clock)
            #expect(window.deadline == window.closes)
        }
    }

    @Test func asrShouldBePrayedTwentyMinutesBeforeMaghrib() throws {
        let (asr, day) = try window(at: "17:00")
        #expect(asr.event.prayer == .asr)
        #expect(asr.closes == day.today.maghrib)
        #expect(asr.deadline == day.today.maghrib - 20 * 60)
    }

    @Test func aDeadlineNeverFallsBeforeThePrayerStarts() {
        let start = Date(timeIntervalSinceReferenceDate: 800_000_000)
        let asr = PrayerWindow(event: PrayerEvent(prayer: .asr, time: start), closes: start + 10 * 60)
        #expect(asr.deadline == start)
    }

    // MARK: - Urgency

    @Test func urgencyStepsUpAtTwentyFifteenTenAndFiveMinutes() throws {
        let (dhuhr, _) = try window(at: "14:00")
        let deadline = dhuhr.deadline
        #expect(dhuhr.urgency(at: deadline - 20 * 60 - 1) == .calm)
        #expect(dhuhr.urgency(at: deadline - 20 * 60) == .twenty)
        #expect(dhuhr.urgency(at: deadline - 15 * 60 - 1) == .twenty)
        #expect(dhuhr.urgency(at: deadline - 15 * 60) == .fifteen)
        #expect(dhuhr.urgency(at: deadline - 10 * 60) == .ten)
        #expect(dhuhr.urgency(at: deadline - 5 * 60) == .five)
        #expect(dhuhr.urgency(at: deadline - 1) == .five)
        #expect(Urgency.calm < .twenty && Urgency.twenty < .fifteen && Urgency.ten < .five)
    }

    @Test func asrStaysMostUrgentFromItsDeadlineUntilMaghrib() throws {
        let (asr, _) = try window(at: "17:00")
        #expect(!asr.isOverdue(at: asr.deadline - 1))
        #expect(asr.isOverdue(at: asr.deadline))
        #expect(asr.urgency(at: asr.deadline) == .five)
        #expect(asr.isOverdue(at: asr.closes - 1))
        #expect(asr.urgency(at: asr.closes - 1) == .five)

        let (dhuhr, _) = try window(at: "14:00")
        #expect(!dhuhr.isOverdue(at: dhuhr.closes - 1))
    }

    @Test func escalationsAreTheStartOfEachStageThenTheDeadline() throws {
        let (dhuhr, _) = try window(at: "14:00")
        let deadline = dhuhr.deadline
        #expect(dhuhr.nextEscalation(after: deadline - 25 * 60) == deadline - 20 * 60)
        #expect(dhuhr.nextEscalation(after: deadline - 20 * 60) == deadline - 15 * 60)
        #expect(dhuhr.nextEscalation(after: deadline - 12 * 60) == deadline - 10 * 60)
        #expect(dhuhr.nextEscalation(after: deadline - 7 * 60) == deadline - 5 * 60)
        // Nothing more for the timer to do: the end of the time is already a change it wakes for.
        #expect(dhuhr.nextEscalation(after: deadline - 5 * 60) == nil)

        let (asr, _) = try window(at: "17:00")
        #expect(asr.nextEscalation(after: asr.deadline - 5 * 60) == asr.deadline)
        #expect(asr.nextEscalation(after: asr.deadline) == nil)
    }

    // MARK: - Prayed log

    @Test func aMarkCoversOnePrayerOnOneDay() throws {
        let (schedule, _) = try schedule(at: "17:00")
        let zone = PrayerScheduleTests.pakistan
        let asr = PrayerEvent(prayer: .asr, time: schedule.today.asr)
        var log = PrayedLog()
        #expect(!log.contains(asr, in: zone))

        log.set(true, for: asr, in: zone)
        #expect(log.contains(asr, in: zone))
        #expect(!log.contains(PrayerEvent(prayer: .dhuhr, time: schedule.today.dhuhr), in: zone))
        #expect(!log.contains(PrayerEvent(prayer: .asr, time: schedule.tomorrow.asr), in: zone))

        log.set(false, for: asr, in: zone)
        #expect(!log.contains(asr, in: zone))
        #expect(log == PrayedLog())
    }

    @Test func pruningDropsMarksFromEarlierDays() throws {
        let (schedule, _) = try schedule(at: "17:00")
        let zone = PrayerScheduleTests.pakistan
        let yesterday = PrayerEvent(prayer: .asr, time: schedule.yesterday.asr)
        let today = PrayerEvent(prayer: .asr, time: schedule.today.asr)
        var log = PrayedLog()
        log.set(true, for: yesterday, in: zone)
        log.set(true, for: today, in: zone)

        log.prune(before: schedule.today.day)
        #expect(!log.contains(yesterday, in: zone))
        #expect(log.contains(today, in: zone))
    }

    @Test func theLogSurvivesBeingSaved() throws {
        let (schedule, _) = try schedule(at: "17:00")
        let zone = PrayerScheduleTests.pakistan
        var log = PrayedLog()
        log.set(true, for: PrayerEvent(prayer: .fajr, time: schedule.today.fajr), in: zone)
        log.set(true, for: PrayerEvent(prayer: .isha, time: schedule.today.isha), in: zone)

        let restored = try JSONDecoder().decode(PrayedLog.self, from: JSONEncoder().encode(log))
        #expect(restored == log)
    }

    // MARK: - Pausing

    private func isWholeMinute(_ date: Date) -> Bool {
        date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: 60) == 0
    }

    @Test func anHourPauseEndsOnAMinuteAtLeastAnHourAway() throws {
        let (schedule, now) = try schedule(at: "14:00")
        let end = PauseLength.hour.end(from: now + 20, schedule: schedule)
        #expect(isWholeMinute(end))
        #expect(end >= now + 20 + 3600)
        #expect(end < now + 20 + 3600 + 60)
    }

    @Test func pausingForTheRestOfTodayLastsUntilTheNextFajr() throws {
        let (schedule, now) = try schedule(at: "14:00")
        #expect(PauseLength.restOfToday.end(from: now, schedule: schedule) == schedule.tomorrow.fajr)
    }

    @Test func pausingForDaysCountsWholeDaysAndRoundsUpToTheMinute() throws {
        let (schedule, now) = try schedule(at: "14:00")
        let end = PauseLength.days(3).end(from: now + 20, schedule: schedule)
        #expect(isWholeMinute(end))
        #expect(end >= now + 20 + 3 * 86_400)
        #expect(end < now + 20 + 3 * 86_400 + 60)
    }

    @Test func withoutAScheduleTheRestOfTodayIsADay() {
        // On a minute exactly, so the rounding does not move it.
        let now = Date(timeIntervalSinceReferenceDate: 812_000_040)
        #expect(PauseLength.restOfToday.end(from: now, schedule: nil) == now + 86_400)
    }
}
