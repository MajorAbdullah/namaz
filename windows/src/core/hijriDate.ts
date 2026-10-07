import { type CalendarDay, dayContaining, type Instant, noon } from "./time";

const SECONDS_PER_DAY = 86_400;

function umalqura(timeZone: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-u-ca-islamic-umalqura-nu-latn", { timeZone, ...options });
}

/** Whether `day` falls in Ramadan by the Umm al-Qura calendar. */
export function isRamadan(day: CalendarDay, timeZone: string): boolean {
  const parts = umalqura(timeZone, { month: "numeric" }).formatToParts(new Date(noon(day, timeZone) * 1000));
  return parts.find((part) => part.type === "month")?.value === "9";
}

/**
 * The Islamic date at `date`, e.g. "23 Rabiʻ II 1448".
 *
 * The Islamic day begins at sunset, so pass `afterMaghrib: true` once Maghrib has passed to get the
 * date that has just begun. `dayOffset` shifts the result for regions whose moon sighting runs a
 * day or two off the Umm al-Qura calendar.
 */
export function hijriDateString(
  date: Instant,
  timeZone: string,
  afterMaghrib = false,
  dayOffset = 0,
): string {
  // Work from local noon so that adding whole days can never slip across a date boundary.
  const today: CalendarDay = dayContaining(date, timeZone);
  const shifted = noon(today, timeZone) + (dayOffset + (afterMaghrib ? 1 : 0)) * SECONDS_PER_DAY;
  const parts = umalqura(timeZone, { day: "numeric", month: "long", year: "numeric" }).formatToParts(
    new Date(shifted * 1000),
  );
  const read = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${read("day")} ${read("month")} ${read("year")}`;
}
