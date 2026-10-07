import { describe, expect, it } from "vitest";
import {
  eventTitle,
  hijriDateString,
  noon,
  type Prayer,
  prayerTimes,
  regionalDefaultsForTimeZone,
} from "../core";
import { CONFIGURATION, KARACHI, OCT_4, PAKISTAN, scheduleAt } from "./helpers";

describe("prayer schedule", () => {
  it("is in Dhuhr with Asr next in the afternoon", () => {
    const { schedule, now } = scheduleAt("14:00");
    expect(schedule.current(now)?.prayer).toBe("dhuhr");
    expect(schedule.next(now)?.prayer).toBe("asr");
    expect(schedule.next(now)?.time).toBe(schedule.today.asr);
    expect(schedule.displayDay(now)).toBe(schedule.today);
  });

  it("has sunrise next after Fajr", () => {
    const { schedule, now } = scheduleAt("05:30");
    expect(schedule.current(now)?.prayer).toBe("fajr");
    expect(schedule.next(now)?.prayer).toBe("sunrise");
  });

  it("is still in yesterday's Isha before Fajr", () => {
    const { schedule, now } = scheduleAt("02:00");
    expect(schedule.current(now)?.time).toBe(schedule.yesterday.isha);
    expect(schedule.next(now)?.time).toBe(schedule.today.fajr);
    expect(schedule.displayDay(now)).toBe(schedule.today);
  });

  it("has tomorrow's Fajr next after Isha", () => {
    const { schedule, now } = scheduleAt("22:00");
    expect(schedule.current(now)?.time).toBe(schedule.today.isha);
    expect(schedule.next(now)?.time).toBe(schedule.tomorrow.fajr);
    expect(schedule.displayDay(now)).toBe(schedule.tomorrow);
  });

  it("makes a prayer current at its exact time", () => {
    const { schedule } = scheduleAt("12:00");
    const asr = schedule.today.asr;
    expect(schedule.current(asr)?.prayer).toBe("asr");
    expect(schedule.next(asr)?.prayer).toBe("maghrib");
    expect(schedule.next(asr - 1)?.prayer).toBe("asr");
  });

  it("runs progress from zero to one between events", () => {
    const { schedule } = scheduleAt("12:00");
    const { dhuhr, asr } = schedule.today;
    expect(schedule.progress(dhuhr)).toBe(0);
    expect(Math.abs(schedule.progress(dhuhr + (asr - dhuhr) / 2) - 0.5)).toBeLessThan(0.001);
    expect(schedule.progress(asr - 1)).toBeGreaterThan(0.99);
  });

  it("calls Friday's Dhuhr Jumu'ah", () => {
    // 2 October 2026 is a Friday.
    const friday = prayerTimes({ year: 2026, month: 10, day: 2 }, KARACHI, PAKISTAN, CONFIGURATION)!;
    const { schedule } = scheduleAt("12:00"); // a Sunday
    expect(eventTitle({ prayer: "dhuhr", time: friday.dhuhr }, PAKISTAN)).toBe("Jumu'ah");
    expect(eventTitle({ prayer: "asr", time: friday.asr }, PAKISTAN)).toBe("Asr");
    expect(eventTitle({ prayer: "dhuhr", time: schedule.today.dhuhr }, PAKISTAN)).toBe("Dhuhr");
  });

  it("covers only enabled prayers, in firing order", () => {
    const { schedule, now } = scheduleAt("12:00");
    const enabled = new Set<Prayer>(["asr", "maghrib"]);
    const alarms = schedule.alarms(enabled, 600);

    expect(alarms.every((alarm) => enabled.has(alarm.event.prayer))).toBe(true);
    expect(alarms.map((alarm) => alarm.fireDate)).toEqual(alarms.map((alarm) => alarm.fireDate).sort((a, b) => a - b));

    const upcoming = alarms.filter((alarm) => alarm.fireDate > now).slice(0, 4);
    expect(upcoming.map((alarm) => alarm.kind)).toEqual(["reminder", "prayerTime", "reminder", "prayerTime"]);
    expect(upcoming.map((alarm) => alarm.event.prayer)).toEqual(["asr", "asr", "maghrib", "maghrib"]);
    expect(upcoming[0].fireDate).toBe(schedule.today.asr - 600);
  });

  it("has no reminders without a reminder lead", () => {
    const { schedule } = scheduleAt("12:00");
    const all = new Set<Prayer>(["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"]);
    expect(schedule.alarms(all, null).every((alarm) => alarm.kind === "prayerTime")).toBe(true);
    expect(schedule.alarms(new Set(), 600)).toEqual([]);
  });

  it("rings due alarms once and never late", () => {
    const { schedule } = scheduleAt("12:00");
    const asr = schedule.today.asr;
    const due = (after: number, upTo: number) =>
      schedule.dueAlarms(after, upTo, new Set<Prayer>(["asr"]), null, 120).map((alarm) => alarm.event.prayer);

    expect(due(asr - 30, asr + 0.1), "rings when the time arrives").toEqual(["asr"]);
    expect(due(asr - 30, asr), "rings at the exact instant").toEqual(["asr"]);
    expect(due(asr - 30, asr - 1), "not before its time").toEqual([]);
    expect(due(asr + 0.1, asr + 5), "not a second time").toEqual([]);
    expect(due(asr - 30, asr + 3600), "not an hour late after sleep").toEqual([]);
  });

  it("changes at the sooner of an alarm and a period boundary", () => {
    const { schedule, now } = scheduleAt("14:00");
    const asr = schedule.today.asr;
    expect(schedule.nextChange(now, new Set(), null)).toBe(asr);
    expect(schedule.nextChange(now, new Set<Prayer>(["asr"]), 900)).toBe(asr - 900);
    // Maghrib's reminder is further away than Asr itself.
    expect(schedule.nextChange(now, new Set<Prayer>(["maghrib"]), 900)).toBe(asr);
  });

  it("moves the Hijri date on at Maghrib", () => {
    // Aladhan gives 4 October 2026 as 23 Rabi' al-Thani 1448.
    const middayOn4th = noon(OCT_4, PAKISTAN);
    const day = hijriDateString(middayOn4th, PAKISTAN);
    const evening = hijriDateString(middayOn4th, PAKISTAN, true);
    const sightedLate = hijriDateString(middayOn4th, PAKISTAN, false, -1);
    expect(day.startsWith("23 ") && day.endsWith(" 1448")).toBe(true);
    expect(evening.startsWith("24 ")).toBe(true);
    expect(sightedLate.startsWith("22 ")).toBe(true);
  });

  it("starts from regional defaults that follow the time zone", () => {
    const pakistan = regionalDefaultsForTimeZone(PAKISTAN);
    expect([pakistan.city.name, pakistan.method, pakistan.madhab]).toEqual(["Karachi", "karachi", "hanafi"]);
    const newYork = regionalDefaultsForTimeZone("America/New_York");
    expect([newYork.method, newYork.madhab]).toEqual(["northAmerica", "standard"]);
    expect(regionalDefaultsForTimeZone("Pacific/Tahiti").city.name).toBe("Makkah");
  });
});
