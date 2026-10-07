import {
  type AsrMadhab,
  type CalculationMethod,
  type HighLatitudeRule,
  HIGH_LATITUDE_RULES,
  type Instant,
  MADHABS,
  METHODS,
  type Place,
  PRAYERS,
  type Prayer,
  type PrayerConfiguration,
  cityPlace,
  isPrayer,
  makeConfiguration,
  regionalDefaultsForTimeZone,
} from "../core";

export type AlarmSound =
  /** Show the alarm without playing anything. */
  | { kind: "silent" }
  /** The adhan recording that ships with the app. */
  | { kind: "adhan" }
  /** One of the short tones that ship with the app, by name. */
  | { kind: "tone"; name: string }
  /** An audio file the user picked, copied into the app's data folder. */
  | { kind: "custom"; fileName: string };

export type LocationMode = "automatic" | "manual";
export type WidgetLayout = "island" | "compact" | "list";
export type MenuBarStyle = "nextPrayer" | "countdown" | "iconOnly";
export type ClockStyle = "system" | "twelveHour" | "twentyFourHour";

/** Everything the user can change, persisted as one JSON value. */
export interface AppSettings {
  locationMode: LocationMode;
  /** The city chosen by hand. Also the fallback until the computer's location answers. */
  manualPlace: Place;
  /** The last position the computer reported. */
  detectedPlace: Place | null;
  calculation: PrayerConfiguration;
  /** Shifts the Hijri date for regions whose moon sighting differs from Umm al-Qura. */
  hijriDayOffset: number;

  alarmPrayers: Prayer[];
  alarmSound: AlarmSound;
  alarmVolume: number;
  /** Minutes of advance warning before each alarmed prayer. Zero turns reminders off. */
  reminderMinutes: number;

  /** Colour, chimes and the screen cover as an unprayed prayer's time runs out. */
  endOfTimeAlerts: boolean;
  /**
   * Covers every screen from ten minutes before a prayer's deadline until it is marked as prayed
   * or its time ends. For Asr that is from 30 minutes before Maghrib until Maghrib.
   */
  endOfTimeCover: boolean;
  /** End-of-time alerts keep quiet until this instant. Null, or in the past, means not paused. */
  alertsPausedUntil: Instant | null;

  showsWidget: boolean;
  widgetLayout: WidgetLayout;
  widgetFloatsOnTop: boolean;
  menuBarStyle: MenuBarStyle;
  clockStyle: ClockStyle;
}

/** Starting settings for a computer in the given time zone. */
export function defaultSettings(timeZone: string): AppSettings {
  const regional = regionalDefaultsForTimeZone(timeZone);
  return {
    locationMode: "automatic",
    manualPlace: cityPlace(regional.city),
    detectedPlace: null,
    calculation: makeConfiguration(regional.method, regional.madhab),
    hijriDayOffset: 0,
    alarmPrayers: PRAYERS.filter(isPrayer),
    alarmSound: { kind: "adhan" },
    alarmVolume: 1,
    reminderMinutes: 0,
    endOfTimeAlerts: true,
    endOfTimeCover: true,
    alertsPausedUntil: null,
    showsWidget: true,
    widgetLayout: "island",
    widgetFloatsOnTop: false,
    menuBarStyle: "nextPrayer",
    clockStyle: "system",
  };
}

/** The location prayer times are calculated for right now. */
export function currentPlace(settings: AppSettings): Place {
  return settings.locationMode === "automatic" ? (settings.detectedPlace ?? settings.manualPlace) : settings.manualPlace;
}

export function reminderLead(settings: AppSettings): number | null {
  return settings.reminderMinutes > 0 ? settings.reminderMinutes * 60 : null;
}

export function alertsArePaused(settings: AppSettings, at: Instant): boolean {
  return settings.alertsPausedUntil !== null && at < settings.alertsPausedUntil;
}

// MARK: - Reading what was saved

type Guard<T> = (value: unknown) => value is T;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isBoolean: Guard<boolean> = (value): value is boolean => typeof value === "boolean";
const isFiniteNumber: Guard<number> = (value): value is number => typeof value === "number" && Number.isFinite(value);
const isString: Guard<string> = (value): value is string => typeof value === "string";
const oneOf =
  <T extends string>(allowed: readonly T[]): Guard<T> =>
  (value): value is T =>
    typeof value === "string" && (allowed as readonly string[]).includes(value);

const isPlace: Guard<Place> = (value): value is Place =>
  isObject(value) &&
  isString(value.name) &&
  isObject(value.coordinates) &&
  isFiniteNumber(value.coordinates.latitude) &&
  isFiniteNumber(value.coordinates.longitude);

const isSound: Guard<AlarmSound> = (value): value is AlarmSound => {
  if (!isObject(value)) return false;
  switch (value.kind) {
    case "silent":
    case "adhan":
      return true;
    case "tone":
      return isString(value.name);
    case "custom":
      return isString(value.fileName);
    default:
      return false;
  }
};

function readConfiguration(value: unknown, fallback: PrayerConfiguration): PrayerConfiguration {
  if (!isObject(value)) return fallback;
  const method = oneOf(Object.keys(METHODS) as CalculationMethod[])(value.method) ? value.method : fallback.method;
  const madhab = oneOf(Object.keys(MADHABS) as AsrMadhab[])(value.madhab) ? value.madhab : fallback.madhab;
  const rule = oneOf(Object.keys(HIGH_LATITUDE_RULES) as HighLatitudeRule[])(value.highLatitudeRule)
    ? value.highLatitudeRule
    : fallback.highLatitudeRule;
  const adjustments: PrayerConfiguration["adjustments"] = {};
  if (isObject(value.adjustments)) {
    for (const prayer of PRAYERS) {
      const minutes = value.adjustments[prayer];
      if (isFiniteNumber(minutes) && Number.isInteger(minutes) && minutes !== 0) adjustments[prayer] = minutes;
    }
  }
  return { method, madhab, highLatitudeRule: rule, adjustments };
}

/**
 * Reads whatever keys are present and valid, taking defaults for the rest, so settings saved by an
 * older version survive new fields being added.
 */
export function readSettings(saved: unknown, timeZone: string): AppSettings {
  const settings = defaultSettings(timeZone);
  if (!isObject(saved)) return settings;
  const source: Record<string, unknown> = saved;

  function read<K extends keyof AppSettings>(key: K, valid: Guard<AppSettings[K]>) {
    const value = source[key as string];
    if (valid(value)) settings[key] = value;
  }
  read("locationMode", oneOf(["automatic", "manual"] as const));
  read("manualPlace", isPlace);
  if (source.detectedPlace === null || isPlace(source.detectedPlace)) settings.detectedPlace = source.detectedPlace;
  settings.calculation = readConfiguration(source.calculation, settings.calculation);
  read("hijriDayOffset", (value): value is number => isFiniteNumber(value) && Number.isInteger(value));
  if (Array.isArray(source.alarmPrayers)) {
    settings.alarmPrayers = source.alarmPrayers.filter((p): p is Prayer => oneOf(PRAYERS)(p));
  }
  read("alarmSound", isSound);
  read("alarmVolume", (value): value is number => isFiniteNumber(value) && value >= 0 && value <= 1);
  read("reminderMinutes", (value): value is number => isFiniteNumber(value) && Number.isInteger(value) && value >= 0);
  read("endOfTimeAlerts", isBoolean);
  read("endOfTimeCover", isBoolean);
  if (source.alertsPausedUntil === null || isFiniteNumber(source.alertsPausedUntil)) {
    settings.alertsPausedUntil = source.alertsPausedUntil;
  }
  read("showsWidget", isBoolean);
  read("widgetLayout", oneOf(["island", "compact", "list"] as const));
  read("widgetFloatsOnTop", isBoolean);
  read("menuBarStyle", oneOf(["nextPrayer", "countdown", "iconOnly"] as const));
  read("clockStyle", oneOf(["system", "twelveHour", "twentyFourHour"] as const));
  return settings;
}

