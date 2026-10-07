import { type Instant, roundHalfAway } from "./time";
import type { Prayer } from "./prayer";

/** The convention used to turn twilight into Fajr and Isha times. */
export type CalculationMethod =
  | "karachi"
  | "muslimWorldLeague"
  | "northAmerica"
  | "egyptian"
  | "ummAlQura"
  | "dubai"
  | "kuwait"
  | "qatar"
  | "singapore"
  | "tehran"
  | "jafari";

export type IshaRule =
  /** Sun this many degrees below the horizon. */
  | { kind: "angle"; degrees: number }
  /** A fixed interval after Maghrib, longer during Ramadan for some authorities. */
  | { kind: "minutesAfterMaghrib"; minutes: number; inRamadan: number };

export interface MethodParameters {
  fajrAngle: number;
  isha: IshaRule;
  /** Undefined means Maghrib is sunset. Shia methods wait for the sun to sink a few degrees further. */
  maghribAngle?: number;
}

const angle = (degrees: number): IshaRule => ({ kind: "angle", degrees });

export const METHODS: Record<CalculationMethod, MethodParameters & { name: string }> = {
  karachi: { name: "University of Islamic Sciences, Karachi", fajrAngle: 18, isha: angle(18) },
  muslimWorldLeague: { name: "Muslim World League", fajrAngle: 18, isha: angle(17) },
  northAmerica: { name: "Islamic Society of North America", fajrAngle: 15, isha: angle(15) },
  egyptian: { name: "Egyptian General Authority of Survey", fajrAngle: 19.5, isha: angle(17.5) },
  ummAlQura: {
    name: "Umm al-Qura University, Makkah",
    fajrAngle: 18.5,
    isha: { kind: "minutesAfterMaghrib", minutes: 90, inRamadan: 120 },
  },
  dubai: { name: "Dubai", fajrAngle: 18.2, isha: angle(18.2) },
  kuwait: { name: "Kuwait", fajrAngle: 18, isha: angle(17.5) },
  qatar: {
    name: "Qatar",
    fajrAngle: 18,
    isha: { kind: "minutesAfterMaghrib", minutes: 90, inRamadan: 90 },
  },
  singapore: { name: "Singapore, Malaysia, Indonesia", fajrAngle: 20, isha: angle(18) },
  tehran: {
    name: "Institute of Geophysics, Tehran",
    fajrAngle: 17.7,
    isha: angle(14),
    maghribAngle: 4.5,
  },
  jafari: {
    name: "Shia Ithna-Ashari (Jafari)",
    fajrAngle: 16,
    isha: angle(14),
    maghribAngle: 4,
  },
};

export const METHOD_IDS = Object.keys(METHODS) as CalculationMethod[];

function formatDegrees(degrees: number): string {
  return Number.isInteger(degrees) ? String(degrees) : String(degrees);
}

/** Short description of the twilight rule, for the settings screen. */
export function methodSummary(method: CalculationMethod): string {
  const p = METHODS[method];
  let isha: string;
  if (p.isha.kind === "angle") {
    isha = `Isha ${formatDegrees(p.isha.degrees)}°`;
  } else {
    const { minutes, inRamadan } = p.isha;
    isha =
      inRamadan === minutes
        ? `Isha ${minutes} min after Maghrib`
        : `Isha ${minutes} min after Maghrib (${inRamadan} in Ramadan)`;
  }
  return `Fajr ${formatDegrees(p.fajrAngle)}° · ${isha}`;
}

/** How long an object's shadow must be for Asr to begin. */
export type AsrMadhab = "standard" | "hanafi";

export const MADHABS: Record<AsrMadhab, string> = {
  standard: "Standard (Shafi'i, Maliki, Hanbali)",
  hanafi: "Hanafi",
};

export function shadowFactor(madhab: AsrMadhab): number {
  return madhab === "hanafi" ? 2 : 1;
}

/**
 * What to do at high latitudes when twilight never ends, or ends unreasonably late.
 * Fajr and Isha are capped at a portion of the night measured from sunrise and sunset.
 */
export type HighLatitudeRule = "twilightAngle" | "middleOfNight" | "seventhOfNight";

export const HIGH_LATITUDE_RULES: Record<HighLatitudeRule, string> = {
  twilightAngle: "Twilight angle",
  middleOfNight: "Middle of the night",
  seventhOfNight: "One seventh of the night",
};

export function nightPortion(rule: HighLatitudeRule, forAngle: number): number {
  switch (rule) {
    case "twilightAngle":
      return forAngle / 60;
    case "middleOfNight":
      return 1 / 2;
    case "seventhOfNight":
      return 1 / 7;
  }
}

/** Minutes added to each computed time, for matching a local mosque's timetable. */
export type PrayerAdjustments = Partial<Record<Prayer, number>>;

export function adjustmentFor(adjustments: PrayerAdjustments, prayer: Prayer): number {
  return adjustments[prayer] ?? 0;
}

/**
 * The adjustment that moves a prayer from its calculated time to the clock time of `chosen`,
 * going whichever way round the clock is shorter (so never more than 12 hours).
 */
export function minutesFromCalculatedToClockTimeOf(calculated: Instant, chosen: Instant): number {
  const difference = roundHalfAway((chosen - calculated) / 60);
  return ((((difference + 720) % 1440) + 1440) % 1440) - 720;
}

export interface PrayerConfiguration {
  method: CalculationMethod;
  madhab: AsrMadhab;
  highLatitudeRule: HighLatitudeRule;
  adjustments: PrayerAdjustments;
}

export function makeConfiguration(
  method: CalculationMethod,
  madhab: AsrMadhab,
  highLatitudeRule: HighLatitudeRule = "twilightAngle",
  adjustments: PrayerAdjustments = {},
): PrayerConfiguration {
  return { method, madhab, highLatitudeRule, adjustments };
}
