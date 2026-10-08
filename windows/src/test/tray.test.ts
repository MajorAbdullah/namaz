import { beforeEach, describe, expect, it, vi } from "vitest";
import { isLinux } from "../platform/os";
import { Tray, buildMenuItems } from "../shell/tray";

const mocks = vi.hoisted(() => ({
  linux: true,
  setText: vi.fn(() => Promise.resolve()),
  get: vi.fn(),
  setTooltip: vi.fn(() => Promise.resolve()),
  setIcon: vi.fn(() => Promise.resolve()),
}));

vi.mock("../platform/runtime", () => ({ isTauri: true }));
vi.mock("../platform/os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../platform/os")>();
  return { ...actual, isLinux: (ua?: string) => (ua === undefined ? mocks.linux : actual.isLinux(ua)) };
});
vi.mock("@tauri-apps/api/menu", () => ({ Menu: { new: vi.fn(async () => ({ get: mocks.get })) } }));
vi.mock("@tauri-apps/api/tray", () => ({
  TrayIcon: { new: vi.fn(async () => ({ setTooltip: mocks.setTooltip, setIcon: mocks.setIcon })) },
}));
vi.mock("@tauri-apps/api/app", () => ({ defaultWindowIcon: vi.fn(async () => null) }));
vi.mock("@tauri-apps/api/image", () => ({ Image: { new: vi.fn() } }));

const noop = () => {};
const actions = { togglePopover: noop, openSettings: noop, toggleWidget: noop, quit: noop };
const ids = (linux: boolean) => buildMenuItems(linux, actions, "Asr in 5m", noop).map((e) => ("id" in e ? e.id : "-"));

describe("the tray menu", () => {
  it("is unchanged off Linux", () => {
    expect(ids(false)).toEqual(["settings", "widget", "-", "quit"]);
  });

  it("starts with the popover and a disabled status line on Linux", () => {
    const items = buildMenuItems(true, actions, "Asr in 5m", noop);
    expect(ids(true).slice(0, 3)).toEqual(["show", "status", "-"]);
    expect(items[1]).toMatchObject({ text: "Asr in 5m", enabled: false });
  });

  it("recognises Linux but not Android", () => {
    expect(isLinux("Mozilla/5.0 (X11; Linux x86_64)")).toBe(true);
    expect(isLinux("Mozilla/5.0 (Linux; Android 14)")).toBe(false);
    expect(isLinux("Mozilla/5.0 (Windows NT 10.0)")).toBe(false);
  });
});

describe("the tray status line", () => {
  const actions = { togglePopover: () => {}, openSettings: () => {}, toggleWidget: () => {}, quit: () => {} };
  const started = async (linux: boolean) => {
    mocks.linux = linux;
    const tray = new Tray();
    await tray.start(actions, () => false);
    return tray;
  };

  beforeEach(() => {
    mocks.setText.mockClear();
    mocks.setTooltip.mockClear();
    mocks.get.mockReset();
    mocks.get.mockImplementation(async () => ({ setText: mocks.setText }));
  });

  it("shows the next prayer on Linux", async () => {
    const tray = await started(true);
    await tray.update("Maghrib in 1h 33m", false);
    expect(mocks.get).toHaveBeenCalledWith("status");
    expect(mocks.setText).toHaveBeenCalledWith("Maghrib in 1h 33m");
  });

  it("falls back to the name when there is no title", async () => {
    const tray = await started(true);
    await tray.update("Maghrib in 1h 33m", false);
    mocks.setText.mockClear();
    await tray.update("", false);
    expect(mocks.setText).toHaveBeenCalledWith("Namaz");
  });

  it("does not repeat an unchanged title", async () => {
    const tray = await started(true);
    await tray.update("Maghrib in 1h 33m", false);
    await tray.update("Maghrib in 1h 33m", false);
    expect(mocks.setText).toHaveBeenCalledTimes(1);
  });

  it("leaves the menu alone off Linux", async () => {
    const tray = await started(false);
    await tray.update("Maghrib in 1h 33m", false);
    expect(mocks.get).not.toHaveBeenCalled();
    expect(mocks.setText).not.toHaveBeenCalled();
    expect(mocks.setTooltip).toHaveBeenCalledWith("Namaz · Maghrib in 1h 33m");
  });
});
