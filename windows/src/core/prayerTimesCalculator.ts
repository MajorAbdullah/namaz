import {
  adjustmentFor,
  METHODS,
  type PrayerConfiguration,
  nightPortion,
  shadowFactor,
} from "./calculationMethod";
import { isRamadan } from "./hijriDate";
import { type Coordinates, coordinatesAreValid } from "./place";
import { PRAYERS, type Prayer, type PrayerEvent } from "./prayer";
import * as Solar from "./solarMath";
import {
  addDays,
  type CalendarDay,
  dayContaining,
  type Instant,
  roundHalfAway,
  sameDay,
  utcMidnight,
} from "./time";

/** The six event times for one calendar day at one location, rounded to the minute. */
export class DailyPrayerTimes {
  constructor(
    readonly day: CalendarDay,
    readonly fajr: Instant,
    readonly sunrise: Instant,
    readonly dhuhr: Instant,
    readonly asr: Instant,
    readonly maghrib: Instant,
    readonly isha: Instant,
  ) {}

  at(prayer: Prayer): Instant {
    return this[prayer];
  }

  events(): PrayerEvent[] {
    return PRAYERS.map((prayer) => ({ prayer, time: this.at(prayer) }));
  }
}

/**
 * Sun's centre this far below the horizon at sunrise and sunset: atmospheric refraction plus the
 * sun's radius.
 */
const HORIZON_DEPRESSION = 0.833;

/**
 * Prayer times for `day` as that date is reckoned in `timeZone`. Returns null where the sun does
 * not rise or set that day (polar regions). `roundToMinute: false` exposes the exact computed
 * instants, so tests can check them against the sun's actual position.
 */
export function prayerTimes(
  day: CalendarDay,
  coordinates: Coordinates,
  timeZone: string,
  configuration: PrayerConfiguration,
  roundToMinute = true,
): DailyPrayerTimes | null {
  if (!coordinatesAreValid(coordinates)) return null;
  const inRamadanNight = isRamadan(addDays(day, 1), timeZone);
  const utcJulianDay = Solar.julianDay(day.year, day.month, day.day);

  // Times come out as hours of local mean solar time, which runs longitude/15 hours ahead of UTC.
  // The solar day belonging to a calendar date is the one whose noon lands on that date locally:
  // the same UTC date nearly everywhere, a day either side near the date line.
  for (const shift of [0, -1, 1]) {
    const julian = utcJulianDay + shift - coordinates.longitude / 360;
    const hours = solarHours(julian, coordinates.latitude, configuration, inRamadanNight);
    if (!hours) continue;

    const solarMidnight = utcMidnight(day) + (shift * 24 - coordinates.longitude / 15) * 3600;
    if (!sameDay(dayContaining(solarMidnight + hours.dhuhr * 3600, timeZone), day)) continue;

    const date = (prayer: Prayer, hour: number): Instant => {
      let seconds = solarMidnight + hour * 3600;
      if (roundToMinute) seconds = roundHalfAway(seconds / 60) * 60;
      return seconds + adjustmentFor(configuration.adjustments, prayer) * 60;
    };
    return new DailyPrayerTimes(
      day,
      date("fajr", hours.fajr),
      date("sunrise", hours.sunrise),
      date("dhuhr", hours.dhuhr),
      date("asr", hours.asr),
      date("maghrib", hours.maghrib),
      date("isha", hours.isha),
    );
  }
  return null;
}

interface SolarHours {
  fajr: number;
  sunrise: number;
  dhuhr: number;
  asr: number;
  maghrib: number;
  isha: number;
}

/** Event times in hours after local mean solar midnight, where `julian` is that midnight. */
function solarHours(
  julian: number,
  latitude: number,
  configuration: PrayerConfiguration,
  inRamadanNight: boolean,
): SolarHours | null {
  const parameters = METHODS[configuration.method];

  const sun = (hour: number) => Solar.sunPosition(julian + hour / 24);

  /** When the sun crosses `depression` degrees below the horizon, on the given side of noon. */
  const crossing = (depression: number, near: number, beforeNoon: boolean): number | null => {
    const position = sun(near);
    const angle = Solar.hourAngle(depression, latitude, position.declination);
    if (angle === null) return null;
    return 12 - position.equationOfTime + (beforeNoon ? -angle : angle);
  };

  // Rough starting points, refined by re-sampling the sun at each result.
  let dhuhr = 12;
  let sunrise = 6;
  let sunset = 18;
  let asr = 13;
  let fajrEstimate = 5;
  let ishaEstimate = 18;
  let maghribEstimate = 18;
  let fajr: number | null = null;
  let isha: number | null = null;
  let maghribByAngle: number | null = null;

  for (let pass = 0; pass < 3; pass++) {
    dhuhr = 12 - sun(dhuhr).equationOfTime;
    const rise = crossing(HORIZON_DEPRESSION, sunrise, true);
    const set = crossing(HORIZON_DEPRESSION, sunset, false);
    if (rise === null || set === null) return null;
    sunrise = rise;
    sunset = set;

    const altitude = Solar.asrAltitude(
      shadowFactor(configuration.madhab),
      latitude,
      sun(asr).declination,
    );
    const afternoon = crossing(-altitude, asr, false);
    if (afternoon === null) return null;
    asr = afternoon;

    fajr = crossing(parameters.fajrAngle, fajrEstimate, true);
    fajrEstimate = fajr ?? fajrEstimate;
    if (parameters.isha.kind === "angle") {
      isha = crossing(parameters.isha.degrees, ishaEstimate, false);
      ishaEstimate = isha ?? ishaEstimate;
    }
    if (parameters.maghribAngle !== undefined) {
      maghribByAngle = crossing(parameters.maghribAngle, maghribEstimate, false);
      maghribEstimate = maghribByAngle ?? maghribEstimate;
    }
  }

  // Twilight that never ends, or ends too deep into the night, is capped at a portion of the night
  // measured from sunrise or sunset.
  const night = 24 - (sunset - sunrise);
  const capped = (time: number | null, angle: number, base: number, direction: number): number => {
    const limit = nightPortion(configuration.highLatitudeRule, angle) * night;
    if (time !== null && Math.abs(time - base) <= limit) return time;
    return base + direction * limit;
  };

  const maghrib =
    parameters.maghribAngle !== undefined
      ? capped(maghribByAngle, parameters.maghribAngle, sunset, 1)
      : sunset;

  let finalIsha: number;
  if (parameters.isha.kind === "angle") {
    finalIsha = capped(isha, parameters.isha.degrees, sunset, 1);
  } else {
    const { minutes, inRamadan } = parameters.isha;
    finalIsha = maghrib + (inRamadanNight ? inRamadan : minutes) / 60;
  }

  return {
    fajr: capped(fajr, parameters.fajrAngle, sunrise, -1),
    sunrise,
    dhuhr,
    asr,
    maghrib,
    isha: finalIsha,
  };
}
