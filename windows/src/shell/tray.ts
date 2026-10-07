import type { TrayIcon } from "@tauri-apps/api/tray";
import { isTauri } from "../platform/runtime";

export interface TrayActions {
  togglePopover: (anchor: { x: number; y: number }) => void;
  openSettings: () => void;
  toggleWidget: () => void;
  quit: () => void;
}

/**
 * The tray icon. A Windows tray cannot show text beside its icon, so what the Mac menu bar shows
 * (the next prayer, a countdown, "Dhuhr ends in 12m") goes in its tooltip, and the icon gets a
 * red dot while an alarm rings.
 */
export class Tray {
  private icon: TrayIcon | null = null;
  private plain: { rgba: Uint8Array; width: number; height: number } | null = null;
  private ringing = false;
  private tooltip = "Namaz";

  async start(actions: TrayActions, showsWidget: () => boolean): Promise<void> {
    if (!isTauri) return;
    const { TrayIcon } = await import("@tauri-apps/api/tray");
    const { Menu } = await import("@tauri-apps/api/menu");
    const { defaultWindowIcon } = await import("@tauri-apps/api/app");

    const image = await defaultWindowIcon();
    if (image) {
      const size = await image.size();
      this.plain = { rgba: await image.rgba(), width: size.width, height: size.height };
    }
    const menu = await Menu.new({
      items: [
        { id: "settings", text: "Settings…", action: actions.openSettings },
        { id: "widget", text: "Show or Hide Widget", action: actions.toggleWidget },
        { item: "Separator" },
        { id: "quit", text: "Quit Namaz", action: actions.quit },
      ],
    });
    this.icon = await TrayIcon.new({
      id: "namaz",
      icon: image ?? undefined,
      tooltip: this.tooltip,
      menu,
      showMenuOnLeftClick: false,
      action: (event) => {
        if (event.type === "Click" && event.button === "Left" && event.buttonState === "Up") {
          actions.togglePopover({ x: event.position.x, y: event.position.y });
        }
      },
    });
    void showsWidget;
  }

  /** Updates what the tooltip says and whether the icon wears its alarm dot. */
  async update(title: string, ringing: boolean): Promise<void> {
    if (!this.icon) return;
    const tooltip = title ? `Namaz · ${title}` : "Namaz";
    if (tooltip !== this.tooltip) {
      this.tooltip = tooltip;
      await this.icon.setTooltip(tooltip).catch(() => {});
    }
    if (ringing !== this.ringing) {
      this.ringing = ringing;
      await this.setIcon(ringing);
    }
  }

  private async setIcon(withDot: boolean): Promise<void> {
    if (!this.icon || !this.plain) return;
    try {
      const { Image } = await import("@tauri-apps/api/image");
      const { rgba, width, height } = this.plain;
      if (!withDot) {
        await this.icon.setIcon(await Image.new(rgba, width, height));
        return;
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
      const radius = Math.max(4, Math.round(width * 0.2));
      context.fillStyle = "#e5384a";
      context.strokeStyle = "#ffffff";
      context.lineWidth = Math.max(1, radius * 0.25);
      context.beginPath();
      context.arc(width - radius - 1, radius + 1, radius, 0, Math.PI * 2);
      context.fill();
      context.stroke();
      const dotted = context.getImageData(0, 0, width, height);
      await this.icon.setIcon(await Image.new(new Uint8Array(dotted.data.buffer), width, height));
    } catch {
      // The tooltip still says what is happening.
    }
  }
}
