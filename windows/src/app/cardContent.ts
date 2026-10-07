import {
  eventEquals,
  eventTitle,
  hijriDateString,
  isPrayer,
  type Instant,
  type Prayer,
  type PrayerEvent,
  type PrayerSchedule,
  PrayedLog,
  Urgency,
  windowAt,
} from "../core";
import { ClockFormat } from "./format";
import { type AppSettings } from "./settings";
import { PrayerWarning } from "./warning";

export type Headline =
  | { kind: "upcoming"; title: string; caption: string }
  | { kind: "ringing"; title: string; caption: string }
  /** No times exist for this place today (polar regions). */
  | { kind: "unavailable" };

export type RowState = "past" | "current" | "next" | "upcoming";

export interface Row {
  prayer: Prayer;
  /**
   * The occurrence a mark on this row is for. Not always the one whose time the row shows: the
   * open prayer can belong to a day other than the one shown, as Isha does once the timetable has
   * moved on.
   */
  event: PrayerEvent;
  title: string;
  time: string;
  shortTime: string;
  state: RowState;
  alarmOn: boolean;
  isPrayed: boolean;
  /** True once a prayer has begun, when it can be marked as prayed or unmarked. */
  canMarkPrayed: boolean;
}

/** Everything the card shows at one instant, already formatted. */
export interface CardContent {
  placeName: string;
  hijriDate: string;
  /** The part of the day we are in, which picks the backdrop. */
  period: Prayer | null;
  headline: Headline;
  /** Seconds on the countdown: to the next event, or to the deadline while a warning shows. */
  remaining: number;
  /** How far we are from the previous event to the next, 0 to 1. */
  progress: number;
  rows: Row[];
  /** The prayer whose time is open and which has not been marked as prayed. */
  open: PrayerEvent | null;
  /** That prayer's name as the user knows it, so Friday's Dhuhr is Jumu'ah. */
  openTitle: string | null;
  /** Set while that prayer is close to its deadline. */
  warning: PrayerWarning | null;
  urgency: Urgency;
}

export function makeCardContent(
  schedule: PrayerSchedule | null,
  settings: AppSettings,
  ringing: PrayerEvent | null,
  prayed: PrayedLog,
  now: Instant,
  timeZone: string,
  placeName: string,
): CardContent {
  const format = new ClockFormat(settings.clockStyle, timeZone);
  const content: CardContent = {
    placeName,
    hijriDate: hijriDateString(
      now,
      timeZone,
      schedule ? now >= schedule.today.maghrib : false,
      settings.hijriDayOffset,
    ),
    period: null,
    headline: { kind: "unavailable" },
    remaining: 0,
    progress: 0,
    rows: [],
    open: null,
    openTitle: null,
    warning: null,
    urgency: Urgency.calm,
  };

  const next = schedule?.next(now);
  if (!schedule || !next) return content;
  const current = schedule.current(now);

  content.period = current?.prayer ?? null;
  content.remaining = next.time - now;
  content.progress = schedule.progress(now);

  const window = windowAt(schedule, now);
  content.rows = schedule
    .displayDay(now)
    .events()
    .map((event): Row => {
      let state: RowState;
      if (eventEquals(event, next)) state = "next";
      else if (eventEquals(event, current) && isPrayer(event.prayer)) state = "current";
      else state = event.time <= now ? "past" : "upcoming";

      // The open prayer's row stands for it, so its mark can still be changed.
      const marked = window && window.event.prayer === event.prayer ? window.event : event;
      const canMarkPrayed = isPrayer(marked.prayer) && marked.time <= now;
      return {
        prayer: event.prayer,
        event: marked,
        title: eventTitle(event, timeZone),
        time: format.time(event.time),
        shortTime: format.shortTime(event.time),
        state,
        alarmOn: settings.alarmPrayers.includes(event.prayer),
        // Only a prayer that has begun can have been marked, which saves looking up the rest.
        isPrayed: canMarkPrayed && prayed.contains(marked, timeZone),
        canMarkPrayed,
      };
    });

  if (window) {
    const isPrayed =
      content.rows.find((row) => eventEquals(row.event, window.event))?.isPrayed ??
      prayed.contains(window.event, timeZone);
    if (!isPrayed) {
      content.open = window.event;
      content.openTitle = eventTitle(window.event, timeZone);
    }
    content.warning = PrayerWarning.forWindow(window, isPrayed, settings, now);
    content.urgency = content.warning?.urgency ?? Urgency.calm;
  }

  if (ringing) {
    content.headline = {
      kind: "ringing",
      title: eventTitle(ringing, timeZone),
      caption: isPrayer(ringing.prayer)
        ? `It's time to pray · ${format.time(ringing.time)}`
        : `Fajr has ended · ${format.time(ringing.time)}`,
    };
  } else if (content.warning) {
    const warning = content.warning;
    // The countdown now runs to the deadline, and the words say what is at stake.
    content.remaining = warning.countdownTarget - now;
    const nextUp = `${eventTitle(next, timeZone)} · ${format.time(next.time)}`;
    content.headline = {
      kind: "upcoming",
      title: warning.title(timeZone),
      caption: warning.isOverdue
        ? nextUp
        : warning.hasEarlyDeadline
          ? `Best time ends ${format.time(warning.window.deadline)}`
          : `Then ${nextUp}`,
    };
  } else {
    content.headline = {
      kind: "upcoming",
      title: eventTitle(next, timeZone),
      caption: isPrayer(next.prayer)
        ? `Next prayer · ${format.time(next.time)}`
        : `Fajr ends · ${format.time(next.time)}`,
    };
  }
  return content;
}

