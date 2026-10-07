import { type Coordinates, type Instant, localParts, weekday } from "../core";
import type { ClockStyle } from "./settings";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Formats clock times the way the user asked for, in a given time zone. */
export class ClockFormat {
  readonly uses24Hour: boolean;

  constructor(
    style: ClockStyle,
    readonly timeZone: string,
  ) {
    switch (style) {
      case "twelveHour":
        this.uses24Hour = false;
        break;
      case "twentyFourHour":
        this.uses24Hour = true;
        break;
      case "system": {
        const cycle = new Intl.DateTimeFormat(undefined, { hour: "numeric" }).resolvedOptions().hourCycle;
        this.uses24Hour = cycle === "h23" || cycle === "h24";
      }
    }
  }

  /** "3:48 PM" or "15:48". */
  time(instant: Instant): string {
    return this.format(instant, true);
  }

  /** "3:48" or "15:48", for tight columns where AM/PM is obvious from context. */
  shortTime(instant: Instant): string {
    return this.format(instant, false);
  }

  /** "6:00 PM" for a time on the same day as `now`, "Thu 6:00 PM" for any other. */
  timeAndDay(instant: Instant, relativeTo: Instant): string {
    const a = localParts(instant, this.timeZone);
    const b = localParts(relativeTo, this.timeZone);
    if (a.year === b.year && a.month === b.month && a.day === b.day) return this.time(instant);
    return `${DAYS[weekday(instant, this.timeZone)]} ${this.time(instant)}`;
  }

  private format(instant: Instant, withPeriod: boolean): string {
    const { hour, minute } = localParts(instant, this.timeZone);
    const mm = String(minute).padStart(2, "0");
    if (this.uses24Hour) return `${String(hour).padStart(2, "0")}:${mm}`;
    const clock = `${hour % 12 || 12}:${mm}`;
    return withPeriod ? `${clock} ${hour < 12 ? "AM" : "PM"}` : clock;
  }
}

export const Countdown = {
  /** "1:12:45", or "12:45" inside the last hour. */
  precise(interval: number): string {
    const total = Math.max(0, Math.ceil(interval));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    const mm = String(minutes).padStart(2, "0");
    const ss = String(seconds).padStart(2, "0");
    return hours > 0 ? `${hours}:${mm}:${ss}` : `${minutes}:${ss}`;
  },

  /** "1h 12m" or "12m", for the tray tooltip where a ticking seconds display would distract. */
  coarse(interval: number): string {
    const minutes = Math.max(1, Math.ceil(interval / 60));
    return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;
  },
};

export type { Coordinates };
