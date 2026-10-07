import Foundation
import Testing
@testable import NamazCore

/// Writes what NamazCore computes for a wide spread of places, days and settings to a JSON file,
/// so the Windows app's TypeScript port can be checked against it to the second. Does nothing
/// unless `NAMAZ_EXPORT_VECTORS` names the file to write:
///
///     NAMAZ_EXPORT_VECTORS=windows/src/test/vectors.json make test FILTER=GoldenVectors
@Suite struct GoldenVectors {
    /// Places that are not in `City.all` but stress the maths: the date line, polar nights and
    /// midnight suns, and the equator.
    private static let extremes: [(String, Double, Double, String)] = [
        ("Tromso", 69.6492, 18.9553, "Europe/Oslo"),
        ("Reykjavik", 64.1466, -21.9426, "Atlantic/Reykjavik"),
        ("Longyearbyen", 78.2232, 15.6267, "Arctic/Longyearbyen"),
        ("Apia", -13.8333, -171.7667, "Pacific/Apia"),
        ("Kiritimati", 1.8721, -157.4278, "Pacific/Kiritimati"),
        ("Ushuaia", -54.8019, -68.3030, "America/Argentina/Ushuaia"),
        ("Quito", -0.1807, -78.4678, "America/Guayaquil"),
        ("Auckland", -36.8509, 174.7645, "Pacific/Auckland"),
    ]

    private static let dates: [CalendarDay] = (1...12).map { CalendarDay(year: 2026, month: $0, day: 4) }
        + [CalendarDay(year: 2026, month: 3, day: 1), CalendarDay(year: 2026, month: 6, day: 21),
           CalendarDay(year: 2026, month: 12, day: 21), CalendarDay(year: 2027, month: 2, day: 20)]

    @Test func exportGoldenVectors() throws {
        guard let path = ProcessInfo.processInfo.environment["NAMAZ_EXPORT_VECTORS"] else { return }

        var places = City.all.map { ($0.name, $0.coordinates.latitude, $0.coordinates.longitude, $0.timeZoneID) }
        places += Self.extremes

        let methods = CalculationMethod.allCases
        let madhabs = AsrMadhab.allCases
        let rules = HighLatitudeRule.allCases

        var times: [[String: Any]] = []
        var index = 0
        for (name, latitude, longitude, zoneID) in places {
            let zone = try #require(TimeZone(identifier: zoneID))
            for day in Self.dates {
                // Three settings per place and day, walking through every combination over the file.
                for _ in 0..<3 {
                    let method = methods[index % methods.count]
                    let madhab = madhabs[(index / methods.count) % madhabs.count]
                    let rule = rules[(index / 2) % rules.count]
                    var configuration = PrayerConfiguration(method: method, madhab: madhab, highLatitudeRule: rule)
                    if index % 5 == 0 {
                        configuration.adjustments[.fajr] = 3
                        configuration.adjustments[.isha] = -2
                        configuration.adjustments[.dhuhr] = 69
                    }
                    let coordinates = Coordinates(latitude: latitude, longitude: longitude)
                    index += 1

                    func seconds(_ result: DailyPrayerTimes?) -> Any {
                        guard let result else { return NSNull() }
                        return Prayer.allCases.map { result[$0].timeIntervalSince1970 }
                    }
                    times.append([
                        "place": name, "latitude": latitude, "longitude": longitude, "zone": zoneID,
                        "day": [day.year, day.month, day.day],
                        "method": method.rawValue, "madhab": madhab.rawValue, "rule": rule.rawValue,
                        "adjustments": Prayer.allCases.map { configuration.adjustments[$0] },
                        "rounded": seconds(PrayerTimesCalculator.times(
                            for: day, at: coordinates, timeZone: zone, configuration: configuration,
                            roundingToMinute: true)),
                        "exact": seconds(PrayerTimesCalculator.times(
                            for: day, at: coordinates, timeZone: zone, configuration: configuration,
                            roundingToMinute: false)),
                        "qibla": coordinates.qiblaBearing,
                    ])
                }
            }
        }

        // Hijri dates across a few years, in two zones, with and without the sunset shift.
        var hijri: [[String: Any]] = []
        for zoneID in ["Asia/Karachi", "America/New_York", "Pacific/Apia"] {
            let zone = try #require(TimeZone(identifier: zoneID))
            for offset in stride(from: 0, to: 800, by: 7) {
                let day = CalendarDay(year: 2026, month: 1, day: 1).adding(days: offset)
                let noon = day.noon(in: zone)
                for afterMaghrib in [false, true] {
                    for dayOffset in [0, -1] {
                        hijri.append([
                            "zone": zoneID, "day": [day.year, day.month, day.day],
                            "afterMaghrib": afterMaghrib, "dayOffset": dayOffset,
                            "text": HijriDate.string(
                                for: noon, timeZone: zone, afterMaghrib: afterMaghrib, dayOffset: dayOffset),
                        ])
                    }
                }
            }
        }

        let defaults: [[String: String]] = Set(City.all.map(\.timeZoneID)).sorted().map { id in
            let value = RegionalDefaults.forTimeZone(TimeZone(identifier: id)!)
            return ["zone": id, "city": value.city.name, "country": value.city.country,
                    "method": value.method.rawValue, "madhab": value.madhab.rawValue]
        }

        let root: [String: Any] = [
            "note": "Generated by Tests/NamazCoreTests/GoldenVectors.swift. Times are seconds since 1970.",
            "times": times, "hijri": hijri, "regionalDefaults": defaults,
        ]
        let data = try JSONSerialization.data(
            withJSONObject: root, options: [.sortedKeys, .withoutEscapingSlashes])
        try data.write(to: URL(fileURLWithPath: path))
    }
}
