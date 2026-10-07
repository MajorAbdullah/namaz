import type { JSX } from "preact";
import type { Prayer } from "../core";

/** Simple outline icons on a 24-point grid, drawn in the current text colour. */
const PATHS = {
  // Sun low on the horizon, with rays (Fajr), rising (sunrise), high (Dhuhr), lower (Asr), setting (Maghrib).
  sunHorizon: "M3 18h18M7 18a5 5 0 0 1 10 0M12 6v3M4.9 10.9l1.8 1.8M19.1 10.9l-1.8 1.8",
  sunrise: "M3 19h18M7 19a5 5 0 0 1 10 0M12 5v6M9.5 7.5L12 5l2.5 2.5",
  sunMax: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8",
  sunMin: "M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6L7 7M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4",
  sunset: "M3 19h18M7 19a5 5 0 0 1 10 0M12 5v6M9.5 8.5L12 11l2.5-2.5",
  moonStars: "M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5zM17 3v3M15.5 4.5h3",
  bell: "M6 17V11a6 6 0 0 1 12 0v6l1.5 2h-15L6 17zM10 21h4",
  bellSlash: "M6 17V11a6 6 0 0 1 8-5.6M18 11v6l1.5 2h-13M10 21h4M3 3l18 18",
  bellRinging: "M6 17V11a6 6 0 0 1 12 0v6l1.5 2h-15L6 17zM10 21h4M2 9a10 10 0 0 1 2.5-5M22 9a10 10 0 0 0-2.5-5",
  check: "M5 12.5l4.5 4.5L19 7.5",
  circle: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z",
  checkCircle: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM7.5 12.5l3 3 6-6.5",
  hourglass: "M6 3h12M6 21h12M7 3c0 5 5 6 5 9s-5 4-5 9M17 3c0 5-5 6-5 9s5 4 5 9",
  hourglassTop: "M6 3h12M6 21h12M7 3c0 5 5 6 5 9s-5 4-5 9M17 3c0 5-5 6-5 9s5 4 5 9M9 5.5h6",
  hourglassBottom: "M6 3h12M6 21h12M7 3c0 5 5 6 5 9s-5 4-5 9M17 3c0 5-5 6-5 9s5 4 5 9M9.5 19h5",
  location: "M4 11l16-7-7 16-2-7-7-2z",
  pause: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM10 9v6M14 9v6",
  gear: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  power: "M12 3v9M6.4 6.4a8 8 0 1 0 11.2 0",
  window: "M3 5h18v14H3zM3 9h18",
} as const;

export type IconName = keyof typeof PATHS;

/** Icons that are drawn filled rather than outlined. */
const FILLED = new Set<IconName>(["bell", "bellRinging", "location", "checkCircle"]);

export function Icon({
  name,
  size = 16,
  ...rest
}: { name: IconName; size?: number } & Omit<JSX.SVGAttributes<SVGSVGElement>, "name" | "size">) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={FILLED.has(name) && name !== "checkCircle" ? "currentColor" : "none"}
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {name === "checkCircle" ? (
        <>
          <circle cx="12" cy="12" r="9" fill="currentColor" stroke="none" />
          <path d="M7.5 12.5l3 3 6-6.5" stroke="var(--tick-ink, #1b2250)" />
        </>
      ) : (
        <path d={PATHS[name]} />
      )}
    </svg>
  );
}

export function prayerIcon(prayer: Prayer): IconName {
  switch (prayer) {
    case "fajr":
      return "sunHorizon";
    case "sunrise":
      return "sunrise";
    case "dhuhr":
      return "sunMax";
    case "asr":
      return "sunMin";
    case "maghrib":
      return "sunset";
    case "isha":
      return "moonStars";
  }
}
