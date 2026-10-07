/**
 * Low-precision solar position (US Naval Observatory formulas, as used by PrayTimes.org).
 * Accurate to about an arcminute for dates within two centuries of 2000, which keeps
 * prayer times well inside the one-minute resolution they are published at.
 */
import { roundHalfAway } from "./time";

export interface SunPosition {
  /** Degrees north of the celestial equator. */
  declination: number;
  /** Apparent solar time minus mean solar time, in hours. */
  equationOfTime: number;
}

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

// Trigonometry in degrees.
export const sin = (degrees: number) => Math.sin(degrees * RAD);
export const cos = (degrees: number) => Math.cos(degrees * RAD);
export const tan = (degrees: number) => Math.tan(degrees * RAD);
export const asin = (x: number) => Math.asin(x) * DEG;
export const acos = (x: number) => Math.acos(x) * DEG;
export const atan = (x: number) => Math.atan(x) * DEG;
export const atan2 = (y: number, x: number) => Math.atan2(y, x) * DEG;

export function normalize(value: number, modulus: number): number {
  const remainder = value % modulus;
  return remainder < 0 ? remainder + modulus : remainder;
}

/** Julian day number at 0h UT on the given Gregorian date. */
export function julianDay(year: number, month: number, day: number): number {
  let y = year;
  let m = month;
  if (month <= 2) {
    y -= 1;
    m += 12;
  }
  const century = Math.floor(y / 100);
  const leapCorrection = 2 - century + Math.floor(century / 4);
  return (
    Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + day + leapCorrection - 1524.5
  );
}

export function sunPosition(julian: number): SunPosition {
  const d = julian - 2_451_545.0;
  const meanAnomaly = normalize(357.529 + 0.98560028 * d, 360);
  const meanLongitude = normalize(280.459 + 0.98564736 * d, 360);
  const eclipticLongitude = normalize(
    meanLongitude + 1.915 * sin(meanAnomaly) + 0.02 * sin(2 * meanAnomaly),
    360,
  );
  const obliquity = 23.439 - 0.00000036 * d;

  const rightAscension = normalize(
    atan2(cos(obliquity) * sin(eclipticLongitude), cos(eclipticLongitude)) / 15,
    24,
  );
  // Both terms wrap at 24h independently, so bring the difference back near zero.
  let equationOfTime = meanLongitude / 15 - rightAscension;
  equationOfTime -= 24 * roundHalfAway(equationOfTime / 24);

  return {
    declination: asin(sin(obliquity) * sin(eclipticLongitude)),
    equationOfTime,
  };
}

/**
 * Hours between solar noon and the moment the sun's centre is `depression` degrees below the
 * horizon (negative for above). Null when the sun never reaches that angle.
 */
export function hourAngle(depression: number, latitude: number, declination: number): number | null {
  const cosine =
    (-sin(depression) - sin(declination) * sin(latitude)) / (cos(declination) * cos(latitude));
  if (!(cosine >= -1 && cosine <= 1)) return null;
  return acos(cosine) / 15;
}

/** Sun altitude at which an object's shadow is `shadowFactor` times its height longer than at noon. */
export function asrAltitude(shadowFactor: number, latitude: number, declination: number): number {
  return atan(1 / (shadowFactor + tan(Math.abs(latitude - declination))));
}
