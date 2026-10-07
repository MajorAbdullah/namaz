import { isPrayer, type PrayerEvent } from "./prayer";
import type { PrayerSchedule } from "./prayerSchedule";
import {
  addDays,
  type CalendarDay,
  compareDays,
  dayContaining,
  dayKey,
  type Instant,
  roundHalfAway,
} from "./time";

/** How close an unprayed prayer is to its deadline, from calm to the last five minutes. */
export const Urgency = { calm: 0, twenty: 1, fifteen: 2, ten: 3, five: 4 } as const;
export type Urgency = (typeof Urgency)[keyof typeof Urgency];

const LEADS: Record<Urgency, number | null> = {
  [Urgency.calm]: null,
  [Urgency.twenty]: 20 * 60,
  [Urgency.fifteen]: 15 * 60,
  [Urgency.ten]: 10 * 60,
  [Urgency.five]: 5 * 60,
};

export const ALL_URGENCIES: readonly Urgency[] = [
  Urgency.calm,
  Urgency.twenty,
  Urgency.fifteen,
  Urgency.ten,
  Urgency.five,
];

/** How long before the deadline this stage begins. Null for `calm`, which has no start. */
export function urgencyLead(urgency: Urgency): number | null {
  return LEADS[urgency];
}

/** The stage that applies with `remaining` seconds to go. A stage begins on its exact minute. */
export function urgencyForRemaining(remaining: number): Urgency {
  let result: Urgency = Urgency.calm;
  for (const stage of ALL_URGENCIES) {
    const lead = LEADS[stage];
    if (lead === null || remaining <= lead) result = stage;
  }
  return result;
}

/**
 * Delaying Asr until the sun pales is disliked, so its deadline comes this long before Maghrib.
 * A fixed 20 minutes stands in for the sun's colour.
 */
export const ASR_DISLIKED_LEAD = 20 * 60;

/** A prayer whose time is open: when it should be prayed by, and when its time really ends. */
export class PrayerWindow {
  /** What the alerts count down to. The same as `closes` for every prayer but Asr. */
  readonly deadline: Instant;

  constructor(
    readonly event: PrayerEvent,
    /** When the next event begins and this prayer can no longer be prayed on time. */
    readonly closes: Instant,
  ) {
    this.deadline = event.prayer === "asr" ? Math.max(event.time, closes - ASR_DISLIKED_LEAD) : closes;
  }

  urgency(date: Instant): Urgency {
    return date < this.closes ? urgencyForRemaining(this.deadline - date) : Urgency.calm;
  }

  /** True once the deadline has gone but the prayer can still be prayed. */
  isOverdue(date: Instant): boolean {
    return date >= this.deadline && date < this.closes;
  }

  /**
   * The next moment the alert changes: a stage begins, or the deadline passes with time still
   * left. Undefined when the only change left is the end of the time itself.
   */
  nextEscalation(date: Instant): Instant | undefined {
    const moments = ALL_URGENCIES.map((stage) => LEADS[stage])
      .filter((lead): lead is number => lead !== null)
      .map((lead) => this.deadline - lead);
    if (this.deadline < this.closes) moments.push(this.deadline);
    const later = moments.filter((moment) => moment > date);
    return later.length ? Math.min(...later) : undefined;
  }

  equals(other: PrayerWindow | null | undefined): boolean {
    return (
      !!other &&
      other.event.prayer === this.event.prayer &&
      other.event.time === this.event.time &&
      other.closes === this.closes
    );
  }
}

/** The prayer whose time is open at `date`. Undefined between sunrise and Dhuhr. */
export function windowAt(schedule: PrayerSchedule, date: Instant): PrayerWindow | undefined {
  const current = schedule.current(date);
  const next = schedule.next(date);
  if (!current || !isPrayer(current.prayer) || !next) return undefined;
  return new PrayerWindow(current, next.time);
}

/** How long the end-of-time alerts are kept quiet. */
export type PauseLength =
  | { kind: "hour" }
  /** Until the next Fajr, when a new day of prayers begins. */
  | { kind: "restOfToday" }
  | { kind: "days"; days: number };

/** When the pause ends. Rounded up to the minute, because the end is shown to the minute. */
export function pauseEnd(length: PauseLength, now: Instant, schedule: PrayerSchedule | null | undefined): Instant {
  let end: Instant;
  switch (length.kind) {
    case "hour":
      end = now + 3600;
      break;
    case "restOfToday":
      end = schedule?.events.find((event) => event.prayer === "fajr" && event.time > now)?.time ?? now + 86_400;
      break;
    case "days":
      end = now + length.days * 86_400;
      break;
  }
  return Math.ceil(end / 60) * 60;
}

/** The prayers the user has marked as prayed. */
export class PrayedLog {
  /** One entry per prayer, such as "2026-10-05/asr". The date is zero-padded, so entries sort in date order. */
  private readonly entries: ReadonlySet<string>;

  constructor(entries: Iterable<string> = []) {
    this.entries = new Set(entries);
  }

  /** A prayer belongs to the day it began on, which keeps an Isha prayed after midnight with the evening it started in. */
  private static entry(event: PrayerEvent, timeZone: string): string {
    return `${dayKey(dayContaining(event.time, timeZone))}/${event.prayer}`;
  }

  contains(event: PrayerEvent, timeZone: string): boolean {
    return this.entries.has(PrayedLog.entry(event, timeZone));
  }

  /** A copy with the prayer marked or unmarked. */
  setting(prayed: boolean, event: PrayerEvent, timeZone: string): PrayedLog {
    const next = new Set(this.entries);
    const entry = PrayedLog.entry(event, timeZone);
    if (prayed) next.add(entry);
    else next.delete(entry);
    return new PrayedLog(next);
  }

  /** A copy that forgets marks from before `day`, so the log does not grow for ever. */
  pruning(before: CalendarDay): PrayedLog {
    const cutoff = dayKey(before);
    return new PrayedLog([...this.entries].filter((entry) => entry >= cutoff));
  }

  equals(other: PrayedLog): boolean {
    if (this.entries.size !== other.entries.size) return false;
    for (const entry of this.entries) if (!other.entries.has(entry)) return false;
    return true;
  }

  toJSON(): string[] {
    return [...this.entries].sort();
  }

  static fromJSON(value: unknown): PrayedLog {
    return new PrayedLog(Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : []);
  }
}


