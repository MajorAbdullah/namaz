import { createContext } from "preact";
import { useContext, useEffect, useMemo, useState } from "preact/hooks";
import {
  type AppSettings,
  type CardContent,
  type Snapshot,
  currentPlace,
  makeCardContent,
} from "../app";
import {
  type Instant,
  PrayedLog,
  PrayerSchedule,
  dayContaining,
  dayKey,
} from "../core";
import { onState, requestState, sendCommand } from "../platform/bus";

/**
 * Lets a page draw from a snapshot it was handed instead of one that arrives from the engine, and
 * from a clock that stands still: used to save pictures of the views.
 */
export interface Fixed {
  snapshot: Snapshot;
  now: Instant;
}
export const FixedContext = createContext<Fixed | null>(null);

/** The engine's latest snapshot, or null until the first one arrives. */
export function useSnapshot(): Snapshot | null {
  const fixed = useContext(FixedContext);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  useEffect(() => {
    if (fixed) return;
    let stop: (() => void) | undefined;
    let cancelled = false;
    void onState((incoming) => {
      // Windows can see an old snapshot arrive after a newer one; keep the newer.
      setSnapshot((current) => (current && current.revision > incoming.revision ? current : incoming));
    }).then((unlisten) => {
      if (cancelled) unlisten();
      else {
        stop = unlisten;
        void requestState();
      }
    });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [fixed]);
  return fixed ? fixed.snapshot : snapshot;
}

/** The time the app acts on, redrawn every second. */
export function useNow(snapshot: Snapshot | null): Instant {
  const fixed = useContext(FixedContext);
  const offset = snapshot?.clockOffset ?? 0;
  const [now, setNow] = useState(() => Date.now() / 1000 + offset);
  useEffect(() => {
    if (fixed) return;
    const update = () => setNow(Date.now() / 1000 + offset);
    update();
    // Start on a whole second so the countdown ticks in step with the clock.
    let interval: ReturnType<typeof setInterval> | undefined;
    const start = setTimeout(() => {
      update();
      interval = setInterval(update, 1000);
    }, 1000 - (Date.now() % 1000));
    return () => {
      clearTimeout(start);
      if (interval) clearInterval(interval);
    };
  }, [offset, fixed]);
  return fixed ? fixed.now : now;
}

const scheduleCache = new Map<string, PrayerSchedule | null>();

/** Today's schedule for these settings. Worked out once a day and whenever the settings change. */
export function scheduleFor(settings: AppSettings, timeZone: string, now: Instant): PrayerSchedule | null {
  const place = currentPlace(settings);
  const key = [
    place.coordinates.latitude,
    place.coordinates.longitude,
    JSON.stringify(settings.calculation),
    timeZone,
    dayKey(dayContaining(now, timeZone)),
  ].join("|");
  if (!scheduleCache.has(key)) {
    if (scheduleCache.size > 8) scheduleCache.clear();
    scheduleCache.set(key, PrayerSchedule.make(now, place.coordinates, timeZone, settings.calculation));
  }
  return scheduleCache.get(key) ?? null;
}

/** What the card shows right now, for the snapshot. Null until there is one. */
export function useCardContent(snapshot: Snapshot | null, now: Instant): CardContent | null {
  return useMemo(() => {
    if (!snapshot) return null;
    return makeCardContent(
      scheduleFor(snapshot.settings, snapshot.timeZone, now),
      snapshot.settings,
      snapshot.ringing,
      new PrayedLog(snapshot.prayed),
      now,
      snapshot.timeZone,
      currentPlace(snapshot.settings).name,
    );
  }, [snapshot, now]);
}

export { sendCommand };
