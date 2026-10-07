import {
  type Instant,
  PrayedLog,
  type PrayerSchedule,
  PrayerWindow,
  Urgency,
  eventTitle,
  urgencyLead,
  windowAt,
} from "../core";
import { Countdown } from "./format";
import { type AppSettings, alertsArePaused } from "./settings";

/** An open prayer that has not been marked as prayed and is close to its deadline. */
export class PrayerWarning {
  constructor(
    readonly window: PrayerWindow,
    readonly urgency: Urgency,
    /** Past the deadline with time still left to pray, which only Asr can be. */
    readonly isOverdue: boolean,
  ) {}

  /** The warning that applies at `now`, if there is one. */
  static current(
    schedule: PrayerSchedule | null | undefined,
    settings: AppSettings,
    prayed: PrayedLog,
    now: Instant,
    timeZone: string,
  ): PrayerWarning | null {
    if (!settings.endOfTimeAlerts || !schedule) return null;
    const window = windowAt(schedule, now);
    if (!window) return null;
    return PrayerWarning.forWindow(window, prayed.contains(window.event, timeZone), settings, now);
  }

  /** The same, for a caller that already knows which prayer is open and whether it is marked. */
  static forWindow(
    window: PrayerWindow,
    isPrayed: boolean,
    settings: AppSettings,
    now: Instant,
  ): PrayerWarning | null {
    if (!settings.endOfTimeAlerts || alertsArePaused(settings, now) || isPrayed) return null;
    const urgency = window.urgency(now);
    if (urgency <= Urgency.calm) return null;
    return new PrayerWarning(window, urgency, window.isOverdue(now));
  }

  equals(other: PrayerWarning | null | undefined): boolean {
    return !!other && other.urgency === this.urgency && other.isOverdue === this.isOverdue && other.window.equals(this.window);
  }

  /** True for a prayer that should be prayed some time before its time ends, as Asr should. */
  get hasEarlyDeadline(): boolean {
    return this.window.deadline < this.window.closes;
  }

  /** What the countdown beside the warning runs to. */
  get countdownTarget(): Instant {
    return this.isOverdue ? this.window.closes : this.window.deadline;
  }

  /**
   * Where the cover's sun stands: 1 at the top of its path when the cover appears, 0 resting on the
   * horizon at the deadline, and down to -1, fully set, when an overdue Asr's time ends.
   */
  sunHeight(now: Instant): number {
    const clamped = (value: number) => Math.min(Math.max(value, 0), 1);
    if (this.isOverdue) {
      const span = this.window.closes - this.window.deadline;
      return span > 0 ? -clamped((now - this.window.deadline) / span) : -1;
    }
    const coverSpan = urgencyLead(Urgency.ten) ?? 600;
    return clamped((this.window.deadline - now) / coverSpan);
  }

  /** The few words that sit beside the countdown on the island and the card. */
  title(timeZone: string): string {
    const name = eventTitle(this.window.event, timeZone);
    if (this.isOverdue) return `Pray ${name} now`;
    return this.hasEarlyDeadline ? `Pray ${name}` : `${name} ends`;
  }

  /** The full sentence shown on the screen cover. */
  detail(now: Instant, timeZone: string): string {
    const name = eventTitle(this.window.event, timeZone);
    const left = Countdown.precise(this.countdownTarget - now);
    if (this.isOverdue) return `Maghrib is in ${left}. Pray ${name} now.`;
    return this.hasEarlyDeadline ? `Best time for ${name} ends in ${left}` : `${name} ends in ${left}`;
  }

  /** The line for the tray tooltip. */
  menuBarTitle(now: Instant, timeZone: string): string {
    const name = eventTitle(this.window.event, timeZone);
    const left = Countdown.coarse(this.countdownTarget - now);
    if (this.isOverdue) return `Pray ${name} now`;
    return this.hasEarlyDeadline ? `Pray ${name} · ${left}` : `${name} ends in ${left}`;
  }
}
