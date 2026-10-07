import { describe, expect, it } from "vitest";
import {
  type AsrMadhab,
  type CalculationMethod,
  type Coordinates,
  makeConfiguration,
  prayerTimes,
  type Prayer,
  shadowFactor,
} from "../core";

/**
 * Checks each computed time against what it is defined to mean, using a separate and more precise
 * model of the sun (Meeus, Astronomical Algorithms, ch. 25). The two share no formulas, so this
 * catches errors that comparing against another prayer-time source cannot. The tolerances are the
 * Swift app's own and must not be loosened to make a change fit.
 */
const rad = (degrees: number) => (degrees * Math.PI) / 180;
const deg = (radians: number) => (radians * 180) / Math.PI;

function sky(instant: number, c: Coordinates) {
  const julianDay = instant / 86_400 + 2_440_587.5;
  const t = (julianDay - 2_451_545.0) / 36_525;
  const meanLongitude = 280.46646 + 36_000.76983 * t + 0.0003032 * t * t;
  const anomaly = rad(357.52911 + 35_999.05029 * t - 0.0001537 * t * t);
  const centre =
    (1.914602 - 0.004817 * t - 0.000014 * t * t) * Math.sin(anomaly) +
    (0.019993 - 0.000101 * t) * Math.sin(2 * anomaly) +
    0.000289 * Math.sin(3 * anomaly);
  const node = rad(125.04 - 1934.136 * t);
  const longitude = rad(meanLongitude + centre - 0.00569 - 0.00478 * Math.sin(node));
  const meanObliquity = 23 + (26 + (21.448 - 46.815 * t - 0.00059 * t * t) / 60) / 60;
  const obliquity = rad(meanObliquity + 0.00256 * Math.cos(node));

  const rightAscension = Math.atan2(Math.cos(obliquity) * Math.sin(longitude), Math.cos(longitude));
  const declination = Math.asin(Math.sin(obliquity) * Math.sin(longitude));
  const siderealTime = 280.46061837 + 360.98564736629 * (julianDay - 2_451_545.0);
  const hourAngle = rad(siderealTime + c.longitude) - rightAscension;

  const latitude = rad(c.latitude);
  const altitude = Math.asin(
    Math.sin(latitude) * Math.sin(declination) +
      Math.cos(latitude) * Math.cos(declination) * Math.cos(hourAngle),
  );
  let wrapped = deg(hourAngle) % 360;
  if (wrapped > 180) wrapped -= 360;
  if (wrapped < -180) wrapped += 360;
  return { altitude: deg(altitude), hourAngle: wrapped };
}

/** Shadow length of a vertical object, in multiples of its height. */
const shadow = (instant: number, c: Coordinates) => 1 / Math.tan(rad(sky(instant, c).altitude));

interface Location {
  name: string;
  coordinates: Coordinates;
  zone: string;
  method: CalculationMethod;
  fajrAngle: number;
  ishaAngle: number;
}

const LOCATIONS: Location[] = [
  { name: "Karachi", coordinates: { latitude: 24.8607, longitude: 67.0011 }, zone: "Asia/Karachi", method: "karachi", fajrAngle: 18, ishaAngle: 18 },
  { name: "Islamabad", coordinates: { latitude: 33.6844, longitude: 73.0479 }, zone: "Asia/Karachi", method: "karachi", fajrAngle: 18, ishaAngle: 18 },
  { name: "Makkah", coordinates: { latitude: 21.4225, longitude: 39.8262 }, zone: "Asia/Riyadh", method: "muslimWorldLeague", fajrAngle: 18, ishaAngle: 17 },
  { name: "New York", coordinates: { latitude: 40.7128, longitude: -74.006 }, zone: "America/New_York", method: "northAmerica", fajrAngle: 15, ishaAngle: 15 },
  { name: "Sydney", coordinates: { latitude: -33.8688, longitude: 151.2093 }, zone: "Australia/Sydney", method: "egyptian", fajrAngle: 19.5, ishaAngle: 17.5 },
];

describe("each time is the instant the sun is where that prayer is defined", () => {
  it.each(LOCATIONS)("$name", (location) => {
    // One day in each month, so both solstices and both equinoxes are covered.
    for (let month = 1; month <= 12; month++) {
      for (const madhab of ["standard", "hanafi"] as AsrMadhab[]) {
        const times = prayerTimes(
          { year: 2026, month, day: 4 },
          location.coordinates,
          location.zone,
          makeConfiguration(location.method, madhab),
          false,
        )!;
        const altitude = (prayer: Prayer) => sky(times.at(prayer), location.coordinates).altitude;
        const context = `${location.name} 2026-${month}-4 ${madhab}`;

        // 0.05° is the sun's movement in about 15 seconds.
        expect(Math.abs(altitude("fajr") + location.fajrAngle), context).toBeLessThan(0.05);
        expect(Math.abs(altitude("sunrise") + 0.833), context).toBeLessThan(0.05);
        expect(Math.abs(altitude("maghrib") + 0.833), context).toBeLessThan(0.05);
        expect(Math.abs(altitude("isha") + location.ishaAngle), context).toBeLessThan(0.05);

        // Dhuhr is the moment the sun crosses the meridian.
        expect(Math.abs(sky(times.dhuhr, location.coordinates).hourAngle), context).toBeLessThan(0.05);

        // Asr begins when a shadow has grown by the object's height (twice, for Hanafi) beyond
        // its length at noon.
        const growth = shadow(times.asr, location.coordinates) - shadow(times.dhuhr, location.coordinates);
        expect(Math.abs(growth - shadowFactor(madhab)), context).toBeLessThan(0.004);
      }
    }
  });
});
