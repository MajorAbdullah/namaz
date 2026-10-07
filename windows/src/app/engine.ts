import {
  type AlarmOccurrence,
  alarmEquals,
  addDays,
  dayContaining,
  dayKey,
  eventTitle,
  type Instant,
  instantFromLocal,
  isPrayer,
  type PauseLength,
  pauseEnd,
  type Place,
  type Prayer,
  PrayedLog,
  type PrayerEvent,
  PrayerSchedule,
  systemTimeZone,
  windowAt,
} from "../core";
import { ClockFormat, Countdown } from "./format";
import {
  type AlarmSound,
  type AppSettings,
  currentPlace,
  defaultSettings,
  readSettings,
  reminderLead,
} from "./settings";
import { PrayerWarning } from "./warning";

/** Switches for exercising the app without waiting for a real prayer time. */
export interface Diagnostics {
  /** Added to the real time, in seconds, to get the time the app believes it is. */
  clockOffset: number;
  mutesSound: boolean;
  /** Overrides the computer's time zone, so a fake clock set in another country makes sense. */
  timeZone: string | null;
  /** True when any switch is set: settings stay in memory and no permission prompts appear. */
  isActive: boolean;
}

export const NO_DIAGNOSTICS: Diagnostics = { clockOffset: 0, mutesSound: false, timeZone: null, isActive: false };

/** The parts of the app that touch the operating system, so the engine can be tested without it. */
export interface Platform {
  load(name: "settings" | "prayed"): Promise<unknown>;
  save(name: "settings" | "prayed", value: unknown): Promise<void>;
  /** Starts the sound; calls `onEnd` when it ends on its own. Returns false if it cannot play. */
  playSound(sound: AlarmSound, volume: number, onEnd: () => void): Promise<boolean>;
  stopSound(): void;
  /** A short sound for something that is not an alarm. */
  playChime(volume: number): void;
  notify(kind: "alarm" | "reminder", title: string, body: string): void;
  clearAlarmNotification(): void;
  /** Asks the computer where it is. The answer comes back through `engine.setDetectedPlace`. */
  requestLocation?(): void;
  log(message: string): void;
}

/** Everything a window needs to draw itself. Plain data, so it can cross to another window. */
export interface Snapshot {
  settings: AppSettings;
  /** Marks saved as "YYYY-MM-DD/prayer". */
  prayed: string[];
  ringing: PrayerEvent | null;
  /** The line for the tray tooltip. */
  menuBarTitle: string;
  clockOffset: number;
  mutesSound: boolean;
  timeZone: string;
  /** Counts up with every change, so a window can ignore a snapshot older than the one it has. */
  revision: number;
}

export type Command =
  | { type: "setPrayed"; prayed: boolean; event: PrayerEvent }
  | { type: "stopAlarm" }
  | { type: "toggleAlarm"; prayer: Prayer }
  | { type: "patchSettings"; patch: Partial<AppSettings> }
  | { type: "pauseAlerts"; length: PauseLength }
  | { type: "resumeAlerts" }
  | { type: "testAlarm" }
  | { type: "locate" };

export type TimerHandle = ReturnType<typeof setTimeout>;

/**
 * The app's state: settings, today's schedule, and the alarm that is ringing, if any. It owns the
 * one timer that wakes the app whenever something is due to change. A port of the Mac app's
 * `AppModel`.
 */
export class AppEngine {
  /** An alarm that comes due while the computer is asleep is skipped once it is this stale, rather than rung late. */
  static readonly lateAlarmGrace = 120;
  /** An alarm stays on screen at least this long, even when its sound is shorter. */
  static readonly minimumAlarmDisplay = 45;
  static readonly locationRefreshInterval = 6 * 3600 * 1000;
  /** A gap longer than this between two beats means the computer slept or the clock jumped. */
  static readonly beatGap = 30_000;

  settings: AppSettings;
  prayed = new PrayedLog();
  schedule: PrayerSchedule | null = null;
  ringing: PrayerEvent | null = null;
  menuBarTitle = "";
  warning: PrayerWarning | null = null;
  revision = 0;

  private listeners = new Set<(snapshot: Snapshot) => void>();
  private timer: TimerHandle | null = null;
  /** Real time (ms) the timer is due, so a beat can wake the engine if the timer was held back. */
  private wakeAtMs = 0;
  private alarmCursor: Instant;
  private lastRung: AlarmOccurrence | null = null;
  private lastChime = 0;
  private ringStarted = 0;
  private dismissal: TimerHandle | null = null;
  private lastLocationRequest = 0;
  private lastBeat = Date.now();
  private lastZone: string;
  private lastDay = "";

  constructor(
    private readonly platform: Platform,
    readonly diagnostics: Diagnostics = NO_DIAGNOSTICS,
  ) {
    this.lastZone = this.timeZone;
    this.settings = defaultSettings(this.timeZone);
    this.alarmCursor = this.now;
  }

  // MARK: - Time

  /** The time the app acts on: the real time, unless a diagnostic run has shifted it. */
  get now(): Instant {
    return Date.now() / 1000 + this.diagnostics.clockOffset;
  }

  get timeZone(): string {
    return this.diagnostics.timeZone ?? systemTimeZone();
  }

  get clockFormat(): ClockFormat {
    return new ClockFormat(this.settings.clockStyle, this.timeZone);
  }

  /** When the pause in force ends. Null when the alerts are not paused. */
  get pauseEnd(): Instant | null {
    const until = this.settings.alertsPausedUntil;
    return until !== null && until > this.now ? until : null;
  }

  // MARK: - Lifecycle

  /** Loads what was saved, then starts keeping time. */
  async start(): Promise<void> {
    if (!this.diagnostics.isActive) {
      const [settings, prayed] = await Promise.all([this.platform.load("settings"), this.platform.load("prayed")]);
      this.settings = readSettings(settings, this.timeZone);
      this.prayed = PrayedLog.fromJSON(prayed);
    }
    this.alarmCursor = this.now;
    this.refresh();
    this.requestLocationIfStale();
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    if (this.dismissal) clearTimeout(this.dismissal);
    this.timer = this.dismissal = null;
  }

  /**
   * Called about once a second from a native timer, which keeps ticking when a hidden window's own
   * timers are held back. Wakes the engine if its timer is late, and notices the computer waking
   * from sleep, the clock being set, the time zone changing and the day turning over.
   */
  beat(): void {
    const realNow = Date.now();
    const elapsed = realNow - this.lastBeat;
    this.lastBeat = realNow;
    if (elapsed < 0 || elapsed > AppEngine.beatGap || this.timeZone !== this.lastZone) {
      this.clockChanged();
      return;
    }
    if (realNow >= this.wakeAtMs || dayKey(dayContaining(this.now, this.timeZone)) !== this.lastDay) {
      this.refresh();
    }
  }

  private clockChanged(): void {
    // If the clock was set back, alarms between the new time and the old one are ahead of us again.
    this.alarmCursor = Math.min(this.alarmCursor, this.now);
    this.refresh();
    this.requestLocationIfStale();
  }

  /** Recomputes the schedule, rings anything that has come due, and sets the next wake-up. */
  refresh(): void {
    const now = this.now;
    this.lastZone = this.timeZone;
    this.lastDay = dayKey(dayContaining(now, this.timeZone));
    // A pause that has run out is cleared, which is what tells the windows showing it. Setting it
    // refreshes again.
    if (this.settings.alertsPausedUntil !== null && this.settings.alertsPausedUntil <= now) {
      this.setSettings({ ...this.settings, alertsPausedUntil: null });
      return;
    }
    const place = currentPlace(this.settings);
    const updated = PrayerSchedule.make(now, place.coordinates, this.timeZone, this.settings.calculation);
    if (!updated?.equals(this.schedule)) this.schedule = updated;

    this.ringDueAlarms(now);
    this.alarmCursor = now;
    this.updateWarning(now);
    this.updateMenuBarTitle(now);
    this.armTimer(now);
    this.publish();
  }

  // MARK: - Snapshots

  snapshot(): Snapshot {
    return {
      settings: this.settings,
      prayed: this.prayed.toJSON(),
      ringing: this.ringing,
      menuBarTitle: this.menuBarTitle,
      clockOffset: this.diagnostics.clockOffset,
      mutesSound: this.diagnostics.mutesSound,
      timeZone: this.timeZone,
      revision: this.revision,
    };
  }

  subscribe(listener: (snapshot: Snapshot) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private publish(): void {
    this.revision += 1;
    const snapshot = this.snapshot();
    for (const listener of this.listeners) listener(snapshot);
  }

  // MARK: - Commands

  dispatch(command: Command): void {
    switch (command.type) {
      case "setPrayed":
        this.setPrayed(command.prayed, command.event);
        break;
      case "stopAlarm":
        this.stopAlarm();
        break;
      case "toggleAlarm":
        this.toggleAlarm(command.prayer);
        break;
      case "patchSettings":
        this.setSettings({ ...this.settings, ...command.patch });
        break;
      case "pauseAlerts":
        this.pauseAlerts(command.length);
        break;
      case "resumeAlerts":
        this.resumeAlerts();
        break;
      case "testAlarm":
        this.testAlarm();
        break;
      case "locate":
        this.updateLocation();
        break;
    }
  }

  /** Replaces the settings, saves them, and brings everything that depends on them up to date. */
  setSettings(next: AppSettings): void {
    const previous = this.settings;
    if (JSON.stringify(next) === JSON.stringify(previous)) return;
    this.settings = next;
    if (!this.diagnostics.isActive) void this.platform.save("settings", next);
    if (next.locationMode === "automatic" && previous.locationMode !== "automatic") this.updateLocation();
    this.refresh();
  }

  // MARK: - Location

  updateLocation(): void {
    if (this.diagnostics.isActive) return;
    this.lastLocationRequest = Date.now();
    this.platform.requestLocation?.();
  }

  private requestLocationIfStale(): void {
    if (this.settings.locationMode !== "automatic") return;
    if (Date.now() - this.lastLocationRequest <= AppEngine.locationRefreshInterval) return;
    this.updateLocation();
  }

  /** The computer's answer to a location request. */
  setDetectedPlace(place: Place): void {
    this.platform.log(`Located: ${place.name}`);
    this.setSettings({ ...this.settings, detectedPlace: place });
  }

  // MARK: - Timer

  private armTimer(now: Instant): void {
    if (this.timer) clearTimeout(this.timer);

    // Midnight, when the schedule rolls over to a new day.
    const wakeTimes: Instant[] = [this.startOfNextDay(now)];

    const schedule = this.schedule;
    if (schedule) {
      const change = schedule.nextChange(now, new Set(this.settings.alarmPrayers), reminderLead(this.settings));
      if (change !== undefined) wakeTimes.push(change);

      const next = schedule.next(now);
      if (next && (this.settings.menuBarStyle === "countdown" || this.warning !== null)) {
        // The countdown reads in whole minutes; redraw each time one runs out. A warning's
        // deadline is a whole number of minutes from the next event, so the same beat serves both.
        const partMinute = (next.time - now) % 60;
        wakeTimes.push(now + (partMinute > 0 ? partMinute : 60));
      }
      const window = windowAt(schedule, now);
      if (this.settings.endOfTimeAlerts && window && !this.prayed.contains(window.event, this.timeZone)) {
        const escalation = window.nextEscalation(now);
        if (escalation !== undefined) wakeTimes.push(escalation);
      }
    }
    const resume = this.settings.alertsPausedUntil;
    if (resume !== null && resume > now) wakeTimes.push(resume);

    // The small margin guarantees the target time has passed when it fires.
    const delayMs = Math.max(Math.min(...wakeTimes) - now, 0) * 1000 + 50;
    this.wakeAtMs = Date.now() + delayMs;
    this.timer = setTimeout(() => this.refresh(), Math.min(delayMs, 2 ** 31 - 1));
  }

  /** The first instant of the day after `now`, by the clocks of this zone. */
  private startOfNextDay(now: Instant): Instant {
    return instantFromLocal(addDays(dayContaining(now, this.timeZone), 1), 0, 0, this.timeZone);
  }

  // MARK: - Alarms

  private ringDueAlarms(now: Instant): void {
    const schedule = this.schedule;
    if (!schedule) return;
    const due = schedule.dueAlarms(
      this.alarmCursor,
      now,
      new Set(this.settings.alarmPrayers),
      reminderLead(this.settings),
      AppEngine.lateAlarmGrace,
    );
    // More than one can only be due together after a pause such as sleep; the latest wins.
    const occurrence = due[due.length - 1];
    if (!occurrence || alarmEquals(occurrence, this.lastRung)) return;
    this.lastRung = occurrence;

    if (occurrence.kind === "reminder") this.remind(occurrence.event);
    else this.ring(occurrence.event);
  }

  private remind(event: PrayerEvent): void {
    const title = eventTitle(event, this.timeZone);
    this.platform.log(`Reminder: ${title} in ${this.settings.reminderMinutes} minutes`);
    this.platform.notify(
      "reminder",
      `${title} in ${this.settings.reminderMinutes} minutes`,
      isPrayer(event.prayer)
        ? `${title} is at ${this.clockFormat.time(event.time)}.`
        : `Fajr ends at ${this.clockFormat.time(event.time)}.`,
    );
    this.playChime();
  }

  /** A short sound for something that is not an alarm. At most one a second. */
  private playChime(): void {
    if (Date.now() - this.lastChime <= 1000) return;
    this.lastChime = Date.now();
    if (this.settings.alarmSound.kind !== "silent" && !this.diagnostics.mutesSound) {
      this.platform.playChime(this.settings.alarmVolume);
    }
  }

  private ring(event: PrayerEvent): void {
    this.stopAlarm();
    this.ringing = event;
    this.ringStarted = Date.now();

    const volume = this.diagnostics.mutesSound ? 0 : this.settings.alarmVolume;
    void this.platform.playSound(this.settings.alarmSound, volume, () => this.alarmSoundEnded(event)).then((isPlaying) => {
      this.platform.log(
        `Alarm: ${eventTitle(event, this.timeZone)} at ${this.clockFormat.time(event.time)}, sound ${isPlaying ? "playing" : "not playing"}`,
      );
      if (!isPlaying) this.alarmSoundEnded(event);
    });

    const text = this.alarmText(event);
    this.platform.notify("alarm", text.title, text.detail);
    this.updateMenuBarTitle(this.now);
    this.publish();
  }

  /** The wording shown for a ringing alarm, in the notification and on screen. */
  alarmText(event: PrayerEvent): { title: string; detail: string } {
    const time = this.clockFormat.time(event.time);
    return isPrayer(event.prayer)
      ? { title: `${eventTitle(event, this.timeZone)} · ${time}`, detail: `It's time to pray in ${currentPlace(this.settings).name}.` }
      : { title: `Sunrise · ${time}`, detail: "The time for Fajr has ended." };
  }

  private alarmSoundEnded(event: PrayerEvent): void {
    const remaining = Math.max(0, AppEngine.minimumAlarmDisplay - (Date.now() - this.ringStarted) / 1000);
    if (this.dismissal) clearTimeout(this.dismissal);
    this.dismissal = setTimeout(() => {
      if (this.ringing && this.ringing.prayer === event.prayer && this.ringing.time === event.time) this.stopAlarm();
    }, remaining * 1000);
  }

  stopAlarm(): void {
    if (this.dismissal) clearTimeout(this.dismissal);
    this.dismissal = null;
    this.platform.stopSound();
    if (!this.ringing) return;
    this.ringing = null;
    this.platform.clearAlarmNotification();
    this.updateMenuBarTitle(this.now);
    this.publish();
  }

  /** Rings the alarm now, exactly as it will at a prayer time, so the user can hear it. */
  testAlarm(): void {
    const now = this.now;
    const prayer = this.schedule?.events.find((event) => event.time > now && isPrayer(event.prayer))?.prayer ?? "dhuhr";
    this.ring({ prayer, time: now });
  }

  toggleAlarm(prayer: Prayer): void {
    const enabled = new Set(this.settings.alarmPrayers);
    if (enabled.has(prayer)) enabled.delete(prayer);
    else enabled.add(prayer);
    this.setSettings({ ...this.settings, alarmPrayers: [...enabled] });
  }

  // MARK: - End of time

  private updateWarning(now: Instant): void {
    const updated = PrayerWarning.current(this.schedule, this.settings, this.prayed, now, this.timeZone);
    if (updated === null && this.warning === null) return;
    if (updated && this.warning && updated.equals(this.warning)) return;

    // A step up is worth a sound; easing off is not. Another prayer's warning starts again from
    // calm, so its first stage sounds too. Not over the adhan, which is already sounding. The same
    // prayer on the same day counts as the same warning even if its times have been worked out
    // afresh and moved a little, as after a change of place.
    const dayOf = (warning: PrayerWarning | null) =>
      warning ? dayKey(dayContaining(warning.window.event.time, this.timeZone)) : null;
    const isSamePrayer =
      this.warning?.window.event.prayer === updated?.window.event.prayer && dayOf(this.warning) === dayOf(updated);
    const previous = isSamePrayer ? (this.warning?.urgency ?? 0) : 0;
    if (updated && updated.urgency > previous) {
      this.platform.log(`Warning: ${updated.title(this.timeZone)}, stage ${updated.urgency}`);
      if (this.ringing === null) this.playChime();
    }
    this.warning = updated;
  }

  setPrayed(isPrayed: boolean, event: PrayerEvent): void {
    let log = this.prayed.setting(isPrayed, event, this.timeZone);
    log = log.pruning(addDays(dayContaining(this.now, this.timeZone), -2));
    this.prayed = log;
    if (!this.diagnostics.isActive) void this.platform.save("prayed", log.toJSON());
    this.refresh();
  }

  /** Keeps the end-of-time alerts quiet for a while. They come back by themselves. */
  pauseAlerts(length: PauseLength): void {
    this.setSettings({ ...this.settings, alertsPausedUntil: pauseEnd(length, this.now, this.schedule) });
  }

  resumeAlerts(): void {
    this.setSettings({ ...this.settings, alertsPausedUntil: null });
  }

  // MARK: - Tray tooltip

  private updateMenuBarTitle(now: Instant): void {
    const zone = this.timeZone;
    let title: string;
    const next = this.schedule?.next(now);
    if (this.ringing) {
      title = `${eventTitle(this.ringing, zone)} now`;
    } else if (this.warning && this.settings.menuBarStyle !== "iconOnly") {
      title = this.warning.menuBarTitle(now, zone);
    } else if (next) {
      const name = eventTitle(next, zone);
      switch (this.settings.menuBarStyle) {
        case "nextPrayer":
          title = `${name} ${this.clockFormat.time(next.time)}`;
          break;
        case "countdown":
          title = `${name} in ${Countdown.coarse(next.time - now)}`;
          break;
        case "iconOnly":
          title = "";
          break;
      }
    } else {
      title = "";
    }
    this.menuBarTitle = title;
  }
}
