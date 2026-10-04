import Foundation

/// The convention used to turn twilight into Fajr and Isha times.
public enum CalculationMethod: String, CaseIterable, Codable, Sendable, Identifiable {
    case karachi
    case muslimWorldLeague
    case northAmerica
    case egyptian
    case ummAlQura
    case dubai
    case kuwait
    case qatar
    case singapore
    case tehran
    case jafari

    public var id: String { rawValue }

    public var name: String {
        switch self {
        case .karachi: "University of Islamic Sciences, Karachi"
        case .muslimWorldLeague: "Muslim World League"
        case .northAmerica: "Islamic Society of North America"
        case .egyptian: "Egyptian General Authority of Survey"
        case .ummAlQura: "Umm al-Qura University, Makkah"
        case .dubai: "Dubai"
        case .kuwait: "Kuwait"
        case .qatar: "Qatar"
        case .singapore: "Singapore, Malaysia, Indonesia"
        case .tehran: "Institute of Geophysics, Tehran"
        case .jafari: "Shia Ithna-Ashari (Jafari)"
        }
    }

    var parameters: MethodParameters {
        switch self {
        case .karachi: .init(fajrAngle: 18, isha: .angle(18))
        case .muslimWorldLeague: .init(fajrAngle: 18, isha: .angle(17))
        case .northAmerica: .init(fajrAngle: 15, isha: .angle(15))
        case .egyptian: .init(fajrAngle: 19.5, isha: .angle(17.5))
        case .ummAlQura: .init(fajrAngle: 18.5, isha: .minutesAfterMaghrib(90, inRamadan: 120))
        case .dubai: .init(fajrAngle: 18.2, isha: .angle(18.2))
        case .kuwait: .init(fajrAngle: 18, isha: .angle(17.5))
        case .qatar: .init(fajrAngle: 18, isha: .minutesAfterMaghrib(90, inRamadan: 90))
        case .singapore: .init(fajrAngle: 20, isha: .angle(18))
        case .tehran: .init(fajrAngle: 17.7, isha: .angle(14), maghribAngle: 4.5)
        case .jafari: .init(fajrAngle: 16, isha: .angle(14), maghribAngle: 4)
        }
    }

    /// Short description of the twilight rule, for the settings screen.
    public var summary: String {
        let p = parameters
        let isha: String
        switch p.isha {
        case .angle(let degrees): isha = "Isha \(Self.format(degrees))°"
        case .minutesAfterMaghrib(let minutes, let ramadan):
            isha = ramadan == minutes
                ? "Isha \(Int(minutes)) min after Maghrib"
                : "Isha \(Int(minutes)) min after Maghrib (\(Int(ramadan)) in Ramadan)"
        }
        return "Fajr \(Self.format(p.fajrAngle))° · \(isha)"
    }

    private static func format(_ degrees: Double) -> String {
        degrees == degrees.rounded() ? String(Int(degrees)) : String(degrees)
    }
}

struct MethodParameters: Sendable {
    enum IshaRule: Sendable {
        /// Sun this many degrees below the horizon.
        case angle(Double)
        /// A fixed interval after Maghrib, longer during Ramadan for some authorities.
        case minutesAfterMaghrib(Double, inRamadan: Double)
    }

    var fajrAngle: Double
    var isha: IshaRule
    /// Nil means Maghrib is sunset. Shia methods wait for the sun to sink a few degrees further.
    var maghribAngle: Double?
}

/// How long an object's shadow must be for Asr to begin.
public enum AsrMadhab: String, CaseIterable, Codable, Sendable, Identifiable {
    /// Shafi'i, Maliki and Hanbali: shadow equals the object's height (plus its noon shadow).
    case standard
    /// Hanafi: shadow equals twice the object's height (plus its noon shadow).
    case hanafi

    public var id: String { rawValue }

    public var name: String {
        switch self {
        case .standard: "Standard (Shafi'i, Maliki, Hanbali)"
        case .hanafi: "Hanafi"
        }
    }

    var shadowFactor: Double { self == .hanafi ? 2 : 1 }
}

/// What to do at high latitudes when twilight never ends, or ends unreasonably late.
/// Fajr and Isha are capped at a portion of the night measured from sunrise and sunset.
public enum HighLatitudeRule: String, CaseIterable, Codable, Sendable, Identifiable {
    case twilightAngle
    case middleOfNight
    case seventhOfNight

    public var id: String { rawValue }

    public var name: String {
        switch self {
        case .twilightAngle: "Twilight angle"
        case .middleOfNight: "Middle of the night"
        case .seventhOfNight: "One seventh of the night"
        }
    }

    func nightPortion(forAngle angle: Double) -> Double {
        switch self {
        case .twilightAngle: angle / 60
        case .middleOfNight: 1.0 / 2
        case .seventhOfNight: 1.0 / 7
        }
    }
}

/// Minutes added to each computed time, for matching a local mosque's timetable.
public struct PrayerAdjustments: Codable, Hashable, Sendable {
    private var minutes: [String: Int] = [:]

    public init() {}

    public subscript(prayer: Prayer) -> Int {
        get { minutes[prayer.rawValue] ?? 0 }
        set { minutes[prayer.rawValue] = newValue == 0 ? nil : newValue }
    }
}

public struct PrayerConfiguration: Codable, Hashable, Sendable {
    public var method: CalculationMethod
    public var madhab: AsrMadhab
    public var highLatitudeRule: HighLatitudeRule
    public var adjustments: PrayerAdjustments

    public init(
        method: CalculationMethod,
        madhab: AsrMadhab,
        highLatitudeRule: HighLatitudeRule = .twilightAngle,
        adjustments: PrayerAdjustments = PrayerAdjustments()
    ) {
        self.method = method
        self.madhab = madhab
        self.highLatitudeRule = highLatitudeRule
        self.adjustments = adjustments
    }
}
