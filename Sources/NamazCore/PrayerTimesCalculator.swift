import Foundation

/// The six event times for one calendar day at one location, rounded to the minute.
public struct DailyPrayerTimes: Hashable, Sendable {
    public let day: CalendarDay
    public let fajr: Date
    public let sunrise: Date
    public let dhuhr: Date
    public let asr: Date
    public let maghrib: Date
    public let isha: Date

    public subscript(prayer: Prayer) -> Date {
        switch prayer {
        case .fajr: fajr
        case .sunrise: sunrise
        case .dhuhr: dhuhr
        case .asr: asr
        case .maghrib: maghrib
        case .isha: isha
        }
    }

    public var events: [PrayerEvent] {
        Prayer.allCases.map { PrayerEvent(prayer: $0, time: self[$0]) }
    }
}

public enum PrayerTimesCalculator {
    /// Sun's centre this far below the horizon at sunrise and sunset: atmospheric refraction
    /// plus the sun's radius.
    private static let horizonDepression = 0.833

    /// Prayer times for `day` as that date is reckoned in `timeZone`.
    /// Returns nil where the sun does not rise or set that day (polar regions).
    public static func times(
        for day: CalendarDay,
        at coordinates: Coordinates,
        timeZone: TimeZone,
        configuration: PrayerConfiguration
    ) -> DailyPrayerTimes? {
        times(for: day, at: coordinates, timeZone: timeZone, configuration: configuration,
              roundingToMinute: true)
    }

    /// `roundingToMinute: false` exposes the exact computed instants, so tests can check them
    /// against the sun's actual position.
    static func times(
        for day: CalendarDay,
        at coordinates: Coordinates,
        timeZone: TimeZone,
        configuration: PrayerConfiguration,
        roundingToMinute: Bool
    ) -> DailyPrayerTimes? {
        guard coordinates.isValid else { return nil }
        let inRamadanNight = isRamadan(day.adding(days: 1), timeZone: timeZone)
        let utcJulianDay = SolarMath.julianDay(year: day.year, month: day.month, day: day.day)

        // Times come out as hours of local mean solar time, which runs longitude/15 hours ahead
        // of UTC. The solar day belonging to a calendar date is the one whose noon lands on that
        // date locally: the same UTC date nearly everywhere, a day either side near the date line.
        for shift in [0.0, -1.0, 1.0] {
            let julianDay = utcJulianDay + shift - coordinates.longitude / 360
            guard let hours = solarHours(
                julianDay: julianDay, latitude: coordinates.latitude,
                configuration: configuration, inRamadanNight: inRamadanNight)
            else { continue }

            let solarMidnight = day.utcMidnight
                .addingTimeInterval((shift * 24 - coordinates.longitude / 15) * 3600)
            guard CalendarDay(containing: solarMidnight + hours.dhuhr * 3600, in: timeZone) == day
            else { continue }

            func date(_ prayer: Prayer, _ hour: Double) -> Date {
                var seconds = (solarMidnight + hour * 3600).timeIntervalSinceReferenceDate
                if roundingToMinute { seconds = (seconds / 60).rounded() * 60 }
                return Date(timeIntervalSinceReferenceDate:
                    seconds + Double(configuration.adjustments[prayer]) * 60)
            }
            return DailyPrayerTimes(
                day: day,
                fajr: date(.fajr, hours.fajr),
                sunrise: date(.sunrise, hours.sunrise),
                dhuhr: date(.dhuhr, hours.dhuhr),
                asr: date(.asr, hours.asr),
                maghrib: date(.maghrib, hours.maghrib),
                isha: date(.isha, hours.isha))
        }
        return nil
    }

    private struct SolarHours {
        var fajr, sunrise, dhuhr, asr, maghrib, isha: Double
    }

    /// Event times in hours after local mean solar midnight, where `julianDay` is that midnight.
    private static func solarHours(
        julianDay: Double,
        latitude: Double,
        configuration: PrayerConfiguration,
        inRamadanNight: Bool
    ) -> SolarHours? {
        let parameters = configuration.method.parameters

        func sun(at hour: Double) -> SolarMath.SunPosition {
            SolarMath.sunPosition(julianDay: julianDay + hour / 24)
        }
        /// When the sun crosses `depression` degrees below the horizon, on the given side of noon.
        /// The sun's position is sampled at `hour`, an estimate of the answer.
        func crossing(_ depression: Double, near hour: Double, beforeNoon: Bool) -> Double? {
            let position = sun(at: hour)
            guard let angle = SolarMath.hourAngle(
                depression: depression, latitude: latitude, declination: position.declination)
            else { return nil }
            return 12 - position.equationOfTime + (beforeNoon ? -angle : angle)
        }

        // Rough starting points, refined by re-sampling the sun at each result.
        var dhuhr = 12.0, sunrise = 6.0, sunset = 18.0, asr = 13.0
        var fajrEstimate = 5.0, ishaEstimate = 18.0, maghribEstimate = 18.0
        var fajr: Double?, isha: Double?, maghribByAngle: Double?

        for _ in 0..<3 {
            dhuhr = 12 - sun(at: dhuhr).equationOfTime
            guard let rise = crossing(horizonDepression, near: sunrise, beforeNoon: true),
                  let set = crossing(horizonDepression, near: sunset, beforeNoon: false)
            else { return nil }
            sunrise = rise
            sunset = set

            let asrAltitude = SolarMath.asrAltitude(
                shadowFactor: configuration.madhab.shadowFactor,
                latitude: latitude, declination: sun(at: asr).declination)
            guard let afternoon = crossing(-asrAltitude, near: asr, beforeNoon: false)
            else { return nil }
            asr = afternoon

            fajr = crossing(parameters.fajrAngle, near: fajrEstimate, beforeNoon: true)
            fajrEstimate = fajr ?? fajrEstimate
            if case .angle(let angle) = parameters.isha {
                isha = crossing(angle, near: ishaEstimate, beforeNoon: false)
                ishaEstimate = isha ?? ishaEstimate
            }
            if let angle = parameters.maghribAngle {
                maghribByAngle = crossing(angle, near: maghribEstimate, beforeNoon: false)
                maghribEstimate = maghribByAngle ?? maghribEstimate
            }
        }

        // Twilight that never ends, or ends too deep into the night, is capped at a portion of
        // the night measured from sunrise or sunset.
        let night = 24 - (sunset - sunrise)
        func capped(_ time: Double?, angle: Double, from base: Double, direction: Double) -> Double {
            let limit = configuration.highLatitudeRule.nightPortion(forAngle: angle) * night
            if let time, abs(time - base) <= limit { return time }
            return base + direction * limit
        }

        let maghrib = parameters.maghribAngle.map {
            capped(maghribByAngle, angle: $0, from: sunset, direction: 1)
        } ?? sunset

        let finalIsha: Double
        switch parameters.isha {
        case .angle(let angle):
            finalIsha = capped(isha, angle: angle, from: sunset, direction: 1)
        case .minutesAfterMaghrib(let minutes, let ramadanMinutes):
            finalIsha = maghrib + (inRamadanNight ? ramadanMinutes : minutes) / 60
        }

        return SolarHours(
            fajr: capped(fajr, angle: parameters.fajrAngle, from: sunrise, direction: -1),
            sunrise: sunrise,
            dhuhr: dhuhr,
            asr: asr,
            maghrib: maghrib,
            isha: finalIsha)
    }

    /// Whether `day` falls in Ramadan by the Umm al-Qura calendar. The night's Isha belongs to
    /// the Islamic day that began at sunset, so callers pass the following Gregorian day.
    private static func isRamadan(_ day: CalendarDay, timeZone: TimeZone) -> Bool {
        var hijri = Calendar(identifier: .islamicUmmAlQura)
        hijri.timeZone = timeZone
        return hijri.component(.month, from: day.noon(in: timeZone)) == 9
    }
}
