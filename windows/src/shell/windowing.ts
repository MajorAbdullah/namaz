import { isTauri } from "../platform/runtime";

/** The browser has no windows to move, so everything here quietly does nothing outside the shell. */
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
  if (bounds) await window.setPosition(new LogicalPosition(Math.round(bounds.x + (bounds.width - width) / 2), Math.round(bounds.y + gap)));
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
  if (target) await window.setPosition(new LogicalPosition(Math.round(target.x), Math.round(target.y)));
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
  await window.setPosition(new PhysicalPosition(x, y));
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
