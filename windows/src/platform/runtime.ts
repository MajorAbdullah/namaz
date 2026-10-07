/** True inside the Tauri shell; false in a plain browser, as when the views are previewed by hand. */
export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** Which window this page is: the engine, the island, the cover and so on. */
export function windowKind(): string {
  return new URLSearchParams(location.search).get("w") ?? "engine";
}

/**
 * The browser arguments every window is made with. WebView2 shares one environment between the
 * windows of an app, and refuses a window whose arguments differ from the first one's, so the
 * engine window in tauri.conf.json and every window made from script must use this exact string
 * (a test keeps the two in step).
 */
export const BROWSER_ARGS =
  "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --autoplay-policy=no-user-gesture-required --disable-background-timer-throttling --disable-renderer-backgrounding";
