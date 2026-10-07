import {
  type CalendarDay,
  type Instant,
  instantFromLocal,
  localParts,
  makeConfiguration,
  PrayerSchedule,
} from "../core";

/** The instant at which `timeZone`'s clocks read `clock` ("HH:mm") on `day`. */
export function clockOn(clock: string, day: CalendarDay, timeZone: string): Instant {
  const [hour, minute] = clock.split(":").map(Number);
  return instantFromLocal(day, hour, minute, timeZone);
}

/** "HH:mm" in `timeZone`. */
export function formatClock(instant: Instant, timeZone: string): string {
  const { hour, minute } = localParts(instant, timeZone);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export const PAKISTAN = "Asia/Karachi";
export const KARACHI = { latitude: 24.8607, longitude: 67.0011 };
export const CONFIGURATION = makeConfiguration("karachi", "hanafi");
export const OCT_4: CalendarDay = { year: 2026, month: 10, day: 4 };

/**
 * 4 October 2026 in Karachi: Fajr 05:09, sunrise 06:25, Dhuhr 12:21, Asr 16:37, Maghrib 18:16,
 * Isha 19:32 (give or take a minute).
 */
export function scheduleAt(clock: string): { schedule: PrayerSchedule; now: number } {
  const now = clockOn(clock, OCT_4, PAKISTAN);
  const schedule = PrayerSchedule.make(now, KARACHI, PAKISTAN, CONFIGURATION);
  if (!schedule) throw new Error("no schedule");
  return { schedule, now };
}

