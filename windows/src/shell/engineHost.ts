import { AppEngine, type Platform } from "../app";
import { Urgency } from "../core";
import { AlarmPlayer } from "../platform/audio";
import { onCommand, onEvent, onStateRequest, publishState } from "../platform/bus";
import { readDiagnostics } from "../platform/diagnostics";
import { locate } from "../platform/location";
import { notify } from "../platform/notifications";
import { isTauri } from "../platform/runtime";
import { loadJSON, saveJSON } from "../platform/storage";
import { Tray } from "./tray";
import { coverWanted, WindowManager } from "./windows";

async function quit(): Promise<void> {
  if (!isTauri) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("quit_app");
}

/**
 * The one hidden window that runs the app: it owns the engine, the sound and the timers, and tells
 * the other windows what to draw. Everything else is a view of what this publishes.
 */
export async function runEngine(): Promise<void> {
  const diagnostics = await readDiagnostics();
  const audio = new AlarmPlayer();

  // eslint-disable-next-line prefer-const
  let engine: AppEngine;
  const platform: Platform = {
    load: (name) => loadJSON(name),
    save: (name, value) => saveJSON(name, value),
    playSound: (sound, volume, onEnd) => audio.play(sound, volume, onEnd),
    stopSound: () => audio.stop(),
    playChime: (volume) => audio.chime(volume),
    notify: (_kind, title, body) => void notify(title, body),
    clearAlarmNotification: () => {},
    requestLocation: () => void locate().then((place) => place && engine.setDetectedPlace(place)),
    log: (message) => console.info(`namaz: ${message}`),
  };
  engine = new AppEngine(platform, diagnostics);

  const windows = new WindowManager(() => void quit());
  const tray = new Tray();

  engine.subscribe((snapshot) => {
    void publishState(snapshot);
    windows.sync(snapshot, coverWanted(snapshot, engine.warning?.urgency ?? Urgency.calm));
    void tray.update(snapshot.menuBarTitle, snapshot.ringing !== null);
  });

  await onCommand((command) => engine.dispatch(command));
  await onStateRequest(() => void publishState(engine.snapshot()));
  await onEvent("open-settings", () => void windows.openSettings());

  if (isTauri) {
    const { listen } = await import("@tauri-apps/api/event");
    // A native timer ticks about once a second: a hidden window's own timers can be held back.
    await listen("beat", () => {
      engine.beat();
      windows.beat();
    });
    // Opening Namaz again while it is running shows its settings, as on the Mac.
    await listen("second-instance", () => void windows.openSettings());
  }

  await tray.start(
    {
      togglePopover: (anchor) => void windows.togglePopover(anchor),
      openSettings: () => void windows.openSettings(),
      toggleWidget: () => engine.dispatch({ type: "patchSettings", patch: { showsWidget: !engine.settings.showsWidget } }),
      quit: () => void quit(),
    },
    () => engine.settings.showsWidget,
  );
  await engine.start();
}
