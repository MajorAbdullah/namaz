/** A moment in time, as seconds since 1970. Whole minutes stay exact; fractions keep sub-second detail. */
export type Instant = number;

/** A Gregorian calendar date with no time or time zone attached. */
export interface CalendarDay {
  year: number;
  month: number;
  day: number;
}

export const SECONDS_PER_DAY = 86_400;

/** Swift's `rounded()`: halves go away from zero. */
export function roundHalfAway(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

interface Parts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let found = formatters.get(timeZone);
  if (!found) {
    found = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    });
    formatters.set(timeZone, found);
  }
  return found;
}

/** The wall-clock reading of `instant` in `timeZone` (an IANA name such as "Asia/Karachi"). */
export function localParts(instant: Instant, timeZone: string): Parts {
  const parts = formatter(timeZone).formatToParts(new Date(Math.floor(instant) * 1000));
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour"),
    minute: read("minute"),
    second: read("second"),
  };
}

/** Seconds that `timeZone` is ahead of UTC at `instant`. */
export function zoneOffset(instant: Instant, timeZone: string): number {
  const p = localParts(instant, timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) / 1000 - Math.floor(instant);
}

/** The instant at which `timeZone`'s clocks read the given date and time. */
export function instantFromLocal(
  day: CalendarDay,
  hour: number,
  minute: number,
  timeZone: string,
): Instant {
  const guess = Date.UTC(day.year, day.month - 1, day.day, hour, minute) / 1000;
  const first = guess - zoneOffset(guess, timeZone);
  return guess - zoneOffset(first, timeZone);
}

export function dayContaining(instant: Instant, timeZone: string): CalendarDay {
  const { year, month, day } = localParts(instant, timeZone);
  return { year, month, day };
}

export function sameDay(a: CalendarDay, b: CalendarDay): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

export function compareDays(a: CalendarDay, b: CalendarDay): number {
  return a.year - b.year || a.month - b.month || a.day - b.day;
}

export function addDays(day: CalendarDay, days: number): CalendarDay {
  const moved = new Date(Date.UTC(day.year, day.month - 1, day.day + days));
  return { year: moved.getUTCFullYear(), month: moved.getUTCMonth() + 1, day: moved.getUTCDate() };
}

/** Midnight UTC on this date: a time-zone-independent anchor for arithmetic. */
export function utcMidnight(day: CalendarDay): Instant {
  return Date.UTC(day.year, day.month - 1, day.day) / 1000;
}

/** Local noon on this date, a safe instant for formatting the date itself. */
export function noon(day: CalendarDay, timeZone: string): Instant {
  return instantFromLocal(day, 12, 0, timeZone);
}

/** 0 for Sunday through 6 for Saturday, for the date `instant` falls on in `timeZone`. */
export function weekday(instant: Instant, timeZone: string): number {
  const day = dayContaining(instant, timeZone);
  return new Date(Date.UTC(day.year, day.month - 1, day.day)).getUTCDay();
}

export function dayKey(day: CalendarDay): string {
  const pad = (value: number, width: number) => String(value).padStart(width, "0");
  return `${pad(day.year, 4)}-${pad(day.month, 2)}-${pad(day.day, 2)}`;
}

/** The time zone this computer is set to. */
export function systemTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}
