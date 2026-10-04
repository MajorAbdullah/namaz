import Foundation
import NamazCore

/// Formats clock times the way the user asked for, in a given time zone.
@MainActor
struct ClockFormat {
    let uses24Hour: Bool
    let timeZone: TimeZone

    init(style: AppSettings.ClockStyle, timeZone: TimeZone) {
        switch style {
        case .twelveHour: uses24Hour = false
        case .twentyFourHour: uses24Hour = true
        case .system:
            // "j" asks for the locale's preferred hour; an "a" in the result means AM/PM.
            let template = DateFormatter.dateFormat(fromTemplate: "j", options: 0, locale: .current)
            uses24Hour = !(template ?? "").contains("a")
        }
        self.timeZone = timeZone
    }

    /// "3:48 PM" or "15:48".
    func time(_ date: Date) -> String {
        formatter(uses24Hour ? "HH:mm" : "h:mm a").string(from: date)
    }

    /// "3:48" or "15:48", for tight columns where AM/PM is obvious from context.
    func shortTime(_ date: Date) -> String {
        formatter(uses24Hour ? "HH:mm" : "h:mm").string(from: date)
    }

    private static var cache: [String: DateFormatter] = [:]

    private func formatter(_ format: String) -> DateFormatter {
        let key = "\(format)|\(timeZone.identifier)"
        if let cached = Self.cache[key] { return cached }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = timeZone
        formatter.dateFormat = format
        Self.cache[key] = formatter
        return formatter
    }
}

enum Countdown {
    /// "1:12:45", or "12:45" inside the last hour.
    static func precise(_ interval: TimeInterval) -> String {
        let total = max(0, Int(interval.rounded(.up)))
        let (hours, minutes, seconds) = (total / 3600, total % 3600 / 60, total % 60)
        return hours > 0
            ? String(format: "%d:%02d:%02d", hours, minutes, seconds)
            : String(format: "%d:%02d", minutes, seconds)
    }

    /// "1h 12m" or "12m", for the menu bar where a ticking seconds display would distract.
    static func coarse(_ interval: TimeInterval) -> String {
        let minutes = max(1, Int((interval / 60).rounded(.up)))
        return minutes >= 60 ? "\(minutes / 60)h \(minutes % 60)m" : "\(minutes)m"
    }
}

extension Coordinates {
    /// "268° W": the Qibla bearing with its nearest compass point.
    var qiblaDescription: String {
        let points = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
        let bearing = qiblaBearing
        return "\(Int(bearing.rounded()))° \(points[Int((bearing + 22.5) / 45) % 8])"
    }
}

extension Prayer {
    var symbolName: String {
        switch self {
        case .fajr: "sun.horizon.fill"
        case .sunrise: "sunrise.fill"
        case .dhuhr: "sun.max.fill"
        case .asr: "sun.min.fill"
        case .maghrib: "sunset.fill"
        case .isha: "moon.stars.fill"
        }
    }
}
