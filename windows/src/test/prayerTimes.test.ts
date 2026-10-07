import { describe, expect, it } from "vitest";
import {
  type AsrMadhab,
  type CalculationMethod,
  type CalendarDay,
  addDays,
  dayContaining,
  makeConfiguration,
  minutesFromCalculatedToClockTimeOf,
  PRAYERS,
  prayerName,
  prayerTimes,
  qiblaBearing,
  sameDay,
} from "../core";
import { clockOn, formatClock } from "./helpers";

/**
 * Published times for one place and date, from the Aladhan API (api.aladhan.com, fetched
 * 2026-10-04). An independent implementation, so agreement here is evidence the maths is right.
 */
interface Reference {
  label: string;
  day: CalendarDay;
  coordinates: { latitude: number; longitude: number };
  zone: string;
  method: CalculationMethod;
  madhab?: AsrMadhab;
  /** Fajr, sunrise, Dhuhr, Asr, Maghrib, Isha as local HH:mm. */
  expected: string[];
}

const d = (year: number, month: number, day: number): CalendarDay => ({ year, month, day });

const REFERENCES: Reference[] = [
  { label: "Karachi, October, Karachi method, Hanafi", day: d(2026, 10, 4), coordinates: { latitude: 24.8607, longitude: 67.0011 }, zone: "Asia/Karachi", method: "karachi", madhab: "hanafi", expected: ["05:09", "06:25", "12:21", "16:37", "18:16", "19:32"] },
  { label: "Lahore, June solstice, Karachi method, Hanafi", day: d(2026, 6, 21), coordinates: { latitude: 31.5204, longitude: 74.3587 }, zone: "Asia/Karachi", method: "karachi", madhab: "hanafi", expected: ["03:19", "04:58", "12:04", "17:01", "19:11", "20:50"] },
  { label: "Islamabad, December solstice, Karachi method", day: d(2026, 12, 21), coordinates: { latitude: 33.6844, longitude: 73.0479 }, zone: "Asia/Karachi", method: "karachi", expected: ["05:39", "07:08", "12:06", "14:45", "17:03", "18:33"] },
  { label: "Makkah in Ramadan, Umm al-Qura (Isha 120 min after Maghrib)", day: d(2026, 3, 1), coordinates: { latitude: 21.4225, longitude: 39.8262 }, zone: "Asia/Riyadh", method: "ummAlQura", expected: ["05:25", "06:41", "12:33", "15:53", "18:25", "20:25"] },
  { label: "Makkah outside Ramadan, Umm al-Qura (Isha 90 min after Maghrib)", day: d(2026, 10, 4), coordinates: { latitude: 21.4225, longitude: 39.8262 }, zone: "Asia/Riyadh", method: "ummAlQura", expected: ["04:57", "06:13", "12:09", "15:34", "18:06", "19:36"] },
  { label: "New York in daylight saving time, ISNA", day: d(2026, 7, 15), coordinates: { latitude: 40.7128, longitude: -74.006 }, zone: "America/New_York", method: "northAmerica", expected: ["04:03", "05:38", "13:02", "17:01", "20:26", "22:01"] },
  { label: "Jakarta, southern hemisphere, Singapore method", day: d(2026, 1, 10), coordinates: { latitude: -6.2088, longitude: 106.8456 }, zone: "Asia/Jakarta", method: "singapore", expected: ["04:22", "05:46", "12:00", "15:25", "18:14", "19:29"] },
  { label: "London in winter, Muslim World League", day: d(2026, 12, 15), coordinates: { latitude: 51.5074, longitude: -0.1278 }, zone: "Europe/London", method: "muslimWorldLeague", expected: ["05:56", "08:00", "11:56", "13:36", "15:52", "17:49"] },
  { label: "Cairo, Egyptian method", day: d(2026, 4, 10), coordinates: { latitude: 30.0444, longitude: 31.2357 }, zone: "Africa/Cairo", method: "egyptian", expected: ["04:04", "05:34", "11:56", "15:29", "18:19", "19:39"] },
  { label: "Sydney in daylight saving time, Muslim World League", day: d(2026, 11, 20), coordinates: { latitude: -33.8688, longitude: 151.2093 }, zone: "Australia/Sydney", method: "muslimWorldLeague", expected: ["04:03", "05:41", "12:41", "16:24", "19:41", "21:12"] },
  { label: "Tehran, Tehran method (Maghrib by angle)", day: d(2026, 5, 5), coordinates: { latitude: 35.6892, longitude: 51.389 }, zone: "Asia/Tehran", method: "tehran", expected: ["03:34", "05:09", "12:01", "15:46", "19:14", "20:07"] },
  { label: "London at the June solstice, twilight never ends (angle-based cap)", day: d(2026, 6, 21), coordinates: { latitude: 51.5074, longitude: -0.1278 }, zone: "Europe/London", method: "muslimWorldLeague", expected: ["02:31", "04:43", "13:02", "17:25", "21:22", "23:27"] },
];

const PAKISTAN = "Asia/Karachi";
const KARACHI = { latitude: 24.8607, longitude: 67.0011 };

function karachi(day: CalendarDay, madhab: AsrMadhab = "hanafi") {
  return prayerTimes(day, KARACHI, PAKISTAN, makeConfiguration("karachi", madhab));
}

describe("prayer times", () => {
  it.each(REFERENCES)("matches independently published times to the minute: $label", (reference) => {
    const times = prayerTimes(
      reference.day,
      reference.coordinates,
      reference.zone,
      makeConfiguration(reference.method, reference.madhab ?? "standard"),
    );
    expect(times).not.toBeNull();
    PRAYERS.forEach((prayer, i) => {
      const expected = clockOn(reference.expected[i], reference.day, reference.zone);
      const differenceInMinutes = (times!.at(prayer) - expected) / 60;
      // Sources round differently (nearest minute, or always up), so allow one minute. Aladhan's
      // Asr additionally runs up to a minute and a half off the true shadow length around the
      // equinoxes (the sun-position test checks ours against the sun itself).
      const tolerance = prayer === "asr" ? 2 : 1;
      expect(
        Math.abs(differenceInMinutes),
        `${prayerName(prayer)}: got ${formatClock(times!.at(prayer), reference.zone)}, published ${reference.expected[i]}`,
      ).toBeLessThanOrEqual(tolerance);
    });
  });

  it("rounds to whole minutes and keeps the day's order", () => {
    const times = karachi(d(2026, 10, 4))!;
    const instants = PRAYERS.map((prayer) => times.at(prayer));
    for (const instant of instants) expect(instant % 60).toBe(0);
    expect(instants).toEqual([...instants].sort((a, b) => a - b));
  });

  it("puts Hanafi Asr later than Standard and leaves Dhuhr alone", () => {
    const day = d(2026, 10, 4);
    const hanafi = karachi(day, "hanafi")!;
    const standard = karachi(day, "standard")!;
    expect(hanafi.asr).toBeGreaterThan(standard.asr);
    expect(hanafi.dhuhr).toBe(standard.dhuhr);
  });

  it("shifts only the adjusted prayers", () => {
    const day = d(2026, 10, 4);
    const base = karachi(day)!;
    const adjusted = prayerTimes(
      day,
      KARACHI,
      PAKISTAN,
      makeConfiguration("karachi", "hanafi", "twilightAngle", { fajr: 3, isha: -2 }),
    )!;
    expect(adjusted.fajr).toBe(base.fajr + 180);
    expect(adjusted.isha).toBe(base.isha - 120);
    expect(adjusted.dhuhr).toBe(base.dhuhr);
  });

  it("gives the shortest adjustment for a chosen clock time", () => {
    const dhuhr = karachi(d(2026, 10, 4))!.dhuhr; // 12:21
    const minutes = (clock: string, dayOffset = 0) =>
      minutesFromCalculatedToClockTimeOf(
        dhuhr,
        clockOn(clock, addDays(d(2026, 10, 4), dayOffset), PAKISTAN),
      );
    expect(minutes("13:30")).toBe(69);
    expect(minutes("12:00")).toBe(-21);
    expect(minutes("12:21")).toBe(0);
    // Only the clock time matters, not which day the picker's date happens to be on.
    expect(minutes("13:30", 1)).toBe(69);
    expect(minutes("13:30", -3)).toBe(69);
  });

  it("puts every time on the requested local date, even near the date line", () => {
    // Apia is UTC+13 but sits at 172°W, so its solar day belongs to the previous UTC date.
    const day = d(2026, 10, 4);
    const times = prayerTimes(
      day,
      { latitude: -13.8333, longitude: -171.7667 },
      "Pacific/Apia",
      makeConfiguration("muslimWorldLeague", "standard"),
    )!;
    for (const prayer of PRAYERS) {
      expect(sameDay(dayContaining(times.at(prayer), "Pacific/Apia"), day), prayerName(prayer)).toBe(true);
    }
  });

  it("drifts by at most a few minutes from one day to the next", () => {
    // Catches a calendar-date mix-up, which would show up as a jump between days.
    let previous = karachi(d(2026, 1, 1))!;
    for (let offset = 1; offset < 366; offset++) {
      const day = addDays(d(2026, 1, 1), offset);
      const times = karachi(day)!;
      for (const prayer of PRAYERS) {
        const drift = times.at(prayer) - previous.at(prayer) - 86_400;
        expect(Math.abs(drift), `${prayerName(prayer)} on ${JSON.stringify(day)}`).toBeLessThanOrEqual(180);
      }
      previous = times;
    }
  });

  it("has no times in the polar night", () => {
    const times = prayerTimes(
      d(2026, 12, 21),
      { latitude: 69.6492, longitude: 18.9553 },
      "Europe/Oslo",
      makeConfiguration("muslimWorldLeague", "standard"),
    );
    expect(times).toBeNull();
  });

  it("rejects coordinates that do not exist", () => {
    expect(
      prayerTimes(d(2026, 10, 4), { latitude: 91, longitude: 0 }, "UTC", makeConfiguration("karachi", "hanafi")),
    ).toBeNull();
  });

  it("points the Qibla the right way", () => {
    expect(Math.abs(qiblaBearing(KARACHI) - 267.7)).toBeLessThan(0.5);
    expect(Math.abs(qiblaBearing({ latitude: 40.7128, longitude: -74.006 }) - 58.5)).toBeLessThan(0.5);
    expect(Math.abs(qiblaBearing({ latitude: 51.5074, longitude: -0.1278 }) - 119.0)).toBeLessThan(0.5);
  });
});
