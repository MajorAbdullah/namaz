import Foundation
import NamazCore

enum AlarmSound: Codable, Hashable, Sendable {
    /// Show the alarm without playing anything.
    case silent
    /// The adhan recording that ships inside the app.
    case adhan
    /// One of the alert sounds that ship with macOS, by name.
    case system(String)
    /// An audio file the user picked, copied into the app's support folder.
    case custom(fileName: String)
}

/// Everything the user can change, persisted as one JSON value.
struct AppSettings: Codable, Equatable, Sendable {
    enum LocationMode: String, Codable, Sendable { case automatic, manual }
    enum WidgetLayout: String, Codable, CaseIterable, Sendable {
        /// A black island growing out of the notch at the top of the screen.
        case island
        /// A card on the desktop with the day's times in a row.
        case compact
        /// A taller card on the desktop with one line per prayer.
        case list
    }
    enum MenuBarStyle: String, Codable, CaseIterable, Sendable { case nextPrayer, countdown, iconOnly }
    enum ClockStyle: String, Codable, CaseIterable, Sendable { case system, twelveHour, twentyFourHour }

    var locationMode: LocationMode
    /// The city chosen by hand. Also the fallback until Location Services answers.
    var manualPlace: Place
    /// The last position Location Services reported.
    var detectedPlace: Place?
    var calculation: PrayerConfiguration
    /// Shifts the Hijri date for regions whose moon sighting differs from Umm al-Qura.
    var hijriDayOffset: Int

    var alarmPrayers: Set<Prayer>
    var alarmSound: AlarmSound
    var alarmVolume: Double
    /// Minutes of advance warning before each alarmed prayer. Zero turns reminders off.
    var reminderMinutes: Int

    var showsWidget: Bool
    var widgetLayout: WidgetLayout
    var widgetFloatsOnTop: Bool
    var menuBarStyle: MenuBarStyle
    var clockStyle: ClockStyle

    /// Starting settings for a Mac in the given time zone.
    static func defaults(for timeZone: TimeZone = .current) -> AppSettings {
        let regional = RegionalDefaults.forTimeZone(timeZone)
        return AppSettings(
            locationMode: .automatic,
            manualPlace: regional.city.place,
            detectedPlace: nil,
            calculation: PrayerConfiguration(method: regional.method, madhab: regional.madhab),
            hijriDayOffset: 0,
            alarmPrayers: Set(Prayer.allCases.filter(\.isPrayer)),
            alarmSound: .adhan,
            alarmVolume: 1,
            reminderMinutes: 0,
            showsWidget: true,
            widgetLayout: .island,
            widgetFloatsOnTop: false,
            menuBarStyle: .nextPrayer,
            clockStyle: .system)
    }

    /// The location prayer times are calculated for right now.
    var place: Place {
        locationMode == .automatic ? detectedPlace ?? manualPlace : manualPlace
    }

    var reminderLead: TimeInterval? {
        reminderMinutes > 0 ? Double(reminderMinutes) * 60 : nil
    }
}

extension AppSettings {
    /// Reads whatever keys are present and valid, taking defaults for the rest, so settings
    /// saved by an older version survive new fields being added.
    init(from decoder: Decoder) throws {
        var settings = AppSettings.defaults()
        let container = try decoder.container(keyedBy: CodingKeys.self)
        func read<T: Decodable>(_ key: CodingKeys, into value: inout T) {
            if let decoded = try? container.decodeIfPresent(T.self, forKey: key) { value = decoded }
        }
        read(.locationMode, into: &settings.locationMode)
        read(.manualPlace, into: &settings.manualPlace)
        settings.detectedPlace = try? container.decodeIfPresent(Place.self, forKey: .detectedPlace)
        read(.calculation, into: &settings.calculation)
        read(.hijriDayOffset, into: &settings.hijriDayOffset)
        read(.alarmPrayers, into: &settings.alarmPrayers)
        read(.alarmSound, into: &settings.alarmSound)
        read(.alarmVolume, into: &settings.alarmVolume)
        read(.reminderMinutes, into: &settings.reminderMinutes)
        read(.showsWidget, into: &settings.showsWidget)
        read(.widgetLayout, into: &settings.widgetLayout)
        read(.widgetFloatsOnTop, into: &settings.widgetFloatsOnTop)
        read(.menuBarStyle, into: &settings.menuBarStyle)
        read(.clockStyle, into: &settings.clockStyle)
        self = settings
    }

    private static let storageKey = "settings"

    static func load(from defaults: UserDefaults = .standard) -> AppSettings {
        guard let data = defaults.data(forKey: storageKey),
              let settings = try? JSONDecoder().decode(AppSettings.self, from: data)
        else { return .defaults() }
        return settings
    }

    func save(to defaults: UserDefaults = .standard) {
        guard let data = try? JSONEncoder().encode(self) else { return }
        defaults.set(data, forKey: Self.storageKey)
    }
}
