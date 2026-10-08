import { isTauri } from "./runtime";

/**
 * True on desktop Linux. Its tray (libappindicator) delivers no click events and shows no
 * tooltips, so the tray there is a menu that carries the status itself.
 */
export function isLinux(userAgent: string = typeof navigator === "undefined" ? "" : navigator.userAgent): boolean {
  return userAgent.includes("Linux") && !userAgent.includes("Android");
}

/** The kind of desktop session the shell runs in, as `session_kind` in the Rust shell reads it. */
export type SessionKind = "wayland" | "x11" | "other";

let session: Promise<SessionKind> | null = null;

/**
 * Asked once and kept: the session cannot change while the app runs. Wayland ignores moving
 * windows, keeping them on top and global shortcuts, so callers skip or back those up there.
 * Outside the shell, or if the shell cannot say, the answer is "other", which changes nothing.
 */
export function sessionKind(): Promise<SessionKind> {
  session ??= (async (): Promise<SessionKind> => {
    try {
      if (!isTauri) return "other";
      const { invoke } = await import("@tauri-apps/api/core");
      const kind = await invoke<string>("session_kind");
      return kind === "wayland" || kind === "x11" ? kind : "other";
    } catch {
      return "other";
    }
  })();
  return session;
}

/** Wayland places windows itself and ignores where an app asks to put them. */
export function shouldPosition(kind: SessionKind): boolean {
  return kind !== "wayland";
}

/**
 * On Wayland a global shortcut never arrives, so the cover also shows its Quit button there, which
 * otherwise appears only when the shortcut could not be reserved.
 */
export function coverOffersQuit(kind: SessionKind, shortcutReserved: boolean): boolean {
  return !shortcutReserved || kind === "wayland";
}

/**
 * Ctrl+Alt+Q pressed inside the cover, which has the keyboard, does what the global shortcut does.
 * Ctrl+Alt is AltGr on many layouts, so the Q key can type another character; its physical key is
 * still KeyQ, which is what the global shortcut matches too.
 */
export function isCoverQuitKey(event: { key: string; code?: string; ctrlKey: boolean; altKey: boolean; metaKey?: boolean }): boolean {
  const isQ = event.code === "KeyQ" || event.key.toLowerCase() === "q";
  return (event.ctrlKey || event.metaKey === true) && event.altKey && isQ;
}
