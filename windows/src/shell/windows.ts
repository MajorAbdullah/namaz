import type { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import type { Snapshot } from "../app";
import { Urgency } from "../core";
import { BROWSER_ARGS, isTauri } from "../platform/runtime";
import { onEvent, publishEvent } from "../platform/bus";
import { coverOffersQuit, sessionKind, shouldPosition } from "../platform/os";
import { monitorBounds } from "./windowing";

type Options = Record<string, unknown>;

/** What every window of the app is made with. */
const COMMON: Options = { additionalBrowserArgs: BROWSER_ARGS };

/** A borderless window that draws its own shape and never takes the keyboard from the user's work. */
const FLOATING: Options = {
  ...COMMON,
  decorations: false,
  transparent: true,
  shadow: false,
  skipTaskbar: true,
  resizable: false,
  maximizable: false,
  minimizable: false,
  focus: false,
  focusable: false,
};

async function existing(label: string): Promise<WebviewWindow | null> {
  const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
  return WebviewWindow.getByLabel(label);
}

/**
 * Makes the window if it is not there yet. If this version of Tauri does not know one of the
 * options, tries again without it rather than going without the window.
 */
async function ensure(label: string, options: Options): Promise<WebviewWindow> {
  const found = await existing(label);
  if (found) return found;
  const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
  const attempts: Options[] = [options];
  for (const optional of ["focusable", "shadow"]) {
    const { [optional]: _dropped, ...rest } = attempts[attempts.length - 1];
    attempts.push(rest);
  }
  let failure: unknown;
  for (const attempt of attempts) {
    try {
      const window = new WebviewWindow(label, attempt as ConstructorParameters<typeof WebviewWindow>[1]);
      await new Promise<void>((resolve, reject) => {
        void window.once("tauri://created", () => resolve());
        void window.once("tauri://error", (event) => reject(new Error(String(event.payload))));
      });
      return window;
    } catch (error) {
      failure = error;
    }
  }
  throw failure;
}

async function destroy(label: string): Promise<void> {
  const window = await existing(label);
  await window?.destroy().catch(() => {});
}

/**
 * Opens and closes the app's windows to match what the engine says should be showing: the island
 * or the card, the alarm banner, and the screen covers. The popover and Settings open on request.
 */
export class WindowManager {
  private state = { island: false, widget: false, banner: false };
  private busy: Promise<void> = Promise.resolve();
  private popoverHiddenAt = 0;
  private covers: CoverManager;

  constructor(private readonly quit: () => void) {
    this.covers = new CoverManager(quit);
    if (isTauri) {
      void onEvent("popover-hidden", () => {
        this.popoverHiddenAt = Date.now();
      });
    }
  }

  /** Brings the windows in line with the latest state. Runs one change at a time, in order. */
  sync(snapshot: Snapshot, covering: boolean): void {
    if (!isTauri) return;
    this.busy = this.busy
      .then(() => this.apply(snapshot, covering))
      .catch((error) => console.warn("namaz: window update failed", error));
  }

  private async apply(snapshot: Snapshot, covering: boolean): Promise<void> {
    const { settings, ringing } = snapshot;
    const islandWanted = settings.showsWidget && settings.widgetLayout === "island";
    const widgetWanted = settings.showsWidget && settings.widgetLayout !== "island";
    // When the island is showing, it opens with the alarm itself.
    const bannerWanted = ringing !== null && !islandWanted;

    if (islandWanted && !this.state.island) {
      await ensure("island", { ...FLOATING, url: "index.html?w=island", width: 224, height: 30, alwaysOnTop: true });
    } else if (!islandWanted && this.state.island) {
      await destroy("island");
    }
    this.state.island = islandWanted;

    if (widgetWanted) {
      const window = await ensure("widget", {
        ...FLOATING,
        url: "index.html?w=widget",
        width: 364,
        height: 300,
        alwaysOnTop: settings.widgetFloatsOnTop,
        alwaysOnBottom: !settings.widgetFloatsOnTop,
      });
      // Just beneath ordinary windows, like a widget lying on the desktop, or above them all.
      {
        await window.setAlwaysOnTop(settings.widgetFloatsOnTop).catch(() => {});
        await window.setAlwaysOnBottom(!settings.widgetFloatsOnTop).catch(() => {});
      }
    } else if (this.state.widget) {
      await destroy("widget");
    }
    this.state.widget = widgetWanted;

    if (bannerWanted && !this.state.banner) {
      await ensure("banner", { ...FLOATING, url: "index.html?w=banner", width: 430, height: 90, alwaysOnTop: true });
    } else if (!bannerWanted && this.state.banner) {
      await destroy("banner");
    }
    this.state.banner = bannerWanted;

    await this.covers.set(covering);
  }

  /** Called about once a second, so the covers can follow a monitor being plugged in or out. */
  beat(): void {
    if (isTauri) void this.covers.beat();
  }

  async openSettings(tab?: string): Promise<void> {
    if (!isTauri) return;
    const window = await ensure("settings", {
      ...COMMON,
      url: `index.html?w=settings${tab ? `&tab=${tab}` : ""}`,
      title: "Namaz Settings",
      width: 580,
      height: 720,
      minWidth: 480,
      minHeight: 420,
      center: true,
      resizable: true,
      decorations: true,
    });
    await window.unminimize().catch(() => {});
    await window.show();
    await window.setFocus();
  }

  /** Opens the popover at `anchor` (a tray click, in physical pixels), or closes it if it is open. */
  async togglePopover(anchor: { x: number; y: number }): Promise<void> {
    if (!isTauri) return;
    const found = await existing("popover");
    // Clicking the tray icon takes focus from an open popover, which hides it; that same click
    // should close it, not open it again.
    if (found && ((await found.isVisible()) || Date.now() - this.popoverHiddenAt < 300)) {
      await found.hide();
      return;
    }
    await ensure("popover", {
      ...COMMON,
      url: "index.html?w=popover",
      width: 320,
      height: 420,
      visible: false,
      decorations: false,
      transparent: true,
      shadow: true,
      skipTaskbar: true,
      resizable: false,
      alwaysOnTop: true,
    });
    await publishEvent("popover-open", anchor);
  }
}

/** The screen cover: one window on each monitor, up while a prayer's time is nearly gone. */
class CoverManager {
  private covering = false;
  private count = 0;
  private offersQuit = false;
  private ticks = 0;
  private bounds = "";

  constructor(private readonly quit: () => void) {
    if (isTauri) {
      // A cover window that has just opened asks what to show.
      void onEvent("request-cover", () => void publishEvent("cover-options", { offersQuit: this.offersQuit }));
    }
  }

  async set(covering: boolean): Promise<void> {
    if (covering === this.covering) return;
    this.covering = covering;
    if (covering) {
      await this.reserveQuitKey();
      await this.show();
    } else {
      await this.hide();
    }
  }

  async beat(): Promise<void> {
    if (!this.covering || ++this.ticks % 5 !== 0) return;
    const bounds = JSON.stringify(await monitorBounds());
    if (bounds !== this.bounds) await this.show();
  }

  private async show(): Promise<void> {
    const monitors = await monitorBounds();
    this.bounds = JSON.stringify(monitors);
    const { PhysicalPosition, PhysicalSize } = await import("@tauri-apps/api/window");
    const kind = await sessionKind();
    for (let index = 0; index < monitors.length; index++) {
      const monitor = monitors[index];
      const window = await ensure(`cover-${index}`, {
        ...COMMON,
        url: "index.html?w=cover",
        x: monitor.x,
        y: monitor.y,
        width: 800,
        height: 600,
        decorations: false,
        skipTaskbar: true,
        resizable: false,
        alwaysOnTop: true,
        shadow: false,
        visible: false,
      });
      // Wayland ignores the position; full screen still puts the cover over a whole monitor.
      if (shouldPosition(kind)) await window.setPosition(new PhysicalPosition(monitor.x, monitor.y));
      await window.setSize(new PhysicalSize(monitor.width, monitor.height));
      await window.setFullscreen(true).catch(() => {});
      await window.show();
      await window.setAlwaysOnTop(true).catch(() => {});
      // Take the keyboard if the system lets us, so typing does not carry on unseen in the app
      // underneath. Nothing depends on this succeeding.
      if (index === 0) await window.setFocus().catch(() => {});
    }
    // Windows left over from a monitor that has gone.
    for (let index = monitors.length; index < this.count; index++) await destroy(`cover-${index}`);
    this.count = monitors.length;
    await publishEvent("cover-options", { offersQuit: this.offersQuit });
  }

  private async hide(): Promise<void> {
    await this.releaseQuitKey();
    for (let index = 0; index < Math.max(this.count, 1); index++) await destroy(`cover-${index}`);
    this.count = 0;
    this.bounds = "";
  }

  /**
   * Ctrl+Alt+Q for the whole system, held only while the screen is covered. The cover cannot count
   * on having keyboard focus: Windows may leave it with the app the user was typing in. A global
   * shortcut reaches Namaz whichever app is in front. It is the one way out of the cover other
   * than praying; if it cannot be reserved, the cover shows a Quit button instead.
   */
  private async reserveQuitKey(): Promise<void> {
    try {
      const { register } = await import("@tauri-apps/plugin-global-shortcut");
      await register("CommandOrControl+Alt+Q", (event) => {
        if (event.state === "Pressed") this.quit();
      });
      // Wayland accepts the shortcut but never delivers it, so the Quit button stays there too.
      this.offersQuit = coverOffersQuit(await sessionKind(), true);
    } catch (error) {
      console.warn("namaz: could not reserve Ctrl+Alt+Q while the screen is covered", error);
      this.offersQuit = true;
    }
  }

  private async releaseQuitKey(): Promise<void> {
    try {
      const { unregister } = await import("@tauri-apps/plugin-global-shortcut");
      await unregister("CommandOrControl+Alt+Q");
    } catch {
      // It was never reserved.
    }
    this.offersQuit = false;
  }
}

export function coverWanted(snapshot: Snapshot, warningUrgency: number): boolean {
  return snapshot.settings.endOfTimeCover && warningUrgency >= Urgency.ten;
}
