import { describe, expect, it } from "vitest";
import {
  type AsrMadhab,
  type CalculationMethod,
  type CalendarDay,
  type HighLatitudeRule,
  hijriDateString,
  makeConfiguration,
  PRAYERS,
  type Prayer,
  prayerTimes,
  qiblaBearing,
  regionalDefaultsForTimeZone,
  noon,
} from "../core";
import vectors from "./vectors.json";

/**
 * The Swift core's own output, written by Tests/NamazCoreTests/GoldenVectors.swift. The port has to
 * reproduce it: rounded times to the second, exact ones to the millisecond.
 */
interface TimeCase {
  place: string;
  latitude: number;
  longitude: number;
  zone: string;
  day: [number, number, number];
  method: CalculationMethod;
  madhab: AsrMadhab;
  rule: HighLatitudeRule;
  adjustments: number[];
  rounded: number[] | null;
  exact: number[] | null;
  qibla: number;
}

const day = ([year, month, date]: number[]): CalendarDay => ({ year, month, day: date });

describe("golden vectors from the Swift core", () => {
  const cases = vectors.times as unknown as TimeCase[];

  it("has a useful spread of cases", () => {
    expect(cases.length).toBeGreaterThan(3000);
    expect(cases.some((c) => c.rounded === null)).toBe(true);
  });

  it("reproduces every rounded and exact time", () => {
    const failures: string[] = [];
    for (const c of cases) {
      const adjustments: Partial<Record<Prayer, number>> = {};
      PRAYERS.forEach((prayer, i) => {
        if (c.adjustments[i]) adjustments[prayer] = c.adjustments[i];
      });
      const configuration = makeConfiguration(c.method, c.madhab, c.rule, adjustments);
      const coordinates = { latitude: c.latitude, longitude: c.longitude };
      const label = `${c.place} ${c.day.join("-")} ${c.method}/${c.madhab}/${c.rule}`;

      for (const [mode, expected] of [["rounded", c.rounded], ["exact", c.exact]] as const) {
        const got = prayerTimes(day(c.day), coordinates, c.zone, configuration, mode === "rounded");
        if (expected === null) {
          if (got !== null) failures.push(`${label} ${mode}: expected no times`);
          continue;
        }
        if (got === null) {
          failures.push(`${label} ${mode}: got no times`);
          continue;
        }
        PRAYERS.forEach((prayer, i) => {
          const difference = Math.abs(got.at(prayer) - expected[i]);
          // Whole minutes must be identical; exact instants may differ by the last bit of a double.
          const allowed = mode === "rounded" ? 0 : 0.001;
          if (difference > allowed) failures.push(`${label} ${mode} ${prayer}: off by ${difference}s`);
        });
      }
      if (Math.abs(qiblaBearing(coordinates) - c.qibla) > 1e-9) failures.push(`${label}: qibla`);
    }
    expect(failures.slice(0, 20)).toEqual([]);
  });
});

describe("Hijri dates from the Swift core", () => {
  it("match to the character", () => {
    const failures: string[] = [];
    for (const h of vectors.hijri as {
      zone: string;
      day: number[];
      afterMaghrib: boolean;
      dayOffset: number;
      text: string;
    }[]) {
      const got = hijriDateString(noon(day(h.day), h.zone), h.zone, h.afterMaghrib, h.dayOffset);
      if (got !== h.text) failures.push(`${h.zone} ${h.day.join("-")}: got "${got}", Swift "${h.text}"`);
    }
    expect(failures.slice(0, 10)).toEqual([]);
  });
});

describe("regional defaults from the Swift core", () => {
  it("match for every city's time zone", () => {
    for (const d of vectors.regionalDefaults) {
      const got = regionalDefaultsForTimeZone(d.zone);
      expect([got.city.name, got.city.country, got.method, got.madhab]).toEqual([
        d.city,
        d.country,
        d.method,
        d.madhab,
      ]);
    }
  });
});
