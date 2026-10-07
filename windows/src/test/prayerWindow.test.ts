import { describe, expect, it } from "vitest";
import {
  PauseLength,
  PrayedLog,
  type PrayerEvent,
  PrayerWindow,
  Urgency,
  pauseEnd,
  windowAt,
} from "../core";
import { PAKISTAN, scheduleAt } from "./helpers";

function windowAtClock(clock: string) {
  const { schedule, now } = scheduleAt(clock);
  const window = windowAt(schedule, now);
  if (!window) throw new Error("no window");
  return { window, schedule };
}

describe("which prayer is open", () => {
  it("ends a prayer's time when the next event starts", () => {
    const fajr = windowAtClock("05:30");
    expect(fajr.window.event.prayer).toBe("fajr");
    expect(fajr.window.closes).toBe(fajr.schedule.today.sunrise);

    const dhuhr = windowAtClock("14:00");
    expect(dhuhr.window.event.prayer).toBe("dhuhr");
    expect(dhuhr.window.closes).toBe(dhuhr.schedule.today.asr);

    const maghrib = windowAtClock("18:30");
    expect(maghrib.window.event.prayer).toBe("maghrib");
    expect(maghrib.window.closes).toBe(maghrib.schedule.today.isha);

    const isha = windowAtClock("22:00");
    expect(isha.window.event.prayer).toBe("isha");
    expect(isha.window.closes).toBe(isha.schedule.tomorrow.fajr);
  });

  it("keeps yesterday's Isha open before Fajr", () => {
    const { window, schedule } = windowAtClock("02:00");
    expect(window.event.time).toBe(schedule.yesterday.isha);
    expect(window.closes).toBe(schedule.today.fajr);
  });

  it("has no prayer open between sunrise and Dhuhr", () => {
    const { schedule, now } = scheduleAt("09:00");
    expect(windowAt(schedule, now)).toBeUndefined();
  });
});

describe("deadlines", () => {
  it("is the end of the time for every prayer but Asr", () => {
    for (const clock of ["05:30", "14:00", "18:30", "22:00"]) {
      const { window } = windowAtClock(clock);
      expect(window.deadline).toBe(window.closes);
    }
  });

  it("puts Asr's deadline twenty minutes before Maghrib", () => {
    const { window, schedule } = windowAtClock("17:00");
    expect(window.event.prayer).toBe("asr");
    expect(window.closes).toBe(schedule.today.maghrib);
    expect(window.deadline).toBe(schedule.today.maghrib - 20 * 60);
  });

  it("never lets a deadline fall before the prayer starts", () => {
    const start = 1_800_000_000;
    const asr = new PrayerWindow({ prayer: "asr", time: start }, start + 10 * 60);
    expect(asr.deadline).toBe(start);
  });
});

describe("urgency", () => {
  it("steps up at twenty, fifteen, ten and five minutes", () => {
    const { window } = windowAtClock("14:00");
    const deadline = window.deadline;
    expect(window.urgency(deadline - 20 * 60 - 1)).toBe(Urgency.calm);
    expect(window.urgency(deadline - 20 * 60)).toBe(Urgency.twenty);
    expect(window.urgency(deadline - 15 * 60 - 1)).toBe(Urgency.twenty);
    expect(window.urgency(deadline - 15 * 60)).toBe(Urgency.fifteen);
    expect(window.urgency(deadline - 10 * 60)).toBe(Urgency.ten);
    expect(window.urgency(deadline - 5 * 60)).toBe(Urgency.five);
    expect(window.urgency(deadline - 1)).toBe(Urgency.five);
  });

  it("keeps Asr most urgent from its deadline until Maghrib", () => {
    const { window: asr } = windowAtClock("17:00");
    expect(asr.isOverdue(asr.deadline - 1)).toBe(false);
    expect(asr.isOverdue(asr.deadline)).toBe(true);
    expect(asr.urgency(asr.deadline)).toBe(Urgency.five);
    expect(asr.isOverdue(asr.closes - 1)).toBe(true);
    expect(asr.urgency(asr.closes - 1)).toBe(Urgency.five);

    const { window: dhuhr } = windowAtClock("14:00");
    expect(dhuhr.isOverdue(dhuhr.closes - 1)).toBe(false);
  });

  it("escalates at the start of each stage, then the deadline", () => {
    const { window: dhuhr } = windowAtClock("14:00");
    const deadline = dhuhr.deadline;
    expect(dhuhr.nextEscalation(deadline - 25 * 60)).toBe(deadline - 20 * 60);
    expect(dhuhr.nextEscalation(deadline - 20 * 60)).toBe(deadline - 15 * 60);
    expect(dhuhr.nextEscalation(deadline - 12 * 60)).toBe(deadline - 10 * 60);
    expect(dhuhr.nextEscalation(deadline - 7 * 60)).toBe(deadline - 5 * 60);
    // Nothing more for the timer to do: the end of the time is already a change it wakes for.
    expect(dhuhr.nextEscalation(deadline - 5 * 60)).toBeUndefined();

    const { window: asr } = windowAtClock("17:00");
    expect(asr.nextEscalation(asr.deadline - 5 * 60)).toBe(asr.deadline);
    expect(asr.nextEscalation(asr.deadline)).toBeUndefined();
  });
});

describe("prayed log", () => {
  const event = (schedule: ReturnType<typeof scheduleAt>["schedule"], prayer: "asr" | "dhuhr" | "fajr" | "isha", day: "yesterday" | "today" | "tomorrow" = "today"): PrayerEvent => ({
    prayer,
    time: schedule[day].at(prayer),
  });

  it("covers one prayer on one day", () => {
    const { schedule } = scheduleAt("17:00");
    const asr = event(schedule, "asr");
    let log = new PrayedLog();
    expect(log.contains(asr, PAKISTAN)).toBe(false);

    log = log.setting(true, asr, PAKISTAN);
    expect(log.contains(asr, PAKISTAN)).toBe(true);
    expect(log.contains(event(schedule, "dhuhr"), PAKISTAN)).toBe(false);
    expect(log.contains(event(schedule, "asr", "tomorrow"), PAKISTAN)).toBe(false);

    log = log.setting(false, asr, PAKISTAN);
    expect(log.contains(asr, PAKISTAN)).toBe(false);
    expect(log.equals(new PrayedLog())).toBe(true);
  });

  it("forgets marks from earlier days when pruned", () => {
    const { schedule } = scheduleAt("17:00");
    const yesterday = event(schedule, "asr", "yesterday");
    const today = event(schedule, "asr");
    const log = new PrayedLog().setting(true, yesterday, PAKISTAN).setting(true, today, PAKISTAN);

    const pruned = log.pruning(schedule.today.day);
    expect(pruned.contains(yesterday, PAKISTAN)).toBe(false);
    expect(pruned.contains(today, PAKISTAN)).toBe(true);
  });

  it("survives being saved", () => {
    const { schedule } = scheduleAt("17:00");
    const log = new PrayedLog()
      .setting(true, event(schedule, "fajr"), PAKISTAN)
      .setting(true, event(schedule, "isha"), PAKISTAN);
    const restored = PrayedLog.fromJSON(JSON.parse(JSON.stringify(log)));
    expect(restored.equals(log)).toBe(true);
  });

  it("ignores a saved log that is not a list of strings", () => {
    expect(PrayedLog.fromJSON({ nope: 1 }).equals(new PrayedLog())).toBe(true);
    expect(PrayedLog.fromJSON([1, "2026-10-04/asr", null]).toJSON()).toEqual(["2026-10-04/asr"]);
  });

  it("keeps an Isha prayed after midnight with the evening it began in", () => {
    const { schedule } = scheduleAt("02:00"); // still in yesterday's Isha
    const isha: PrayerEvent = { prayer: "isha", time: schedule.yesterday.isha };
    const log = new PrayedLog().setting(true, isha, PAKISTAN);
    expect(log.toJSON()).toEqual([`2026-10-03/isha`]);
  });
});

describe("pausing", () => {
  const whole = (instant: number) => instant % 60 === 0;

  it("ends an hour pause on a minute at least an hour away", () => {
    const { schedule, now } = scheduleAt("14:00");
    const end = pauseEnd({ kind: "hour" }, now + 20, schedule);
    expect(whole(end)).toBe(true);
    expect(end).toBeGreaterThanOrEqual(now + 20 + 3600);
    expect(end).toBeLessThan(now + 20 + 3600 + 60);
  });

  it("lasts until the next Fajr for the rest of today", () => {
    const { schedule, now } = scheduleAt("14:00");
    expect(pauseEnd({ kind: "restOfToday" }, now, schedule)).toBe(schedule.tomorrow.fajr);
  });

  it("counts whole days and rounds up to the minute", () => {
    const { schedule, now } = scheduleAt("14:00");
    const end = pauseEnd({ kind: "days", days: 3 }, now + 20, schedule);
    expect(whole(end)).toBe(true);
    expect(end).toBeGreaterThanOrEqual(now + 20 + 3 * 86_400);
    expect(end).toBeLessThan(now + 20 + 3 * 86_400 + 60);
  });

  it("makes the rest of today a day without a schedule", () => {
    const now = 1_800_000_000; // on a minute exactly, so the rounding does not move it
    const length: PauseLength = { kind: "restOfToday" };
    expect(pauseEnd(length, now, null)).toBe(now + 86_400);
  });
});
