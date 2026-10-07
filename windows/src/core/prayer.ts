import { type Instant, weekday } from "./time";

/** The six daily events the app tracks: the five prayers, plus sunrise, which closes the Fajr window. */
export type Prayer = "fajr" | "sunrise" | "dhuhr" | "asr" | "maghrib" | "isha";

export const PRAYERS: readonly Prayer[] = ["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"];

const NAMES: Record<Prayer, string> = {
  fajr: "Fajr",
  sunrise: "Sunrise",
  dhuhr: "Dhuhr",
  asr: "Asr",
  maghrib: "Maghrib",
  isha: "Isha",
};

export function prayerName(prayer: Prayer): string {
  return NAMES[prayer];
}

/** False for sunrise, which is shown and can be alarmed but is not a prayer. */
export function isPrayer(prayer: Prayer): boolean {
  return prayer !== "sunrise";
}

/** One occurrence of a prayer at a concrete instant. */
export interface PrayerEvent {
  readonly prayer: Prayer;
  readonly time: Instant;
}

export function eventEquals(a: PrayerEvent | null | undefined, b: PrayerEvent | null | undefined): boolean {
  if (!a || !b) return a === b;
  return a.prayer === b.prayer && a.time === b.time;
}

/** Display name, with Friday's Dhuhr shown as Jumu'ah. */
export function eventTitle(event: PrayerEvent, timeZone: string): string {
  if (event.prayer !== "dhuhr") return prayerName(event.prayer);
  return weekday(event.time, timeZone) === 5 ? "Jumu'ah" : prayerName(event.prayer);
}
