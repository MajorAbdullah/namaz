import { type Prayer, Urgency } from "../core";

/** The colours of the end-of-time alerts. They come from the app icon: its night, its sun, and the light of a sky going from late afternoon to the last red at the horizon. */
export const Palette = {
  nightInk: "#12143F",
  sunCream: "#FFF6DC",
  sunGlow: "#FFE9B0",
  lateSun: "#F4C152",
  amber: "#F2913D",
  ember: "#E8613C",
  lastLight: "#DE3A4C",
} as const;

/** The light left in the sky: gold, then amber, ember, and red. Null while calm. */
export function urgencyColor(urgency: Urgency): string | null {
  switch (urgency) {
    case Urgency.calm:
      return null;
    case Urgency.twenty:
      return Palette.lateSun;
    case Urgency.fifteen:
      return Palette.amber;
    case Urgency.ten:
      return Palette.ember;
    case Urgency.five:
      return Palette.lastLight;
  }
}

/** An hourglass that empties as the stages pass. */
export function urgencyIcon(urgency: Urgency): "hourglass" | "hourglassTop" | "hourglassBottom" {
  switch (urgency) {
    case Urgency.twenty:
      return "hourglassTop";
    case Urgency.ten:
    case Urgency.five:
      return "hourglassBottom";
    default:
      return "hourglass";
  }
}

export interface SkyTheme {
  /** Top to bottom. */
  colors: [string, string, string];
  /** A soft light where the sun or moon would be. */
  glow: string;
  /** Where the glow sits, as percentages of the card. */
  glowAt: [number, number];
  hasStars: boolean;
}

/**
 * The card's backdrop follows the sky: each prayer period has its own colours, deep enough
 * throughout to keep white text readable.
 */
export function skyTheme(period: Prayer | null): SkyTheme {
  switch (period) {
    case "fajr":
      return { colors: ["#16184A", "#41357A", "#A65B7B"], glow: "#FF9A6B", glowAt: [85, 110], hasStars: true };
    case "sunrise":
      return { colors: ["#14457F", "#2A72B8", "#4690CC"], glow: "#9FD2FF", glowAt: [100, 110], hasStars: false };
    case "dhuhr":
      return { colors: ["#0A4A80", "#1273AB", "#2493BD"], glow: "#A8E6FF", glowAt: [50, 125], hasStars: false };
    case "asr":
      return { colors: ["#29487A", "#7A5870", "#B86C39"], glow: "#FFC46B", glowAt: [105, 60], hasStars: false };
    case "maghrib":
      return { colors: ["#21184D", "#6C2B69", "#C4523F"], glow: "#FF8A4C", glowAt: [10, 115], hasStars: false };
    case "isha":
    case null:
      return { colors: ["#060A1F", "#0F1B3E", "#1C2C58"], glow: "#8FB2FF", glowAt: [90, 0], hasStars: true };
  }
}

function withAlpha(hex: string, alpha: number): string {
  const value = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
}

/** The sky as a CSS background: the gradient with the glow laid over it. */
export function skyBackground(theme: SkyTheme, glowRadius = 260): string {
  const [x, y] = theme.glowAt;
  return [
    `radial-gradient(circle ${glowRadius}px at ${x}% ${y}%, ${withAlpha(theme.glow, 0.5)}, ${withAlpha(theme.glow, 0)})`,
    `linear-gradient(to bottom, ${theme.colors.join(", ")})`,
  ].join(", ");
}

export { withAlpha };

/** A fixed scatter of faint stars, the same on every redraw. */
export function starField(count = 30, seed = 11): { x: number; y: number; r: number; o: number }[] {
  let state = seed >>> 0;
  const random = () => {
    // mulberry32
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return Array.from({ length: count }, () => ({
    x: random() * 100,
    y: random() * 62,
    r: 0.35 + random() * 0.7,
    o: 0.15 + random() * 0.45,
  }));
}
