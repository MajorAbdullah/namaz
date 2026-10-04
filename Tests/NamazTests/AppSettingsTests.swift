import Foundation
import NamazCore
import Testing
@testable import Namaz

@Suite struct AppSettingsTests {
    /// A private defaults domain, so tests never touch the real app's settings.
    func scratchDefaults() throws -> UserDefaults {
        let name = "namaz-tests-\(UUID().uuidString)"
        let defaults = try #require(UserDefaults(suiteName: name))
        defaults.removePersistentDomain(forName: name)
        return defaults
    }

    @Test func defaultsSuitPakistan() {
        let settings = AppSettings.defaults(for: TimeZone(identifier: "Asia/Karachi")!)
        #expect(settings.manualPlace.name == "Karachi")
        #expect(settings.calculation.method == .karachi)
        #expect(settings.calculation.madhab == .hanafi)
        // The five prayers ring by default; sunrise does not.
        #expect(settings.alarmPrayers == [.fajr, .dhuhr, .asr, .maghrib, .isha])
        #expect(settings.reminderLead == nil)
    }

    @Test func savedSettingsComeBackUnchanged() throws {
        let defaults = try scratchDefaults()
        var settings = AppSettings.defaults(for: TimeZone(identifier: "Asia/Karachi")!)
        settings.locationMode = .manual
        settings.manualPlace = Place(name: "Lahore", coordinates: Coordinates(latitude: 31.5204, longitude: 74.3587))
        settings.detectedPlace = Place(name: "Model Town", coordinates: Coordinates(latitude: 31.48, longitude: 74.32))
        settings.calculation.adjustments[.fajr] = 2
        settings.alarmPrayers = [.fajr, .sunrise]
        settings.alarmSound = .custom(fileName: "adhan.mp3")
        settings.alarmVolume = 0.4
        settings.reminderMinutes = 15
        settings.widgetLayout = .list
        settings.menuBarStyle = .countdown
        settings.clockStyle = .twentyFourHour
        settings.hijriDayOffset = -1

        settings.save(to: defaults)
        #expect(AppSettings.load(from: defaults) == settings)
    }

    @Test func nothingSavedMeansDefaults() throws {
        #expect(AppSettings.load(from: try scratchDefaults()) == AppSettings.defaults())
    }

    @Test func settingsFromAnOlderVersionKeepWhatTheyHave() throws {
        // Only two fields present, as if every other setting had been added since.
        let old = Data(#"{"reminderMinutes": 10, "widgetLayout": "list"}"#.utf8)
        let settings = try JSONDecoder().decode(AppSettings.self, from: old)

        #expect(settings.reminderMinutes == 10)
        #expect(settings.widgetLayout == .list)
        #expect(settings.alarmPrayers == AppSettings.defaults().alarmPrayers)
        #expect(settings.calculation == AppSettings.defaults().calculation)
    }

    @Test func anUnreadableValueFallsBackToItsDefaultAlone() throws {
        let damaged = Data(#"{"menuBarStyle": "hologram", "alarmVolume": 0.25}"#.utf8)
        let settings = try JSONDecoder().decode(AppSettings.self, from: damaged)

        #expect(settings.menuBarStyle == AppSettings.defaults().menuBarStyle)
        #expect(settings.alarmVolume == 0.25)
    }

    @Test func automaticLocationFallsBackToTheChosenCityUntilFound() {
        var settings = AppSettings.defaults(for: TimeZone(identifier: "Asia/Karachi")!)
        #expect(settings.place.name == "Karachi")

        settings.detectedPlace = Place(name: "Hyderabad", coordinates: Coordinates(latitude: 25.396, longitude: 68.3578))
        #expect(settings.place.name == "Hyderabad")

        settings.locationMode = .manual
        #expect(settings.place.name == "Karachi")
    }
}

@MainActor
@Suite struct FormattingTests {
    static let pakistan = TimeZone(identifier: "Asia/Karachi")!
    /// 4 October 2026, 16:37 in Karachi.
    static let asr = Date(timeIntervalSince1970: 1_791_113_820)

    @Test func clockFollowsTheChosenStyle() {
        let twelve = ClockFormat(style: .twelveHour, timeZone: Self.pakistan)
        #expect(twelve.time(Self.asr) == "4:37 PM")
        #expect(twelve.shortTime(Self.asr) == "4:37")

        let twentyFour = ClockFormat(style: .twentyFourHour, timeZone: Self.pakistan)
        #expect(twentyFour.time(Self.asr) == "16:37")
        #expect(twentyFour.shortTime(Self.asr) == "16:37")
    }

    @Test func clockUsesTheGivenTimeZone() {
        let london = ClockFormat(style: .twentyFourHour, timeZone: TimeZone(identifier: "Europe/London")!)
        #expect(london.time(Self.asr) == "12:37")
    }

    @Test func preciseCountdown() {
        #expect(Countdown.precise(4365) == "1:12:45")
        #expect(Countdown.precise(3600) == "1:00:00")
        #expect(Countdown.precise(765) == "12:45")
        #expect(Countdown.precise(0.4) == "0:01", "a part second still shows as time left")
        #expect(Countdown.precise(-5) == "0:00")
    }

    @Test func coarseCountdownRoundsUpToTheMinute() {
        #expect(Countdown.coarse(4320) == "1h 12m")
        #expect(Countdown.coarse(4321) == "1h 13m")
        #expect(Countdown.coarse(720) == "12m")
        #expect(Countdown.coarse(20) == "1m")
    }

    @Test func qiblaDescriptionNamesTheCompassPoint() {
        #expect(Coordinates(latitude: 24.8607, longitude: 67.0011).qiblaDescription == "268° W")
        #expect(Coordinates(latitude: 40.7128, longitude: -74.0060).qiblaDescription == "58° NE")
    }
}
