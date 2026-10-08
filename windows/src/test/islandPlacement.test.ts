import { describe, expect, it } from "vitest";
import { isAppMove, isDragGesture, islandTopLeft } from "../shell/windowing";

const primary = { x: 0, y: 0, width: 1000, height: 800 };

describe("where the island goes", () => {
  it("sits under the saved point when it is still on a screen", () => {
    expect(islandTopLeft({ x: 300, y: 120 }, 200, 10, primary, true)).toEqual({ x: 200, y: 120 });
  });

  it("falls back to top centre when the saved point is off every screen", () => {
    expect(islandTopLeft({ x: 5000, y: 120 }, 200, 10, primary, false)).toEqual({ x: 400, y: 10 });
  });

  it("uses top centre when nothing is saved", () => {
    expect(islandTopLeft(null, 200, 10, { ...primary, x: 100, y: 30 }, true)).toEqual({ x: 500, y: 40 });
  });
});

describe("which island moves are the user's", () => {
  it("ignores the echo of the app's own placing", () => {
    expect(isAppMove({ x: 401, y: 9 }, { x: 400, y: 10 })).toBe(true);
  });

  it("counts a move away from where the app put it", () => {
    expect(isAppMove({ x: 410, y: 10 }, { x: 400, y: 10 })).toBe(false);
    expect(isAppMove({ x: 400, y: 10 }, null)).toBe(false);
  });

  it("treats a press without movement as a click, not a drag", () => {
    expect(isDragGesture({ x: 5, y: 5 }, { x: 6, y: 6 })).toBe(false);
    expect(isDragGesture({ x: 5, y: 5 }, { x: 8, y: 5 })).toBe(true);
  });
});
