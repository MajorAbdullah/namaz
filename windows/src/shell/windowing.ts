import { isLinux, sessionKind, shouldPosition } from "../platform/os";
import { isTauri } from "../platform/runtime";

/**
 * The browser has no windows to move, so everything here quietly does nothing outside the shell.
 * Wayland ignores where a window is asked to go, so placing is skipped there and only sizing is done.
 */
async function api() {
  return import("@tauri-apps/api/window");
}

export async function currentWindow() {
  if (!isTauri) return null;
  return (await api()).getCurrentWindow();
}

export async function setWindowSize(width: number, height: number): Promise<void> {
  if (!isTauri) return;
  const { getCurrentWindow, LogicalSize } = await api();
  await getCurrentWindow().setSize(new LogicalSize(Math.ceil(width), Math.ceil(height)));
}

interface Area {
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
}

/** The part of a monitor not taken by the taskbar, in logical pixels. */
function area(monitor: {
  position: { x: number; y: number };
  size: { width: number; height: number };
  scaleFactor: number;
  workArea?: { position: { x: number; y: number }; size: { width: number; height: number } };
}): Area {
  const scale = monitor.scaleFactor;
  const box = monitor.workArea ?? { position: monitor.position, size: monitor.size };
  return {
    x: box.position.x / scale,
    y: box.position.y / scale,
    width: box.size.width / scale,
    height: box.size.height / scale,
    scale,
  };
}

export async function primaryArea(): Promise<Area | null> {
  if (!isTauri) return null;
  const { primaryMonitor } = await api();
  const monitor = await primaryMonitor();
  return monitor ? area(monitor) : null;
}

/** Every monitor's whole bounds, in physical pixels, for covering them. */
export async function monitorBounds(): Promise<{ x: number; y: number; width: number; height: number }[]> {
  if (!isTauri) return [];
  const { availableMonitors } = await api();
  return (await availableMonitors()).map((monitor) => ({
    x: monitor.position.x,
    y: monitor.position.y,
    width: monitor.size.width,
    height: monitor.size.height,
  }));
}

/** Puts this window at the top centre of the main screen, hanging `gap` below its top edge. */
export async function placeTopCenter(width: number, height: number, gap: number): Promise<void> {
  if (!isTauri) return;
  const { getCurrentWindow, LogicalPosition, LogicalSize } = await api();
  const bounds = await primaryArea();
  const window = getCurrentWindow();
  await window.setSize(new LogicalSize(Math.ceil(width), Math.ceil(height)));
  if (bounds && shouldPosition(await sessionKind())) await window.setPosition(new LogicalPosition(Math.round(bounds.x + (bounds.width - width) / 2), Math.round(bounds.y + gap)));
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Where the island's top-left goes: under the point the user dragged it to (horizontal centre and
 * top edge are saved, so a change of width keeps it centred there), or top centre when nothing
 * usable is saved. Pure so it can be tested without a window.
 */
export function islandTopLeft(
  savedCenter: { x: number; y: number } | null,
  width: number,
  gap: number,
  primary: Box,
  onScreen: boolean,
): { x: number; y: number } {
  if (savedCenter && onScreen) return { x: savedCenter.x - width / 2, y: savedCenter.y };
  return { x: primary.x + (primary.width - width) / 2, y: primary.y + gap };
}

/** Where the app last put the island itself, in physical pixels, and when the user last moved it. */
let islandTarget: { x: number; y: number } | null = null;
let islandDraggedAt = -Infinity;

/** How long after a user move the app leaves the island's position alone, so it does not jump mid-drag. */
export const ISLAND_SETTLE_MS = 500;

/**
 * Whether a reported move (physical pixels) is just the echo of the app's own setPosition. Saving
 * that would pin the fallback top-centre spot as if the user had chosen it.
 */
export function isAppMove(reported: { x: number; y: number }, target: { x: number; y: number } | null): boolean {
  return target !== null && Math.abs(reported.x - target.x) <= 2 && Math.abs(reported.y - target.y) <= 2;
}

/** Whether the pointer has moved far enough since the press to mean a drag rather than a click. */
export function isDragGesture(from: { x: number; y: number }, to: { x: number; y: number }): boolean {
  return Math.hypot(to.x - from.x, to.y - from.y) >= 3;
}

function readAnchor(): { x: number; y: number } | null {
  try {
    const saved = JSON.parse(localStorage.getItem("islandAnchor") ?? "null") as { x?: unknown; y?: unknown } | null;
    if (saved && typeof saved.x === "number" && typeof saved.y === "number" && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
      return { x: saved.x, y: saved.y };
    }
  } catch {
    // An unreadable saved position is the same as none.
  }
  return null;
}

/** Starts a drag of the island by the pointer. Linux only; a failure just leaves the island where it is. */
export async function dragIsland(): Promise<void> {
  if (!isTauri || !isLinux()) return;
  try {
    await (await api()).getCurrentWindow().startDragging();
  } catch {
    // Nothing to do: the island stays put.
  }
}

/**
 * Like placeTopCenter, but on Linux the island stays where the user dragged it, since the desktop
 * there lets windows be moved freely. Other systems keep the fixed top-centre spot. The anchor is
 * kept in logical pixels, which assumes the screens share one scale factor.
 */
export async function placeIsland(width: number, height: number, gap: number): Promise<void> {
  if (!isTauri) return;
  if (!isLinux()) return placeTopCenter(width, height, gap);
  const { getCurrentWindow, LogicalPosition, LogicalSize, availableMonitors } = await api();
  const window = getCurrentWindow();
  // Mid-drag the window is the user's; resizing alone keeps it under the pointer.
  const dragging = Date.now() - islandDraggedAt < ISLAND_SETTLE_MS;
  const bounds = dragging ? null : await primaryArea();
  const saved = readAnchor();
  const onScreen = saved && bounds ? await isReachable(saved.x - width / 2, saved.y, width, height, availableMonitors) : false;
  const target = bounds ? islandTopLeft(saved, width, gap, bounds, onScreen) : null;
  const position = bounds && target && shouldPosition(await sessionKind()) ? { x: Math.round(target.x), y: Math.round(target.y) } : null;
  // Marked before resizing too, since a resize can also be reported as a move.
  if (bounds && position) islandTarget = { x: Math.round(position.x * bounds.scale), y: Math.round(position.y * bounds.scale) };
  await window.setSize(new LogicalSize(Math.ceil(width), Math.ceil(height)));
  if (position) await window.setPosition(new LogicalPosition(position.x, position.y));
}

/** Remembers where the user drags the island (its horizontal centre and top edge). Linux only. */
export async function rememberIslandPosition(): Promise<() => void> {
  if (!isTauri || !isLinux()) return () => {};
  const { getCurrentWindow } = await api();
  const window = getCurrentWindow();
  return window.onMoved(async ({ payload }) => {
    if (isAppMove(payload, islandTarget)) return;
    islandDraggedAt = Date.now();
    try {
      const scale = await window.scaleFactor();
      const size = await window.outerSize();
      localStorage.setItem("islandAnchor", JSON.stringify({ x: payload.x / scale + size.width / scale / 2, y: payload.y / scale }));
    } catch {
      // Not saving one move only means the island comes back to the previous spot.
    }
  });
}

/** Where the user last left the desktop card, if that is still on a screen; otherwise its top right. */
export async function placeWidget(width: number, height: number): Promise<void> {
  if (!isTauri) return;
  const { getCurrentWindow, LogicalPosition, LogicalSize, availableMonitors } = await api();
  const window = getCurrentWindow();
  await window.setSize(new LogicalSize(Math.ceil(width), Math.ceil(height)));
  const bounds = await primaryArea();
  let target: { x: number; y: number } | null = null;
  try {
    const saved = JSON.parse(localStorage.getItem("widgetTopLeft") ?? "null") as { x: number; y: number } | null;
    if (saved && (await isReachable(saved.x, saved.y, width, height, availableMonitors))) target = saved;
  } catch {
    // An unreadable saved position is the same as none.
  }
  if (!target && bounds) target = { x: bounds.x + bounds.width - width - 24, y: bounds.y + 24 };
  if (target && shouldPosition(await sessionKind())) await window.setPosition(new LogicalPosition(Math.round(target.x), Math.round(target.y)));
}

async function isReachable(
  x: number,
  y: number,
  width: number,
  height: number,
  availableMonitors: () => Promise<Parameters<typeof area>[0][]>,
): Promise<boolean> {
  for (const monitor of await availableMonitors()) {
    const a = area(monitor);
    const shownWidth = Math.min(x + width, a.x + a.width) - Math.max(x, a.x);
    const shownHeight = Math.min(y + height, a.y + a.height) - Math.max(y, a.y);
    if (shownWidth >= 80 && shownHeight >= 40) return true;
  }
  return false;
}

/** Remembers where the user drags the desktop card. */
export async function rememberWidgetPosition(): Promise<() => void> {
  if (!isTauri) return () => {};
  const { getCurrentWindow } = await api();
  const window = getCurrentWindow();
  return window.onMoved(async ({ payload }) => {
    const scale = await window.scaleFactor();
    localStorage.setItem("widgetTopLeft", JSON.stringify({ x: payload.x / scale, y: payload.y / scale }));
  });
}

/** Puts the popover's bottom edge just above `anchor` (a tray click, in physical pixels), kept on screen. */
export async function placeAbove(anchor: { x: number; y: number }, width: number, height: number): Promise<void> {
  if (!isTauri) return;
  const { getCurrentWindow, PhysicalPosition, PhysicalSize, availableMonitors } = await api();
  const window = getCurrentWindow();
  const scale = await window.scaleFactor();
  const w = Math.ceil(width * scale);
  const h = Math.ceil(height * scale);
  await window.setSize(new PhysicalSize(w, h));

  const monitors = await availableMonitors();
  const screen =
    monitors.find(
      (m) => anchor.x >= m.position.x && anchor.x < m.position.x + m.size.width && anchor.y >= m.position.y && anchor.y < m.position.y + m.size.height,
    ) ?? monitors[0];
  const gap = Math.round(8 * scale);
  let x = Math.round(anchor.x - w / 2);
  let y = anchor.y - h - gap;
  if (screen) {
    const right = screen.position.x + screen.size.width;
    const bottom = screen.position.y + screen.size.height;
    x = Math.min(Math.max(x, screen.position.x + gap), right - w - gap);
    // A taskbar along the top: open downwards instead.
    if (y < screen.position.y + gap) y = Math.min(anchor.y + gap, bottom - h - gap);
  }
  if (shouldPosition(await sessionKind())) await window.setPosition(new PhysicalPosition(x, y));
}

/** Calls `onSize` with the size of `element` whenever it changes. */
export function observeSize(element: Element, onSize: (width: number, height: number) => void): () => void {
  const observer = new ResizeObserver(() => {
    const box = element.getBoundingClientRect();
    onSize(box.width, box.height);
  });
  observer.observe(element);
  const box = element.getBoundingClientRect();
  onSize(box.width, box.height);
  return () => observer.disconnect();
}
