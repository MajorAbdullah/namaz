import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { type Command, ClockFormat, type Snapshot, currentPlace } from "../app";
import { PrayedLog, type PauseLength, PrayerEvent, Urgency } from "../core";
import { PrayerWarning } from "../app";
import { onEvent, publishEvent, sendCommand } from "../platform/bus";
import { importCustomSound, importedSoundName } from "../platform/audio";
import { isCoverQuitKey } from "../platform/os";
import { isTauri } from "../platform/runtime";
import { currentWindow, observeSize, dragIsland, isDragGesture, placeAbove, placeIsland, placeTopCenter, rememberIslandPosition, placeWidget, rememberWidgetPosition, setWindowSize } from "../shell/windowing";
import { AlarmBanner } from "./Banner";
import { PrayerCard, cardLayout } from "./Card";
import { TakeoverContent } from "./Cover";
import { ISLAND, IslandContent, islandSize } from "./Island";
import { PopoverContent } from "./Popover";
import { type SettingsActions, SettingsContent, type SettingsTab } from "./Settings";
import { scheduleFor, useCardContent, useNow, useSnapshot } from "./hooks";

const send = (command: Command) => void sendCommand(command);

/** Starts a window's content from nothing, showing nothing until the engine has spoken. */
function useReady(): Snapshot | null {
  return useSnapshot();
}

export async function quitApp(): Promise<void> {
  if (!isTauri) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("quit_app");
}

// ---- Island ---------------------------------------------------------------------------------

export function IslandWindow() {
  const snapshot = useReady();
  const now = useNow(snapshot);
  const content = useCardContent(snapshot, now);
  const [hovering, setHovering] = useState(false);
  const [peeking, setPeeking] = useState(false);
  const [open, setOpen] = useState(false);
  const previousUrgency = useRef<Urgency>(Urgency.calm);
  const shrink = useRef<ReturnType<typeof setTimeout>>();
  const pressedAt = useRef<{ x: number; y: number } | null>(null);

  const ringing = content?.headline.kind === "ringing";
  const urgency = content?.urgency ?? Urgency.calm;

  // A warning that begins or grows more urgent opens the island for a moment, so the change of
  // colour is not missed.
  useEffect(() => {
    if (urgency > previousUrgency.current) {
      setPeeking(true);
      const stop = setTimeout(() => setPeeking(false), 6000);
      previousUrgency.current = urgency;
      return () => clearTimeout(stop);
    }
    previousUrgency.current = urgency;
  }, [urgency]);

  const wantOpen = hovering || peeking || ringing;
  useEffect(() => {
    if (shrink.current) clearTimeout(shrink.current);
    if (wantOpen) {
      // Make room first, then let the island grow into it.
      const size = islandSize(true, ringing);
      void placeIsland(size.width, size.height, ISLAND.gap)
        .catch(() => {})
        .finally(() => setOpen(true));
    } else if (open) {
      setOpen(false);
      // Keep the room until the island has finished closing, then take it away so the window is
      // not left covering what is beneath it.
      shrink.current = setTimeout(() => {
        const size = islandSize(false, false);
        void placeIsland(size.width, size.height, ISLAND.gap);
      }, 450);
    } else {
      const size = islandSize(false, false);
      void placeIsland(size.width, size.height, ISLAND.gap);
    }
    return () => shrink.current && clearTimeout(shrink.current);
  }, [wantOpen, ringing]);

  useEffect(() => {
    let cancelled = false;
    let stop = () => {};
    void rememberIslandPosition()
      .then((unlisten) => (cancelled ? unlisten() : (stop = unlisten)))
      .catch(() => {});
    return () => {
      cancelled = true;
      stop();
    };
  }, []);
  if (!content) return null;
  return (
    <div class="window-fill" onMouseEnter={() => setHovering(true)} onMouseLeave={() => setHovering(false)} onContextMenu={(event) => event.preventDefault()}
      // Linux only (dragIsland does nothing elsewhere): the island can be moved, except by its buttons.
      onMouseDown={(event) => {
        pressedAt.current = event.button === 0 && !(event.target as Element).closest("button") ? { x: event.screenX, y: event.screenY } : null;
      }}
      onMouseMove={(event) => {
        // Only a press that moves is a drag, so a click on the island stays a click.
        const from = pressedAt.current;
        if (!from || (event.buttons & 1) === 0) return void (pressedAt.current = null);
        if (isDragGesture(from, { x: event.screenX, y: event.screenY })) {
          pressedAt.current = null;
          void dragIsland();
        }
      }}
      onMouseUp={() => (pressedAt.current = null)}
    >
      <IslandContent
        content={content}
        expanded={open}
        onPrayed={(event) => send({ type: "setPrayed", prayed: true, event })}
        onStop={() => send({ type: "stopAlarm" })}
      />
    </div>
  );
}

// ---- Desktop card ---------------------------------------------------------------------------

function useFitWindow(placed: "widget" | "popover" | "banner", onPlace?: (width: number, height: number) => Promise<void>) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    let first = true;
    return observeSize(ref.current, (width, height) => {
      if (width === 0 || height === 0) return;
      const place = onPlace ?? (async (w: number, h: number) => setWindowSize(w, h));
      if (placed === "widget" && first) void placeWidget(width, height);
      else void place(width, height);
      first = false;
    });
  }, [placed]);
  return ref;
}

export function WidgetWindow() {
  const snapshot = useReady();
  const now = useNow(snapshot);
  const content = useCardContent(snapshot, now);
  const ref = useFitWindow("widget", async (width, height) => {
    // Resizes the window to the card, holding its top-left corner still.
    await setWindowSize(width, height);
  });
  useEffect(() => {
    let stop: (() => void) | undefined;
    void rememberWidgetPosition().then((unlisten) => (stop = unlisten));
    return () => stop?.();
  }, []);
  if (!snapshot || !content) return null;
  return (
    <div ref={ref} class="fit" onContextMenu={(event) => event.preventDefault()}>
      <PrayerCard
        content={content}
        layout={cardLayout(snapshot.settings.widgetLayout)}
        onToggleAlarm={(prayer) => send({ type: "toggleAlarm", prayer })}
        onSetPrayed={(event, prayed) => send({ type: "setPrayed", prayed, event })}
        onStop={() => send({ type: "stopAlarm" })}
        data-tauri-drag-region
      />
    </div>
  );
}

// ---- Banner ---------------------------------------------------------------------------------

export function BannerWindow() {
  const snapshot = useReady();
  const ref = useFitWindow("banner", async (width, height) => {
    await placeTopCenter(width, height, 12);
  });
  if (!snapshot?.ringing) return null;
  const event = snapshot.ringing;
  const timeZone = snapshot.timeZone;
  const format = new ClockFormat(snapshot.settings.clockStyle, timeZone);
  const place = currentPlace(snapshot.settings).name;
  const prayer = event.prayer;
  const isPrayer = prayer !== "sunrise";
  const title = isPrayer ? `${titleOf(event, timeZone)} · ${format.time(event.time)}` : `Sunrise · ${format.time(event.time)}`;
  const detail = isPrayer ? `It's time to pray in ${place}.` : "The time for Fajr has ended.";
  return (
    <div ref={ref} class="fit">
      <AlarmBanner title={title} detail={detail} period={prayer} onStop={() => send({ type: "stopAlarm" })} />
    </div>
  );
}

import { eventTitle } from "../core";
const titleOf = eventTitle;

// ---- Popover --------------------------------------------------------------------------------

export function PopoverWindow() {
  const snapshot = useReady();
  const now = useNow(snapshot);
  const content = useCardContent(snapshot, now);
  const anchor = useRef<{ x: number; y: number } | null>(null);
  const shown = useRef(false);
  const size = useRef({ width: 320, height: 420 });

  const place = async () => {
    if (!anchor.current) return;
    await placeAbove(anchor.current, size.current.width, size.current.height);
    const window = await currentWindow();
    if (!shown.current) {
      shown.current = true;
      await window?.show();
      await window?.setFocus();
    }
  };

  useEffect(() => {
    let cancelled = false;
    const stops: (() => void)[] = [];
    void onEvent<{ x: number; y: number }>("popover-open", (point) => {
      anchor.current = point;
      shown.current = false;
      void place();
    }).then((stop) => (cancelled ? stop() : stops.push(stop)));
    // Like a menu: it goes away when the user clicks elsewhere.
    void currentWindow().then(async (window) => {
      const stop = await window?.onFocusChanged(({ payload: focused }) => {
        if (focused) return;
        void publishEvent("popover-hidden");
        shown.current = false;
        void window.hide();
      });
      if (stop) cancelled ? stop() : stops.push(stop);
    });
    return () => {
      cancelled = true;
      stops.forEach((stop) => stop());
    };
  }, []);

  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    return observeSize(ref.current, (width, height) => {
      if (width === 0 || height === 0) return;
      size.current = { width, height };
      void place();
    });
  }, [snapshot === null]);

  const format = useMemo(() => (snapshot ? new ClockFormat(snapshot.settings.clockStyle, snapshot.timeZone) : null), [snapshot?.settings.clockStyle, snapshot?.timeZone]);
  if (!snapshot || !content || !format) return null;
  const until = snapshot.settings.alertsPausedUntil;
  const pauseEnd = until !== null && until > now ? until : null;
  const closeThen = async (action: () => void) => {
    action();
    await (await currentWindow())?.hide();
  };
  return (
    <div ref={ref} class="fit" onContextMenu={(event) => event.preventDefault()}>
      <PopoverContent
        card={
          <PrayerCard
            content={content}
            layout="list"
            onToggleAlarm={(prayer) => send({ type: "toggleAlarm", prayer })}
            onSetPrayed={(event, prayed) => send({ type: "setPrayed", prayed, event })}
            onStop={() => send({ type: "stopAlarm" })}
          />
        }
        settings={snapshot.settings}
        pauseEnd={pauseEnd}
        now={now}
        format={format}
        onPause={(length: PauseLength) => send({ type: "pauseAlerts", length })}
        onResume={() => send({ type: "resumeAlerts" })}
        onSettings={() => void closeThen(() => void publishEvent("open-settings"))}
        onToggleWidget={() => send({ type: "patchSettings", patch: { showsWidget: !snapshot.settings.showsWidget } })}
        onQuit={() => void quitApp()}
      />
    </div>
  );
}

// ---- Cover ----------------------------------------------------------------------------------

export function CoverWindow() {
  const snapshot = useReady();
  const now = useNow(snapshot);
  const [offersQuit, setOffersQuit] = useState(false);
  const [size, setSize] = useState({ width: innerWidth, height: innerHeight });

  useEffect(() => {
    const onResize = () => setSize({ width: innerWidth, height: innerHeight });
    addEventListener("resize", onResize);
    let stop: (() => void) | undefined;
    void onEvent<{ offersQuit: boolean }>("cover-options", (options) => setOffersQuit(options.offersQuit)).then((unlisten) => {
      stop = unlisten;
      void publishEvent("request-cover");
    });
    // Alt+F4 does not close the cover; only the end of the time, Prayed, or quitting does.
    let stopClose: (() => void) | undefined;
    void currentWindow().then(async (window) => {
      stopClose = await window?.onCloseRequested((event) => event.preventDefault());
    });
    const hideCursor = () => {};
    hideCursor();
    // The cover has the keyboard while it is up, so it answers Ctrl+Alt+Q itself. Where the global
    // shortcut works this is a second route to the same quit; on Wayland it is the only one.
    const onKey = (event: KeyboardEvent) => {
      if (!isCoverQuitKey(event)) return;
      event.preventDefault();
      void quitApp();
    };
    addEventListener("keydown", onKey);
    return () => {
      removeEventListener("keydown", onKey);
      removeEventListener("resize", onResize);
      stop?.();
      stopClose?.();
    };
  }, []);

  const warning = useMemo(() => {
    if (!snapshot) return null;
    return PrayerWarning.current(
      scheduleFor(snapshot.settings, snapshot.timeZone, now),
      snapshot.settings,
      new PrayedLog(snapshot.prayed),
      now,
      snapshot.timeZone,
    );
  }, [snapshot, now]);

  if (!snapshot || !warning) return <div class="cover-blank" />;
  return (
    <TakeoverContent
      detail={warning.detail(now, snapshot.timeZone)}
      urgency={warning.urgency}
      period={warning.window.event.prayer}
      sun={warning.sunHeight(now)}
      width={size.width}
      height={size.height}
      onPrayed={() => send({ type: "setPrayed", prayed: true, event: warning.window.event })}
      onQuit={offersQuit ? () => void quitApp() : undefined}
    />
  );
}

// ---- Settings -------------------------------------------------------------------------------

export function SettingsWindow() {
  const snapshot = useReady();
  const now = useNow(snapshot);
  const initial = new URLSearchParams(location.search).get("tab") as SettingsTab | null;
  const [tab, setTab] = useState<SettingsTab>(initial ?? "general");

  const actions: SettingsActions = useMemo(
    () => ({
      patch: (patch) => send({ type: "patchSettings", patch }),
      pause: (length) => send({ type: "pauseAlerts", length }),
      resume: () => send({ type: "resumeAlerts" }),
      testAlarm: () => send({ type: "testAlarm" }),
      stopAlarm: () => send({ type: "stopAlarm" }),
      locate: () => send({ type: "locate" }),
      chooseSound: importCustomSound,
      importedSoundName,
      launchAtLogin: {
        get: async () => {
          if (!isTauri) return false;
          const { isEnabled } = await import("@tauri-apps/plugin-autostart");
          return isEnabled();
        },
        set: async (on) => {
          if (!isTauri) return;
          const { enable, disable } = await import("@tauri-apps/plugin-autostart");
          await (on ? enable() : disable());
        },
      },
    }),
    [],
  );

  useEffect(() => {
    document.body.classList.add("opaque");
  }, []);
  if (!snapshot) return null;
  const format = new ClockFormat(snapshot.settings.clockStyle, snapshot.timeZone);
  return <SettingsContent tab={tab} onTab={setTab} snapshot={snapshot} now={now} format={format} actions={actions} />;
}

export type { PrayerEvent };
