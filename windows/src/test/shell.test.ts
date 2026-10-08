import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseDiagnostics } from "../platform/diagnostics";
import { BROWSER_ARGS } from "../platform/runtime";

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

describe("the shell's configuration", () => {
  it("makes the engine window with the same browser arguments as every window made from script", () => {
    // WebView2 refuses a window whose arguments differ from the first one's.
    const config = JSON.parse(read("src-tauri/tauri.conf.json"));
    const engine = config.app.windows.find((window: { label: string }) => window.label === "engine");
    expect(engine.additionalBrowserArgs).toBe(BROWSER_ARGS);
  });

  it("lets every window act on the things the code asks of the shell", () => {
    const capability = JSON.parse(read("src-tauri/capabilities/default.json")).permissions
      .map((entry: string | { identifier: string }) => (typeof entry === "string" ? entry : entry.identifier));
    for (const needed of [
      "core:tray:default",
      "core:webview:allow-create-webview-window",
      "core:window:allow-set-fullscreen",
      "core:window:allow-destroy",
      "global-shortcut:allow-register",
      "global-shortcut:allow-unregister",
      "autostart:allow-enable",
      "dialog:allow-open",
      "notification:default",
      "fs:allow-write-text-file",
    ]) {
      expect(capability, needed).toContain(needed);
    }
  });

  it("builds the Windows installer and the Linux packages", () => {
    expect(JSON.parse(read("src-tauri/tauri.conf.json")).bundle.targets).toEqual(["nsis", "deb", "appimage"]);
  });

  it("lists the Linux dependencies and a PNG icon", () => {
    const bundle = JSON.parse(read("src-tauri/tauri.conf.json")).bundle;
    expect(bundle.linux.deb.depends).toEqual([
      "libwebkit2gtk-4.1-0",
      "gstreamer1.0-plugins-good",
      "gstreamer1.0-libav",
      "geoclue-2.0",
    ]);
    expect(bundle.icon).toContain("icons/icon.png");
  });
});

describe("diagnostics", () => {
  const at = Date.parse("2026-10-04T13:00:00Z");

  it("is a normal run when nothing is set", () => {
    expect(parseDiagnostics({}, at)).toEqual({ clockOffset: 0, mutesSound: false, timeZone: null, isActive: false });
  });

  it("starts the clock at the given instant", () => {
    const diagnostics = parseDiagnostics({ fakeNow: "2026-10-04T18:15:50+05:00" }, at);
    // 18:15:50+05:00 is 13:15:50Z, so the clock starts 15 minutes 50 seconds ahead.
    expect(diagnostics.clockOffset).toBe(950);
    expect(diagnostics.isActive).toBe(true);
  });

  it("ignores a time it cannot read", () => {
    expect(parseDiagnostics({ fakeNow: "tomorrow" }, at).isActive).toBe(false);
  });

  it("mutes and overrides the zone", () => {
    const diagnostics = parseDiagnostics({ mute: true, timeZone: "Asia/Karachi" }, at);
    expect(diagnostics).toMatchObject({ mutesSound: true, timeZone: "Asia/Karachi", isActive: true });
  });
});
