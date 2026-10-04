import Foundation

/// Low-precision solar position (US Naval Observatory formulas, as used by PrayTimes.org).
/// Accurate to about an arcminute for dates within two centuries of 2000, which keeps
/// prayer times well inside the one-minute resolution they are published at.
enum SolarMath {
    struct SunPosition {
        /// Degrees north of the celestial equator.
        var declination: Double
        /// Apparent solar time minus mean solar time, in hours.
        var equationOfTime: Double
    }

    /// Julian day number at 0h UT on the given Gregorian date.
    static func julianDay(year: Int, month: Int, day: Int) -> Double {
        var y = Double(year)
        var m = Double(month)
        if month <= 2 {
            y -= 1
            m += 12
        }
        let century = (y / 100).rounded(.down)
        let leapCorrection = 2 - century + (century / 4).rounded(.down)
        return (365.25 * (y + 4716)).rounded(.down)
            + (30.6001 * (m + 1)).rounded(.down)
            + Double(day) + leapCorrection - 1524.5
    }

    static func sunPosition(julianDay: Double) -> SunPosition {
        let d = julianDay - 2_451_545.0
        let meanAnomaly = normalize(357.529 + 0.98560028 * d, 360)
        let meanLongitude = normalize(280.459 + 0.98564736 * d, 360)
        let eclipticLongitude = normalize(
            meanLongitude + 1.915 * sin(meanAnomaly) + 0.020 * sin(2 * meanAnomaly), 360)
        let obliquity = 23.439 - 0.00000036 * d

        let rightAscension = normalize(
            atan2(cos(obliquity) * sin(eclipticLongitude), cos(eclipticLongitude)) / 15, 24)
        // Both terms wrap at 24h independently, so bring the difference back near zero.
        var equationOfTime = meanLongitude / 15 - rightAscension
        equationOfTime -= 24 * (equationOfTime / 24).rounded()

        return SunPosition(
            declination: asin(sin(obliquity) * sin(eclipticLongitude)),
            equationOfTime: equationOfTime)
    }

    /// Hours between solar noon and the moment the sun's centre is `depression` degrees
    /// below the horizon (negative for above). Nil when the sun never reaches that angle.
    static func hourAngle(depression: Double, latitude: Double, declination: Double) -> Double? {
        let cosine = (-sin(depression) - sin(declination) * sin(latitude))
            / (cos(declination) * cos(latitude))
        guard cosine >= -1, cosine <= 1 else { return nil }
        return acos(cosine) / 15
    }

    /// Sun altitude at which an object's shadow is `shadowFactor` times its height
    /// longer than it was at noon.
    static func asrAltitude(shadowFactor: Double, latitude: Double, declination: Double) -> Double {
        atan(1 / (shadowFactor + tan(abs(latitude - declination))))
    }

    static func normalize(_ value: Double, _ modulus: Double) -> Double {
        let remainder = value.truncatingRemainder(dividingBy: modulus)
        return remainder < 0 ? remainder + modulus : remainder
    }

    // Trigonometry in degrees.
    static func sin(_ degrees: Double) -> Double { Foundation.sin(degrees * .pi / 180) }
    static func cos(_ degrees: Double) -> Double { Foundation.cos(degrees * .pi / 180) }
    static func tan(_ degrees: Double) -> Double { Foundation.tan(degrees * .pi / 180) }
    static func asin(_ x: Double) -> Double { Foundation.asin(x) * 180 / .pi }
    static func acos(_ x: Double) -> Double { Foundation.acos(x) * 180 / .pi }
    static func atan(_ x: Double) -> Double { Foundation.atan(x) * 180 / .pi }
    static func atan2(_ y: Double, _ x: Double) -> Double { Foundation.atan2(y, x) * 180 / .pi }
}
