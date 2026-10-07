import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type AlarmSound, AppEngine, makeCardContent, type Platform, readSettings, defaultSettings } from "../app";
import { Urgency, addDays, dayKey, type PrayerEvent } from "../core";
import { clockOn, OCT_4, PAKISTAN } from "./helpers";

/** A platform that records what the engine asks of it. */
function fakePlatform() {
  const calls = {
    chimes: 0,
    sounds: [] as { sound: AlarmSound; volume: number }[],
    notifications: [] as { kind: string; title: string }[],
    saved: [] as string[],
    stops: 0,
  };
  let endSound: (() => void) | null = null;
  const platform: Platform = {
    load: async () => null,
    save: async (name) => {
      calls.saved.push(name);
    },
    playSound: async (sound, volume, onEnd) => {
      calls.sounds.push({ sound, volume });
      endSound = onEnd;
      return true;
    },
    stopSound: () => {
      calls.stops += 1;
    },
    playChime: () => {
      calls.chimes += 1;
    },
    notify: (kind, title) => {
      calls.notifications.push({ kind, title });
    },
    clearAlarmNotification: () => {},
    log: () => {},
  };
  return { platform, calls, finishSound: () => endSound?.() };
}

async function engineAt(clock: string, day = OCT_4) {
  vi.setSystemTime(clockOn(clock, day, PAKISTAN) * 1000);
  const fake = fakePlatform();
  const engine = new AppEngine(fake.platform, { clockOffset: 0, mutesSound: false, timeZone: PAKISTAN, isActive: true });
  await engine.start();
  return { engine, ...fake };
}

/** An engine whose clock is `minutes` before one of today's times. */
async function engineBefore(minutes: number, prayer: "asr" | "maghrib" | "dhuhr" | "isha") {
  const probe = await engineAt("12:00");
  const time = probe.engine.schedule!.today.at(prayer);
  probe.engine.stop();
  vi.setSystemTime((time - minutes * 60) * 1000);
  const fake = fakePlatform();
  const engine = new AppEngine(fake.platform, { clockOffset: 0, mutesSound: false, timeZone: PAKISTAN, isActive: true });
  await engine.start();
  return { engine, ...fake };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("end-of-time warning", () => {
  it("rises for an unprayed prayer near its end", async () => {
    const { engine } = await engineBefore(12, "asr");
    const warning = engine.warning!;
    expect(warning.window.event.prayer).toBe("dhuhr");
    expect(warning.urgency).toBe(Urgency.fifteen);
    expect(warning.isOverdue).toBe(false);
    expect(warning.title(PAKISTAN).endsWith("ends")).toBe(true);
    expect(engine.menuBarTitle).toContain("ends in 12m");
  });

  it("is absent with plenty of time left", async () => {
    expect((await engineBefore(30, "asr")).engine.warning).toBeNull();
  });

  it("clears when the prayer is marked and returns when unmarked", async () => {
    const { engine } = await engineBefore(8, "asr");
    const event = engine.warning!.window.event;
    expect(engine.warning!.urgency).toBe(Urgency.ten);

    engine.setPrayed(true, event);
    expect(engine.warning).toBeNull();
    expect(engine.prayed.contains(event, PAKISTAN)).toBe(true);

    engine.setPrayed(false, event);
    expect(engine.warning?.urgency).toBe(Urgency.ten);
  });

  it("clears when alerts are switched off", async () => {
    const { engine } = await engineBefore(8, "asr");
    engine.dispatch({ type: "patchSettings", patch: { endOfTimeAlerts: false } });
    expect(engine.warning).toBeNull();
  });

  it("is silenced by a pause until resumed", async () => {
    const { engine } = await engineBefore(8, "asr");
    engine.pauseAlerts({ kind: "hour" });
    expect(engine.warning).toBeNull();
    expect(engine.pauseEnd).not.toBeNull();
    expect(engine.settings.alertsPausedUntil! % 60).toBe(0);

    engine.resumeAlerts();
    expect(engine.warning).not.toBeNull();
  });

  it("clears the pause by itself when it ends, and the warning comes back", async () => {
    const { engine } = await engineBefore(8, "asr");
    engine.pauseAlerts({ kind: "hour" });
    const until = engine.settings.alertsPausedUntil!;
    // Dhuhr's time is over by then, so look at what the pause itself does.
    vi.setSystemTime((until + 1) * 1000);
    engine.refresh();
    expect(engine.settings.alertsPausedUntil).toBeNull();
    expect(engine.pauseEnd).toBeNull();
  });

  it("pauses for the rest of today until the next Fajr", async () => {
    const { engine } = await engineBefore(8, "asr");
    engine.pauseAlerts({ kind: "restOfToday" });
    expect(engine.settings.alertsPausedUntil).toBe(engine.schedule!.tomorrow.fajr);
  });

  it("counts Asr down to twenty minutes before Maghrib", async () => {
    // 28 minutes before Maghrib is 8 before Asr's deadline.
    const { engine } = await engineBefore(28, "maghrib");
    const warning = engine.warning!;
    expect(warning.window.event.prayer).toBe("asr");
    expect(warning.urgency).toBe(Urgency.ten);
    expect(warning.isOverdue).toBe(false);
    expect(warning.title(PAKISTAN)).toBe("Pray Asr");
    expect(warning.countdownTarget).toBe(warning.window.deadline);
  });

  it("puts the cover's sun on the horizon at the deadline and below it by the end", async () => {
    const dhuhr = (await engineBefore(8, "asr")).engine.warning!;
    const deadline = dhuhr.window.deadline;
    expect(dhuhr.sunHeight(deadline - 10 * 60)).toBe(1);
    expect(dhuhr.sunHeight(deadline - 5 * 60)).toBe(0.5);
    expect(dhuhr.sunHeight(deadline)).toBe(0);

    const asr = (await engineBefore(10, "maghrib")).engine.warning!;
    expect(asr.isOverdue).toBe(true);
    expect(asr.sunHeight(asr.window.closes - 10 * 60)).toBe(-0.5);
    expect(asr.sunHeight(asr.window.closes)).toBe(-1);
  });

  it("keeps Asr urgent after its deadline and counts down to Maghrib", async () => {
    const { engine } = await engineBefore(12, "maghrib");
    const warning = engine.warning!;
    expect(warning.urgency).toBe(Urgency.five);
    expect(warning.isOverdue).toBe(true);
    expect(warning.title(PAKISTAN)).toBe("Pray Asr now");
    expect(warning.countdownTarget).toBe(warning.window.closes);
    expect(warning.detail(warning.window.closes - 12 * 60, PAKISTAN)).toBe("Maghrib is in 12:00. Pray Asr now.");
  });

  it("keeps the tray tooltip plain for an icon-only menu bar", async () => {
    const { engine } = await engineBefore(12, "asr");
    engine.dispatch({ type: "patchSettings", patch: { menuBarStyle: "iconOnly" } });
    expect(engine.warning).not.toBeNull();
    expect(engine.menuBarTitle).toBe("");
  });
});

describe("chimes", () => {
  it("sounds once per step up, not on easing off, and not again for the same stage", async () => {
    const { engine, calls } = await engineBefore(20.5, "asr");
    expect(engine.warning).toBeNull();
    expect(calls.chimes).toBe(0);

    vi.advanceTimersByTime(31 * 1000); // into the twenty-minute stage
    expect(engine.warning?.urgency).toBe(Urgency.twenty);
    expect(calls.chimes).toBe(1);

    engine.refresh();
    engine.refresh();
    expect(calls.chimes).toBe(1);

    vi.advanceTimersByTime(5 * 60 * 1000); // fifteen minutes left
    expect(engine.warning?.urgency).toBe(Urgency.fifteen);
    expect(calls.chimes).toBe(2);
  });

  it("does not sound again for the same stage when the prayer's times move a little", async () => {
    const { engine, calls } = await engineBefore(8, "asr");
    expect(calls.chimes).toBe(1);
    // A change of place or a nudge to a calculation setting moves Asr by a minute or so.
    engine.dispatch({
      type: "patchSettings",
      patch: { calculation: { ...engine.settings.calculation, adjustments: { asr: 1 } } },
    });
    expect(engine.warning?.urgency).toBe(Urgency.ten);
    expect(calls.chimes).toBe(1);
  });

  it("stays quiet over a ringing adhan", async () => {
    const { engine, calls } = await engineBefore(20.5, "asr");
    engine.testAlarm();
    await vi.advanceTimersByTimeAsync(31 * 1000);
    expect(engine.ringing).not.toBeNull();
    expect(engine.warning?.urgency).toBe(Urgency.twenty);
    expect(calls.chimes).toBe(0);
  });

  it("stays quiet when the alarm sound is silent", async () => {
    const { engine, calls } = await engineBefore(20.5, "asr");
    engine.dispatch({ type: "patchSettings", patch: { alarmSound: { kind: "silent" } } });
    vi.advanceTimersByTime(31 * 1000);
    expect(engine.warning?.urgency).toBe(Urgency.twenty);
    expect(calls.chimes).toBe(0);
  });
});

describe("alarms", () => {
  it("rings at the exact time and keeps showing for at least 45 seconds", async () => {
    const { engine, calls, finishSound } = await engineBefore(0.5, "asr");
    expect(engine.ringing).toBeNull();

    await vi.advanceTimersByTimeAsync(31 * 1000);
    expect(engine.ringing?.prayer).toBe("asr");
    expect(calls.sounds).toHaveLength(1);
    expect(calls.sounds[0].sound.kind).toBe("adhan");
    expect(calls.notifications.some((n) => n.kind === "alarm")).toBe(true);
    expect(engine.menuBarTitle).toBe("Asr now");

    // The sound is shorter than the minimum display, so the alarm stays on screen.
    finishSound();
    await vi.advanceTimersByTimeAsync(20 * 1000);
    expect(engine.ringing).not.toBeNull();
    await vi.advanceTimersByTimeAsync(30 * 1000);
    expect(engine.ringing).toBeNull();
  });

  it("stops when asked, and silences the sound", async () => {
    const { engine, calls } = await engineBefore(0.1, "asr");
    await vi.advanceTimersByTimeAsync(10 * 1000);
    expect(engine.ringing).not.toBeNull();
    const before = calls.stops;
    engine.stopAlarm();
    expect(engine.ringing).toBeNull();
    expect(calls.stops).toBeGreaterThan(before);
  });

  it("rings one reminder ahead of the time when asked", async () => {
    const probe = await engineAt("12:00");
    probe.engine.dispatch({ type: "patchSettings", patch: { reminderMinutes: 10 } });
    const asr = probe.engine.schedule!.today.asr;
    probe.engine.stop();

    vi.setSystemTime((asr - 10 * 60 - 5) * 1000);
    const fake = fakePlatform();
    const engine = new AppEngine(fake.platform, { clockOffset: 0, mutesSound: false, timeZone: PAKISTAN, isActive: true });
    await engine.start();
    engine.dispatch({ type: "patchSettings", patch: { reminderMinutes: 10 } });
    await vi.advanceTimersByTimeAsync(6 * 1000);
    expect(fake.calls.notifications.map((n) => n.kind)).toEqual(["reminder"]);
    expect(engine.ringing).toBeNull();
  });

  it("does not ring late after the computer sleeps through an alarm", async () => {
    const { engine, calls } = await engineBefore(5, "asr");
    // Sleep through the alarm: the clock jumps an hour ahead with no timer firing.
    vi.setSystemTime(Date.now() + 3600 * 1000);
    engine.beat();
    expect(engine.ringing).toBeNull();
    expect(calls.sounds).toHaveLength(0);
  });

  it("rings if the computer wakes within the grace period", async () => {
    const { engine, calls } = await engineBefore(1, "asr");
    // Asleep for a little over a minute: Asr came due 30 seconds ago.
    vi.setSystemTime(Date.now() + 90 * 1000);
    engine.beat();
    await vi.advanceTimersByTimeAsync(1);
    expect(engine.ringing?.prayer).toBe("asr");
    expect(calls.sounds).toHaveLength(1);
  });
});

describe("clock safety", () => {
  it("rolls over to the new day at midnight without anyone asking", async () => {
    const { engine } = await engineAt("23:59");
    vi.setSystemTime((clockOn("23:59", OCT_4, PAKISTAN) + 30) * 1000);
    engine.refresh();
    const before = dayKey(engine.schedule!.today.day);
    await vi.advanceTimersByTimeAsync(40 * 1000);
    const after = dayKey(engine.schedule!.today.day);
    expect(before).toBe("2026-10-04");
    expect(after).toBe("2026-10-05");
  });

  it("notices the day change from a beat even if its timer was held back", async () => {
    const { engine } = await engineAt("23:59");
    vi.setSystemTime(clockOn("00:01", addDays(OCT_4, 1), PAKISTAN) * 1000);
    engine.beat();
    expect(dayKey(engine.schedule!.today.day)).toBe("2026-10-05");
  });

  it("copes with the clock being set back, without ringing the same alarm twice", async () => {
    const { engine, calls } = await engineBefore(1 / 60, "asr"); // a second before Asr
    await vi.advanceTimersByTimeAsync(2000);
    expect(calls.sounds).toHaveLength(1);
    engine.stopAlarm();

    vi.setSystemTime(Date.now() - 60 * 1000); // set back a minute, to before Asr
    engine.beat();
    expect(engine.ringing).toBeNull();
    // Asr is ahead of the clock again, but it has already rung once and does not ring again.
    await vi.advanceTimersByTimeAsync(62 * 1000);
    expect(engine.ringing).toBeNull();
    expect(calls.sounds).toHaveLength(1);
  });

  it("recalculates when the time zone changes", async () => {
    const fake = fakePlatform();
    vi.setSystemTime(clockOn("14:00", OCT_4, PAKISTAN) * 1000);
    let zone = PAKISTAN;
    const engine = new AppEngine(fake.platform, { clockOffset: 0, mutesSound: false, timeZone: null, isActive: true });
    Object.defineProperty(engine, "timeZone", { get: () => zone });
    await engine.start();
    zone = "America/New_York";
    engine.beat();
    expect(engine.snapshot().timeZone).toBe("America/New_York");
    expect(engine.schedule!.timeZone).toBe("America/New_York");
  });

  it("does not act on a beat that comes on time", async () => {
    const { engine } = await engineAt("14:00");
    const revision = engine.revision;
    vi.advanceTimersByTime(1000);
    engine.beat();
    expect(engine.revision).toBe(revision);
  });
});

describe("settings", () => {
  it("keeps what it can read from older or damaged settings", () => {
    const saved = readSettings(
      { locationMode: "manual", alarmVolume: 7, widgetLayout: "nonsense", reminderMinutes: 10, calculation: { method: "egyptian", madhab: 5 } },
      PAKISTAN,
    );
    const defaults = defaultSettings(PAKISTAN);
    expect(saved.locationMode).toBe("manual");
    expect(saved.reminderMinutes).toBe(10);
    expect(saved.calculation.method).toBe("egyptian");
    // Unreadable values fall back one by one.
    expect(saved.alarmVolume).toBe(defaults.alarmVolume);
    expect(saved.widgetLayout).toBe(defaults.widgetLayout);
    expect(saved.calculation.madhab).toBe(defaults.calculation.madhab);
    expect(saved.endOfTimeAlerts).toBe(true);
    expect(saved.alertsPausedUntil).toBeNull();
  });

  it("round-trips through JSON", () => {
    const settings = { ...defaultSettings(PAKISTAN), alertsPausedUntil: 1_800_000_000, endOfTimeCover: false };
    expect(readSettings(JSON.parse(JSON.stringify(settings)), PAKISTAN)).toEqual(settings);
  });

  it("starts from regional defaults", () => {
    const settings = defaultSettings(PAKISTAN);
    expect(settings.calculation.method).toBe("karachi");
    expect(settings.calculation.madhab).toBe("hanafi");
    expect(settings.manualPlace.name).toBe("Karachi");
    expect(settings.alarmPrayers).toEqual(["fajr", "dhuhr", "asr", "maghrib", "isha"]);
  });
});

describe("the card", () => {
  it("keeps Isha markable once the timetable has moved on to tomorrow", async () => {
    const { engine } = await engineAt("20:00");
    const content = makeCardContent(engine.schedule, engine.settings, null, engine.prayed, engine.now, PAKISTAN, "Karachi");
    const isha = content.rows.find((row) => row.prayer === "isha")!;
    // The rows are tomorrow's, but the open Isha is tonight's, and its row stands for it.
    expect(isha.canMarkPrayed).toBe(true);
    expect(isha.event.time).toBe(engine.schedule!.today.isha);
    expect(content.open?.prayer).toBe("isha");

    engine.setPrayed(true, isha.event);
    const marked = makeCardContent(engine.schedule, engine.settings, null, engine.prayed, engine.now, PAKISTAN, "Karachi");
    expect(marked.rows.find((row) => row.prayer === "isha")!.isPrayed).toBe(true);
    expect(marked.open).toBeNull();

    // And it can be undone.
    engine.setPrayed(false, marked.rows.find((row) => row.prayer === "isha")!.event);
    const unmarked = makeCardContent(engine.schedule, engine.settings, null, engine.prayed, engine.now, PAKISTAN, "Karachi");
    expect(unmarked.open?.prayer).toBe("isha");
  });

  it("lets only prayers that have begun be ticked", async () => {
    const { engine } = await engineAt("14:00");
    const content = makeCardContent(engine.schedule, engine.settings, null, engine.prayed, engine.now, PAKISTAN, "Karachi");
    expect(content.rows.map((row) => [row.prayer, row.canMarkPrayed])).toEqual([
      ["fajr", true],
      ["sunrise", false],
      ["dhuhr", true],
      ["asr", false],
      ["maghrib", false],
      ["isha", false],
    ]);
  });

  it("names the open prayer for Friday as Jumu'ah", async () => {
    const { engine } = await engineAt("14:00", { year: 2026, month: 10, day: 2 });
    const content = makeCardContent(engine.schedule, engine.settings, null, engine.prayed, engine.now, PAKISTAN, "Karachi");
    expect(content.openTitle).toBe("Jumu'ah");
  });

  it("shows the alarm in the headline while one rings", async () => {
    const { engine } = await engineAt("14:00");
    const event: PrayerEvent = { prayer: "dhuhr", time: engine.now };
    const content = makeCardContent(engine.schedule, engine.settings, event, engine.prayed, engine.now, PAKISTAN, "Karachi");
    expect(content.headline.kind).toBe("ringing");
  });
});
