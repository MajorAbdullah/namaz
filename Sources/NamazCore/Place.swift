import Foundation

public struct Coordinates: Codable, Hashable, Sendable {
    /// Degrees, north positive.
    public var latitude: Double
    /// Degrees, east positive.
    public var longitude: Double

    public init(latitude: Double, longitude: Double) {
        self.latitude = latitude
        self.longitude = longitude
    }

    public var isValid: Bool {
        (-90...90).contains(latitude) && (-180...180).contains(longitude)
    }

    /// Compass bearing towards the Kaaba, in degrees clockwise from true north.
    public var qiblaBearing: Double {
        let kaaba = Coordinates(latitude: 21.4225, longitude: 39.8262)
        let deltaLongitude = kaaba.longitude - longitude
        let bearing = SolarMath.atan2(
            SolarMath.sin(deltaLongitude),
            SolarMath.cos(latitude) * SolarMath.tan(kaaba.latitude)
                - SolarMath.sin(latitude) * SolarMath.cos(deltaLongitude))
        return SolarMath.normalize(bearing, 360)
    }
}

/// A named location the prayer times are calculated for.
public struct Place: Codable, Hashable, Sendable {
    public var name: String
    public var coordinates: Coordinates

    public init(name: String, coordinates: Coordinates) {
        self.name = name
        self.coordinates = coordinates
    }
}

/// A built-in city for choosing a location without Location Services.
public struct City: Hashable, Sendable, Identifiable {
    public let name: String
    public let country: String
    public let coordinates: Coordinates
    public let timeZoneID: String

    public var id: String { "\(name), \(country)" }
    public var place: Place { Place(name: name, coordinates: coordinates) }

    init(_ name: String, _ country: String, _ latitude: Double, _ longitude: Double, _ timeZoneID: String) {
        self.name = name
        self.country = country
        self.coordinates = Coordinates(latitude: latitude, longitude: longitude)
        self.timeZoneID = timeZoneID
    }

    /// Countries in display order, each with its cities.
    public static var byCountry: [(country: String, cities: [City])] {
        var order: [String] = []
        var groups: [String: [City]] = [:]
        for city in all {
            if groups[city.country] == nil { order.append(city.country) }
            groups[city.country, default: []].append(city)
        }
        return order.map { ($0, groups[$0]!) }
    }

    public static let all: [City] = [
        City("Karachi", "Pakistan", 24.8607, 67.0011, "Asia/Karachi"),
        City("Lahore", "Pakistan", 31.5204, 74.3587, "Asia/Karachi"),
        City("Islamabad", "Pakistan", 33.6844, 73.0479, "Asia/Karachi"),
        City("Rawalpindi", "Pakistan", 33.5651, 73.0169, "Asia/Karachi"),
        City("Faisalabad", "Pakistan", 31.4504, 73.1350, "Asia/Karachi"),
        City("Multan", "Pakistan", 30.1575, 71.5249, "Asia/Karachi"),
        City("Peshawar", "Pakistan", 34.0151, 71.5249, "Asia/Karachi"),
        City("Quetta", "Pakistan", 30.1798, 66.9750, "Asia/Karachi"),
        City("Hyderabad", "Pakistan", 25.3960, 68.3578, "Asia/Karachi"),
        City("Gujranwala", "Pakistan", 32.1877, 74.1945, "Asia/Karachi"),
        City("Sialkot", "Pakistan", 32.4945, 74.5229, "Asia/Karachi"),
        City("Sargodha", "Pakistan", 32.0836, 72.6711, "Asia/Karachi"),
        City("Bahawalpur", "Pakistan", 29.3956, 71.6836, "Asia/Karachi"),
        City("Sukkur", "Pakistan", 27.7052, 68.8574, "Asia/Karachi"),
        City("Larkana", "Pakistan", 27.5570, 68.2028, "Asia/Karachi"),
        City("Abbottabad", "Pakistan", 34.1688, 73.2215, "Asia/Karachi"),
        City("Mardan", "Pakistan", 34.1986, 72.0404, "Asia/Karachi"),
        City("Muzaffarabad", "Pakistan", 34.3700, 73.4711, "Asia/Karachi"),
        City("Mirpur", "Pakistan", 33.1478, 73.7537, "Asia/Karachi"),
        City("Gilgit", "Pakistan", 35.9208, 74.3144, "Asia/Karachi"),
        City("Skardu", "Pakistan", 35.2971, 75.6333, "Asia/Karachi"),
        City("Gwadar", "Pakistan", 25.1264, 62.3225, "Asia/Karachi"),

        City("Makkah", "Saudi Arabia", 21.4225, 39.8262, "Asia/Riyadh"),
        City("Madinah", "Saudi Arabia", 24.4672, 39.6112, "Asia/Riyadh"),
        City("Riyadh", "Saudi Arabia", 24.7136, 46.6753, "Asia/Riyadh"),
        City("Jeddah", "Saudi Arabia", 21.4858, 39.1925, "Asia/Riyadh"),
        City("Dubai", "United Arab Emirates", 25.2048, 55.2708, "Asia/Dubai"),
        City("Abu Dhabi", "United Arab Emirates", 24.4539, 54.3773, "Asia/Dubai"),
        City("Doha", "Qatar", 25.2854, 51.5310, "Asia/Qatar"),
        City("Kuwait City", "Kuwait", 29.3759, 47.9774, "Asia/Kuwait"),
        City("Muscat", "Oman", 23.5880, 58.3829, "Asia/Muscat"),
        City("Manama", "Bahrain", 26.2285, 50.5860, "Asia/Bahrain"),

        City("Delhi", "India", 28.6139, 77.2090, "Asia/Kolkata"),
        City("Mumbai", "India", 19.0760, 72.8777, "Asia/Kolkata"),
        City("Hyderabad", "India", 17.3850, 78.4867, "Asia/Kolkata"),
        City("Dhaka", "Bangladesh", 23.8103, 90.4125, "Asia/Dhaka"),
        City("Kabul", "Afghanistan", 34.5553, 69.2075, "Asia/Kabul"),
        City("Colombo", "Sri Lanka", 6.9271, 79.8612, "Asia/Colombo"),

        City("Istanbul", "Türkiye", 41.0082, 28.9784, "Europe/Istanbul"),
        City("Cairo", "Egypt", 30.0444, 31.2357, "Africa/Cairo"),
        City("Tehran", "Iran", 35.6892, 51.3890, "Asia/Tehran"),
        City("Baghdad", "Iraq", 33.3152, 44.3661, "Asia/Baghdad"),
        City("Amman", "Jordan", 31.9454, 35.9284, "Asia/Amman"),
        City("Jerusalem", "Palestine", 31.7683, 35.2137, "Asia/Jerusalem"),

        City("Kuala Lumpur", "Malaysia", 3.1390, 101.6869, "Asia/Kuala_Lumpur"),
        City("Jakarta", "Indonesia", -6.2088, 106.8456, "Asia/Jakarta"),
        City("Singapore", "Singapore", 1.3521, 103.8198, "Asia/Singapore"),

        City("London", "United Kingdom", 51.5074, -0.1278, "Europe/London"),
        City("Birmingham", "United Kingdom", 52.4862, -1.8904, "Europe/London"),
        City("Manchester", "United Kingdom", 53.4808, -2.2426, "Europe/London"),
        City("Paris", "France", 48.8566, 2.3522, "Europe/Paris"),
        City("Berlin", "Germany", 52.5200, 13.4050, "Europe/Berlin"),

        City("New York", "United States", 40.7128, -74.0060, "America/New_York"),
        City("Chicago", "United States", 41.8781, -87.6298, "America/Chicago"),
        City("Houston", "United States", 29.7604, -95.3698, "America/Chicago"),
        City("Los Angeles", "United States", 34.0522, -118.2437, "America/Los_Angeles"),
        City("Toronto", "Canada", 43.6532, -79.3832, "America/Toronto"),

        City("Sydney", "Australia", -33.8688, 151.2093, "Australia/Sydney"),
        City("Melbourne", "Australia", -37.8136, 144.9631, "Australia/Melbourne"),
        City("Johannesburg", "South Africa", -26.2041, 28.0473, "Africa/Johannesburg"),
        City("Lagos", "Nigeria", 6.5244, 3.3792, "Africa/Lagos"),
        City("Casablanca", "Morocco", 33.5731, -7.5898, "Africa/Casablanca"),
    ]
}

/// Sensible starting settings for a Mac, inferred from its time zone alone.
public struct RegionalDefaults: Sendable {
    public let city: City
    public let method: CalculationMethod
    public let madhab: AsrMadhab

    public static func forTimeZone(_ timeZone: TimeZone) -> RegionalDefaults {
        let city = City.all.first { $0.timeZoneID == timeZone.identifier }
            ?? City.all.first { $0.name == "Makkah" }!

        let method: CalculationMethod
        var madhab = AsrMadhab.standard
        switch city.country {
        case "Pakistan", "India", "Bangladesh", "Afghanistan":
            method = .karachi
            madhab = .hanafi
        case "Saudi Arabia", "Oman", "Bahrain": method = .ummAlQura
        case "United Arab Emirates": method = .dubai
        case "Qatar": method = .qatar
        case "Kuwait": method = .kuwait
        case "Egypt": method = .egyptian
        case "Iran": method = .tehran
        case "Malaysia", "Indonesia", "Singapore": method = .singapore
        case "United States", "Canada": method = .northAmerica
        default: method = .muslimWorldLeague
        }
        return RegionalDefaults(city: city, method: method, madhab: madhab)
    }
}
