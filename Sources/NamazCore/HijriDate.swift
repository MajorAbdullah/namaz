import Foundation

public enum HijriDate {
    /// The Islamic date at `date`, e.g. "23 Rabiʻ II 1448".
    ///
    /// The Islamic day begins at sunset, so pass `afterMaghrib: true` once Maghrib has passed to
    /// get the date that has just begun. `dayOffset` shifts the result for regions whose moon
    /// sighting runs a day or two off the Umm al-Qura calendar.
    public static func string(
        for date: Date,
        timeZone: TimeZone,
        afterMaghrib: Bool = false,
        dayOffset: Int = 0
    ) -> String {
        var calendar = Calendar(identifier: .islamicUmmAlQura)
        calendar.timeZone = timeZone

        // Work from local noon so that adding whole days can never slip across a date boundary.
        let noon = CalendarDay(containing: date, in: timeZone).noon(in: timeZone)
        let shifted = noon.addingTimeInterval(Double(dayOffset + (afterMaghrib ? 1 : 0)) * 86_400)

        let formatter = DateFormatter()
        formatter.calendar = calendar
        formatter.timeZone = timeZone
        formatter.locale = Locale(identifier: "en_US")
        formatter.dateFormat = "d MMMM y"
        return formatter.string(from: shifted)
    }
}
