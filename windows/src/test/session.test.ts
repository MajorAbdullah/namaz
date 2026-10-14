import { describe, expect, it } from "vitest";
import { coverOffersQuit, isCoverQuitKey, sessionKind, shouldPosition } from "../platform/os";

describe("the desktop session", () => {
  it("is 'other' outside the shell", async () => {
    expect(await sessionKind()).toBe("other");
  });

  it("places windows everywhere but Wayland", () => {
    expect(shouldPosition("other")).toBe(true);
    expect(shouldPosition("x11")).toBe(true);
    expect(shouldPosition("wayland")).toBe(false);
  });

  it("shows the cover's Quit button when the shortcut cannot reach the app", () => {
    expect(coverOffersQuit("other", true)).toBe(false);
    expect(coverOffersQuit("x11", true)).toBe(false);
    expect(coverOffersQuit("wayland", true)).toBe(true);
    expect(coverOffersQuit("other", false)).toBe(true);
  });

  it("quits the cover on Ctrl+Alt+Q only", () => {
    expect(isCoverQuitKey({ key: "q", ctrlKey: true, altKey: true })).toBe(true);
    expect(isCoverQuitKey({ key: "Q", ctrlKey: true, altKey: true })).toBe(true);
    expect(isCoverQuitKey({ key: "q", ctrlKey: true, altKey: false })).toBe(false);
    expect(isCoverQuitKey({ key: "q", ctrlKey: false, altKey: true })).toBe(false);
    expect(isCoverQuitKey({ key: "w", ctrlKey: true, altKey: true })).toBe(false);
  });

  // Ctrl+Alt is AltGr on many layouts, so the Q key can arrive as another character (German: "@").
  // The physical key is still KeyQ, which is what the global shortcut matches.
  it("quits the cover on Ctrl+Alt+Q whatever character the layout gives the Q key", () => {
    const altGrQ = { key: "@", code: "KeyQ", ctrlKey: true, altKey: true };
    expect(isCoverQuitKey(altGrQ)).toBe(true);
  });
});
