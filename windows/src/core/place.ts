import { atan2, cos, normalize, sin, tan } from "./solarMath";
import type { AsrMadhab, CalculationMethod } from "./calculationMethod";

export interface Coordinates {
  /** Degrees, north positive. */
  latitude: number;
  /** Degrees, east positive. */
  longitude: number;
}

export function coordinatesAreValid(c: Coordinates): boolean {
  return c.latitude >= -90 && c.latitude <= 90 && c.longitude >= -180 && c.longitude <= 180;
}

const KAABA: Coordinates = { latitude: 21.4225, longitude: 39.8262 };

/** Compass bearing towards the Kaaba, in degrees clockwise from true north. */
export function qiblaBearing(c: Coordinates): number {
  const deltaLongitude = KAABA.longitude - c.longitude;
  const bearing = atan2(
    sin(deltaLongitude),
    cos(c.latitude) * tan(KAABA.latitude) - sin(c.latitude) * cos(deltaLongitude),
  );
  return normalize(bearing, 360);
}

/** "268° W": the Qibla bearing with its nearest compass point. */
export function qiblaDescription(c: Coordinates): string {
  const points = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const bearing = qiblaBearing(c);
  return `${Math.round(bearing)}° ${points[Math.floor((bearing + 22.5) / 45) % 8]}`;
}

/** A named location the prayer times are calculated for. */
export interface Place {
  name: string;
  coordinates: Coordinates;
}

/** A built-in city for choosing a location without Location Services. */
export interface City {
  name: string;
  country: string;
  coordinates: Coordinates;
  timeZoneID: string;
}

function c(name: string, country: string, latitude: number, longitude: number, timeZoneID: string): City {
  return { name, country, coordinates: { latitude, longitude }, timeZoneID };
}

export function cityId(city: City): string {
  return `${city.name}, ${city.country}`;
}

export function cityPlace(city: City): Place {
  return { name: city.name, coordinates: city.coordinates };
}

export const CITIES: readonly City[] = [
  c("Karachi", "Pakistan", 24.8607, 67.0011, "Asia/Karachi"),
  c("Lahore", "Pakistan", 31.5204, 74.3587, "Asia/Karachi"),
  c("Islamabad", "Pakistan", 33.6844, 73.0479, "Asia/Karachi"),
  c("Rawalpindi", "Pakistan", 33.5651, 73.0169, "Asia/Karachi"),
  c("Faisalabad", "Pakistan", 31.4504, 73.1350, "Asia/Karachi"),
  c("Multan", "Pakistan", 30.1575, 71.5249, "Asia/Karachi"),
  c("Peshawar", "Pakistan", 34.0151, 71.5249, "Asia/Karachi"),
  c("Quetta", "Pakistan", 30.1798, 66.9750, "Asia/Karachi"),
  c("Hyderabad", "Pakistan", 25.3960, 68.3578, "Asia/Karachi"),
  c("Gujranwala", "Pakistan", 32.1877, 74.1945, "Asia/Karachi"),
  c("Sialkot", "Pakistan", 32.4945, 74.5229, "Asia/Karachi"),
  c("Sargodha", "Pakistan", 32.0836, 72.6711, "Asia/Karachi"),
  c("Bahawalpur", "Pakistan", 29.3956, 71.6836, "Asia/Karachi"),
  c("Sukkur", "Pakistan", 27.7052, 68.8574, "Asia/Karachi"),
  c("Larkana", "Pakistan", 27.5570, 68.2028, "Asia/Karachi"),
  c("Abbottabad", "Pakistan", 34.1688, 73.2215, "Asia/Karachi"),
  c("Mardan", "Pakistan", 34.1986, 72.0404, "Asia/Karachi"),
  c("Muzaffarabad", "Pakistan", 34.3700, 73.4711, "Asia/Karachi"),
  c("Mirpur", "Pakistan", 33.1478, 73.7537, "Asia/Karachi"),
  c("Gilgit", "Pakistan", 35.9208, 74.3144, "Asia/Karachi"),
  c("Skardu", "Pakistan", 35.2971, 75.6333, "Asia/Karachi"),
  c("Gwadar", "Pakistan", 25.1264, 62.3225, "Asia/Karachi"),
  c("Makkah", "Saudi Arabia", 21.4225, 39.8262, "Asia/Riyadh"),
  c("Madinah", "Saudi Arabia", 24.4672, 39.6112, "Asia/Riyadh"),
  c("Riyadh", "Saudi Arabia", 24.7136, 46.6753, "Asia/Riyadh"),
  c("Jeddah", "Saudi Arabia", 21.4858, 39.1925, "Asia/Riyadh"),
  c("Dubai", "United Arab Emirates", 25.2048, 55.2708, "Asia/Dubai"),
  c("Abu Dhabi", "United Arab Emirates", 24.4539, 54.3773, "Asia/Dubai"),
  c("Doha", "Qatar", 25.2854, 51.5310, "Asia/Qatar"),
  c("Kuwait City", "Kuwait", 29.3759, 47.9774, "Asia/Kuwait"),
  c("Muscat", "Oman", 23.5880, 58.3829, "Asia/Muscat"),
  c("Manama", "Bahrain", 26.2285, 50.5860, "Asia/Bahrain"),
  c("Delhi", "India", 28.6139, 77.2090, "Asia/Kolkata"),
  c("Mumbai", "India", 19.0760, 72.8777, "Asia/Kolkata"),
  c("Hyderabad", "India", 17.3850, 78.4867, "Asia/Kolkata"),
  c("Dhaka", "Bangladesh", 23.8103, 90.4125, "Asia/Dhaka"),
  c("Kabul", "Afghanistan", 34.5553, 69.2075, "Asia/Kabul"),
  c("Colombo", "Sri Lanka", 6.9271, 79.8612, "Asia/Colombo"),
  c("Istanbul", "Türkiye", 41.0082, 28.9784, "Europe/Istanbul"),
  c("Cairo", "Egypt", 30.0444, 31.2357, "Africa/Cairo"),
  c("Tehran", "Iran", 35.6892, 51.3890, "Asia/Tehran"),
  c("Baghdad", "Iraq", 33.3152, 44.3661, "Asia/Baghdad"),
  c("Amman", "Jordan", 31.9454, 35.9284, "Asia/Amman"),
  c("Jerusalem", "Palestine", 31.7683, 35.2137, "Asia/Jerusalem"),
  c("Kuala Lumpur", "Malaysia", 3.1390, 101.6869, "Asia/Kuala_Lumpur"),
  c("Jakarta", "Indonesia", -6.2088, 106.8456, "Asia/Jakarta"),
  c("Singapore", "Singapore", 1.3521, 103.8198, "Asia/Singapore"),
  c("London", "United Kingdom", 51.5074, -0.1278, "Europe/London"),
  c("Birmingham", "United Kingdom", 52.4862, -1.8904, "Europe/London"),
  c("Manchester", "United Kingdom", 53.4808, -2.2426, "Europe/London"),
  c("Paris", "France", 48.8566, 2.3522, "Europe/Paris"),
  c("Berlin", "Germany", 52.5200, 13.4050, "Europe/Berlin"),
  c("New York", "United States", 40.7128, -74.0060, "America/New_York"),
  c("Chicago", "United States", 41.8781, -87.6298, "America/Chicago"),
  c("Houston", "United States", 29.7604, -95.3698, "America/Chicago"),
  c("Los Angeles", "United States", 34.0522, -118.2437, "America/Los_Angeles"),
  c("Toronto", "Canada", 43.6532, -79.3832, "America/Toronto"),
  c("Sydney", "Australia", -33.8688, 151.2093, "Australia/Sydney"),
  c("Melbourne", "Australia", -37.8136, 144.9631, "Australia/Melbourne"),
  c("Johannesburg", "South Africa", -26.2041, 28.0473, "Africa/Johannesburg"),
  c("Lagos", "Nigeria", 6.5244, 3.3792, "Africa/Lagos"),
  c("Casablanca", "Morocco", 33.5731, -7.5898, "Africa/Casablanca"),
];

/** Countries in display order, each with its cities. */
export function citiesByCountry(): { country: string; cities: City[] }[] {
  const groups = new Map<string, City[]>();
  for (const city of CITIES) {
    const list = groups.get(city.country) ?? [];
    list.push(city);
    groups.set(city.country, list);
  }
  return [...groups].map(([country, cities]) => ({ country, cities }));
}

/** The city closest to `coordinates`, by great-circle distance. */
export function nearestCity(coordinates: Coordinates): City {
  const toRad = Math.PI / 180;
  const distance = (a: Coordinates, b: Coordinates) => {
    const dLat = (b.latitude - a.latitude) * toRad;
    const dLon = (b.longitude - a.longitude) * toRad;
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(a.latitude * toRad) * Math.cos(b.latitude * toRad) * Math.sin(dLon / 2) ** 2;
    return 2 * Math.asin(Math.min(1, Math.sqrt(h)));
  };
  let best = CITIES[0];
  for (const city of CITIES) {
    if (distance(coordinates, city.coordinates) < distance(coordinates, best.coordinates)) best = city;
  }
  return best;
}

export interface RegionalDefaults {
  city: City;
  method: CalculationMethod;
  madhab: AsrMadhab;
}

/** Sensible starting settings for a computer in the given time zone, inferred from the zone alone. */
export function regionalDefaultsForTimeZone(timeZoneID: string): RegionalDefaults {
  const city =
    CITIES.find((candidate) => candidate.timeZoneID === timeZoneID) ??
    CITIES.find((candidate) => candidate.name === "Makkah")!;

  let method: CalculationMethod;
  let madhab: AsrMadhab = "standard";
  switch (city.country) {
    case "Pakistan":
    case "India":
    case "Bangladesh":
    case "Afghanistan":
      method = "karachi";
      madhab = "hanafi";
      break;
    case "Saudi Arabia":
    case "Oman":
    case "Bahrain":
      method = "ummAlQura";
      break;
    case "United Arab Emirates":
      method = "dubai";
      break;
    case "Qatar":
      method = "qatar";
      break;
    case "Kuwait":
      method = "kuwait";
      break;
    case "Egypt":
      method = "egyptian";
      break;
    case "Iran":
      method = "tehran";
      break;
    case "Malaysia":
    case "Indonesia":
    case "Singapore":
      method = "singapore";
      break;
    case "United States":
    case "Canada":
      method = "northAmerica";
      break;
    default:
      method = "muslimWorldLeague";
  }
  return { city, method, madhab };
}
