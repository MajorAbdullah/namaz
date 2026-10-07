import type { PrayerConfiguration } from "./calculationMethod";
import type { Coordinates } from "./place";
import { type Prayer, type PrayerEvent } from "./prayer";
import { DailyPrayerTimes, prayerTimes } from "./prayerTimesCalculator";
import { addDays, dayContaining, type Instant } from "./time";

/** Something the app should do at a moment in time: ring for a prayer, or warn that one is close. */
export interface AlarmOccurrence {
  kind: "reminder" | "prayerTime";
  event: PrayerEvent;
  fireDate: Instant;
}

export function alarmEquals(a: AlarmOccurrence | null | undefined, b: AlarmOccurrence | null | undefined) {
  if (!a || !b) return a === b;
  return a.kind === b.kind && a.event.prayer === b.event.prayer && a.event.time === b.event.time && a.fireDate === b.fireDate;
}

/**
 * Prayer times for yesterday, today and tomorrow, which is enough to answer "what is next?" and
 * "what are we in now?" at any moment of today.
 */
export class PrayerSchedule {
  /** Every event across the three days, in chronological order. */
  readonly events: PrayerEvent[];

  private constructor(
    readonly yesterday: DailyPrayerTimes,
    readonly today: DailyPrayerTimes,
    readonly tomorrow: DailyPrayerTimes,
    readonly timeZone: string,
  ) {
    this.events = [...yesterday.events(), ...today.events(), ...tomorrow.events()].sort(
      (a, b) => a.time - b.time,
    );
  }

  /** Null where the sun does not rise or set (polar regions) or the coordinates are invalid. */
  static make(
    around: Instant,
    coordinates: Coordinates,
    timeZone: string,
    configuration: PrayerConfiguration,
  ): PrayerSchedule | null {
    const day = dayContaining(around, timeZone);
    const times = (offset: number) =>
      prayerTimes(addDays(day, offset), coordinates, timeZone, configuration);
    const yesterday = times(-1);
    const today = times(0);
    const tomorrow = times(1);
    if (!yesterday || !today || !tomorrow) return null;
    return new PrayerSchedule(yesterday, today, tomorrow, timeZone);
  }

  /** The first event strictly after `date`. */
  next(date: Instant): PrayerEvent | undefined {
    return this.events.find((event) => event.time > date);
  }

  /** The most recent event at or before `date`: the period we are currently in. */
  current(date: Instant): PrayerEvent | undefined {
    for (let i = this.events.length - 1; i >= 0; i--) {
      if (this.events[i].time <= date) return this.events[i];
    }
    return undefined;
  }

  /** The day whose timetable is worth showing: today, until Isha has passed, then tomorrow. */
  displayDay(date: Instant): DailyPrayerTimes {
    return date >= this.today.isha ? this.tomorrow : this.today;
  }

  /** How far `date` is through the gap between the current event and the next, from 0 to 1. */
  progress(date: Instant): number {
    const current = this.current(date);
    const next = this.next(date);
    if (!current || !next) return 0;
    const span = next.time - current.time;
    if (!(span > 0)) return 0;
    return Math.min(Math.max((date - current.time) / span, 0), 1);
  }

  /** True when the two schedules hold the same times, so a model can skip a redundant update. */
  equals(other: PrayerSchedule | null | undefined): boolean {
    if (!other || other.timeZone !== this.timeZone) return false;
    if (this.events.length !== other.events.length) return false;
    return this.events.every(
      (event, i) => event.prayer === other.events[i].prayer && event.time === other.events[i].time,
    );
  }

  /**
   * All alarms across the schedule, in the order they fire.
   * @param enabled the events that should ring.
   * @param reminderLead how long before each enabled event to give an advance warning, if at all.
   */
  alarms(enabled: ReadonlySet<Prayer>, reminderLead: number | null): AlarmOccurrence[] {
    const occurrences: AlarmOccurrence[] = [];
    for (const event of this.events) {
      if (!enabled.has(event.prayer)) continue;
      occurrences.push({ kind: "prayerTime", event, fireDate: event.time });
      if (reminderLead !== null && reminderLead > 0) {
        occurrences.push({ kind: "reminder", event, fireDate: event.time - reminderLead });
      }
    }
    return occurrences.sort((a, b) => a.fireDate - b.fireDate);
  }

  /**
   * Alarms that came due in the window `(cursor, now]`.
   *
   * Anything more than `grace` seconds overdue is dropped rather than rung late, which is what
   * happens to alarms that pass while the computer is asleep.
   */
  dueAlarms(
    after: Instant,
    upTo: Instant,
    enabled: ReadonlySet<Prayer>,
    reminderLead: number | null,
    grace: number,
  ): AlarmOccurrence[] {
    return this.alarms(enabled, reminderLead).filter(
      (alarm) => alarm.fireDate > after && alarm.fireDate <= upTo && upTo - alarm.fireDate <= grace,
    );
  }

  /** The next moment anything changes: an alarm fires, or a new prayer period begins. */
  nextChange(now: Instant, enabled: ReadonlySet<Prayer>, reminderLead: number | null): Instant | undefined {
    const alarm = this.alarms(enabled, reminderLead).find((candidate) => candidate.fireDate > now)?.fireDate;
    const candidates = [alarm, this.next(now)?.time].filter((value): value is Instant => value !== undefined);
    return candidates.length ? Math.min(...candidates) : undefined;
  }
}
