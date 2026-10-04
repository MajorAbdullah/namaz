import Foundation
import Testing
@testable import NamazCore

/// Checks each computed time against what it is defined to mean, using a separate and more
/// precise model of the sun (Meeus, Astronomical Algorithms, ch. 25). The two share no formulas,
/// so this catches errors that comparing against another prayer-time source cannot.
@Suite struct SunPositionTests {
    struct Sky {
        /// Degrees above the horizon, ignoring refraction.
        var altitude: Double
        /// Degrees west of the meridian; zero at solar noon.
        var hourAngle: Double
    }

    static func sky(at date: Date, from coordinates: Coordinates) -> Sky {
        func radians(_ degrees: Double) -> Double { degrees * .pi / 180 }
        func degrees(_ radians: Double) -> Double { radians * 180 / .pi }

        let julianDay = date.timeIntervalSince1970 / 86_400 + 2_440_587.5
        let t = (julianDay - 2_451_545.0) / 36_525
        let meanLongitude = 280.46646 + 36_000.76983 * t + 0.0003032 * t * t
        let anomaly = radians(357.52911 + 35_999.05029 * t - 0.0001537 * t * t)
        let centre = (1.914602 - 0.004817 * t - 0.000014 * t * t) * sin(anomaly)
            + (0.019993 - 0.000101 * t) * sin(2 * anomaly) + 0.000289 * sin(3 * anomaly)
        let node = radians(125.04 - 1934.136 * t)
        let longitude = radians(meanLongitude + centre - 0.00569 - 0.00478 * sin(node))
        let meanObliquity = 23 + (26 + (21.448 - 46.8150 * t - 0.00059 * t * t) / 60) / 60
        let obliquity = radians(meanObliquity + 0.00256 * cos(node))

        let rightAscension = atan2(cos(obliquity) * sin(longitude), cos(longitude))
        let declination = asin(sin(obliquity) * sin(longitude))
        let siderealTime = 280.46061837 + 360.98564736629 * (julianDay - 2_451_545.0)
        let hourAngle = radians(siderealTime + coordinates.longitude) - rightAscension

        let latitude = radians(coordinates.latitude)
        let altitude = asin(sin(latitude) * sin(declination)
            + cos(latitude) * cos(declination) * cos(hourAngle))
        var wrapped = degrees(hourAngle).truncatingRemainder(dividingBy: 360)
        if wrapped > 180 { wrapped -= 360 }
        if wrapped < -180 { wrapped += 360 }
        return Sky(altitude: degrees(altitude), hourAngle: wrapped)
    }

    /// Shadow length of a vertical object, in multiples of its height.
    static func shadow(at date: Date, from coordinates: Coordinates) -> Double {
        1 / tan(sky(at: date, from: coordinates).altitude * .pi / 180)
    }

    struct Location: Sendable, CustomTestStringConvertible {
        let name: String
        let coordinates: Coordinates
        let timeZoneID: String
        let method: CalculationMethod
        let fajrAngle: Double
        let ishaAngle: Double

        var testDescription: String { name }

        static let all = [
            Location(name: "Karachi", coordinates: Coordinates(latitude: 24.8607, longitude: 67.0011),
                     timeZoneID: "Asia/Karachi", method: .karachi, fajrAngle: 18, ishaAngle: 18),
            Location(name: "Islamabad", coordinates: Coordinates(latitude: 33.6844, longitude: 73.0479),
                     timeZoneID: "Asia/Karachi", method: .karachi, fajrAngle: 18, ishaAngle: 18),
            Location(name: "Makkah", coordinates: Coordinates(latitude: 21.4225, longitude: 39.8262),
                     timeZoneID: "Asia/Riyadh", method: .muslimWorldLeague, fajrAngle: 18, ishaAngle: 17),
            Location(name: "New York", coordinates: Coordinates(latitude: 40.7128, longitude: -74.0060),
                     timeZoneID: "America/New_York", method: .northAmerica, fajrAngle: 15, ishaAngle: 15),
            Location(name: "Sydney", coordinates: Coordinates(latitude: -33.8688, longitude: 151.2093),
                     timeZoneID: "Australia/Sydney", method: .egyptian, fajrAngle: 19.5, ishaAngle: 17.5),
        ]
    }

    /// One day in each month, so both solstices and both equinoxes are covered.
    static let days = (1...12).map { CalendarDay(year: 2026, month: $0, day: 4) }

    @Test("Each time is the instant the sun is where that prayer is defined", arguments: Location.all)
    func timesMatchTheirDefinitions(_ location: Location) throws {
        let timeZone = try #require(TimeZone(identifier: location.timeZoneID))

        for day in Self.days {
            for madhab in AsrMadhab.allCases {
                let times = try #require(PrayerTimesCalculator.times(
                    for: day, at: location.coordinates, timeZone: timeZone,
                    configuration: PrayerConfiguration(method: location.method, madhab: madhab),
                    roundingToMinute: false))
                func altitude(_ prayer: Prayer) -> Double {
                    Self.sky(at: times[prayer], from: location.coordinates).altitude
                }
                let context = Comment(rawValue: "\(location.name) \(day) \(madhab)")

                // 0.05° is the sun's movement in about 15 seconds.
                #expect(abs(altitude(.fajr) + location.fajrAngle) < 0.05, context)
                #expect(abs(altitude(.sunrise) + 0.833) < 0.05, context)
                #expect(abs(altitude(.maghrib) + 0.833) < 0.05, context)
                #expect(abs(altitude(.isha) + location.ishaAngle) < 0.05, context)

                // Dhuhr is the moment the sun crosses the meridian.
                let noon = Self.sky(at: times.dhuhr, from: location.coordinates)
                #expect(abs(noon.hourAngle) < 0.05, context)

                // Asr begins when a shadow has grown by the object's height (twice, for Hanafi)
                // beyond its length at noon.
                let growth = Self.shadow(at: times.asr, from: location.coordinates)
                    - Self.shadow(at: times.dhuhr, from: location.coordinates)
                #expect(abs(growth - madhab.shadowFactor) < 0.004, context)
            }
        }
    }
}
