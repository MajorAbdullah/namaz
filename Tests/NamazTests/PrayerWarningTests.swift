import AppKit
import NamazCore
import Testing
@testable import Namaz

/// The model's end-of-time warning: when it appears, how urgent it is, and what silences it.
@MainActor
@Suite struct PrayerWarningTests {
    /// A model that keeps to itself, with its clock set `minutes` before one of today's times.
    func model(_ minutes: Double, before time: KeyPath<DailyPrayerTimes, Date>) throws -> AppModel {
        _ = NSApplication.shared
        let settings = AppSettings.defaults()
        let schedule = try #require(PrayerSchedule(
            around: Date(), at: settings.place.coordinates,
            timeZone: .current, configuration: settings.calculation))

        var diagnostics = Diagnostics()
        diagnostics.isActive = true
        diagnostics.mutesSound = true
        diagnostics.clockOffset = (schedule.today[keyPath: time] - minutes * 60).timeIntervalSinceNow
        let model = AppModel(diagnostics: diagnostics)
        model.refresh()
        return model
    }

    @Test func anUnprayedPrayerNearItsEndRaisesAWarning() throws {
        let model = try model(12, before: \.asr)
        let warning = try #require(model.warning)
        #expect(warning.window.event.prayer == .dhuhr)
        #expect(warning.urgency == .fifteen)
        #expect(!warning.isOverdue)
        #expect(warning.title(in: model.timeZone).hasSuffix("ends"))
        #expect(model.menuBarTitle.contains("ends in 12m"))
    }

    @Test func thereIsNoWarningWithPlentyOfTimeLeft() throws {
        #expect(try model(30, before: \.asr).warning == nil)
    }

    @Test func markingThePrayerPrayedClearsTheWarningAndUnmarkingBringsItBack() throws {
        let model = try model(8, before: \.asr)
        let event = try #require(model.warning).window.event
        #expect(model.warning?.urgency == .ten)

        model.setPrayed(true, for: event)
        #expect(model.warning == nil)
        #expect(model.prayed.contains(event, in: model.timeZone))

        model.setPrayed(false, for: event)
        #expect(model.warning?.urgency == .ten)
    }

    @Test func switchingAlertsOffClearsTheWarning() throws {
        let model = try model(8, before: \.asr)
        model.settings.endOfTimeAlerts = false
        #expect(model.warning == nil)
    }

    @Test func aPauseSilencesTheWarningUntilResumed() throws {
        let model = try model(8, before: \.asr)
        model.pauseAlerts(.hour)
        #expect(model.warning == nil)
        #expect(model.settings.alertsArePaused(at: model.now))

        model.resumeAlerts()
        #expect(model.warning != nil)
    }

    @Test func pausingForTheRestOfTodayLastsUntilTheNextFajr() throws {
        let model = try model(8, before: \.asr)
        model.pauseAlerts(.restOfToday)
        #expect(model.settings.alertsPausedUntil == model.schedule?.tomorrow.fajr)
    }

    @Test func asrCountsDownToTwentyMinutesBeforeMaghrib() throws {
        // 28 minutes before Maghrib is 8 before Asr's deadline.
        let model = try model(28, before: \.maghrib)
        let warning = try #require(model.warning)
        #expect(warning.window.event.prayer == .asr)
        #expect(warning.urgency == .ten)
        #expect(!warning.isOverdue)
        #expect(warning.title(in: model.timeZone) == "Pray Asr")
        #expect(warning.countdownTarget == warning.window.deadline)
    }

    @Test func theCoversSunReachesTheHorizonAtTheDeadlineAndSetsByTheEnd() throws {
        let dhuhr = try #require(try model(8, before: \.asr).warning)
        let deadline = dhuhr.window.deadline
        #expect(dhuhr.sunHeight(at: deadline - 10 * 60) == 1)
        #expect(dhuhr.sunHeight(at: deadline - 5 * 60) == 0.5)
        #expect(dhuhr.sunHeight(at: deadline) == 0)

        let asr = try #require(try model(10, before: \.maghrib).warning)
        #expect(asr.isOverdue)
        #expect(asr.sunHeight(at: asr.window.closes - 10 * 60) == -0.5)
        #expect(asr.sunHeight(at: asr.window.closes) == -1)
    }

    @Test func asrStaysUrgentAfterItsDeadlineAndCountsDownToMaghrib() throws {
        let model = try model(12, before: \.maghrib)
        let warning = try #require(model.warning)
        #expect(warning.urgency == .five)
        #expect(warning.isOverdue)
        #expect(warning.title(in: model.timeZone) == "Pray Asr now")
        #expect(warning.countdownTarget == warning.window.closes)
        // Asked at an exact instant, so the wording does not depend on how long the test took.
        let twelveMinutesLeft = warning.window.closes - 12 * 60
        #expect(warning.detail(at: twelveMinutesLeft, in: model.timeZone) == "Maghrib is in 12:00. Pray Asr now.")
    }
}
