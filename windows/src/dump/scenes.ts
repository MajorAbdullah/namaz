import { type AppSettings, defaultSettings } from "../app";
import { type DailyPrayerTimes, type Urgency, Urgency as Stage } from "../core";

/** The day and place every picture is taken at, so they can be compared from one run to the next. */
export const DUMP_ZONE = "Asia/Karachi";
export const DUMP_DAY = { year: 2026, month: 10, day: 4 };

export type SceneView =
  | { kind: "card"; layout: "compact" | "list" }
  | { kind: "island"; expanded: boolean }
  | { kind: "banner" }
  | { kind: "popover" }
  | { kind: "cover"; urgency: Urgency; prayer: "dhuhr" | "asr" | "maghrib" | "isha"; sun: number; detail: string; quit?: boolean }
  | { kind: "settings"; tab: "general" | "alarms" | "runningOut" | "calculation" };

export interface Scene {
  name: string;
  view: SceneView;
  /** The moment the picture is taken, from the day's own times. */
  at: (today: DailyPrayerTimes) => number;
  settings?: (settings: AppSettings) => AppSettings;
  /** A prayer to show as ringing at that moment. */
  ringing?: boolean;
  /** Marks to show: the prayers of today before `at` that are ticked. */
  prayed?: ("fajr" | "dhuhr" | "asr" | "isha")[];
}

const minutes = (value: number) => value * 60;

/** Every state worth seeing, taken from the day's own times as the Mac app's UIDump does. */
export const SCENES: Scene[] = [];

function add(scene: Scene) {
  SCENES.push(scene);
}

const SKIES: [string, (t: DailyPrayerTimes) => number][] = [
  ["1-dawn", (t) => t.fajr + minutes(20)],
  ["2-morning", (t) => t.sunrise + minutes(40)],
  ["3-midday", (t) => t.dhuhr + minutes(40)],
  ["4-afternoon", (t) => t.asr + minutes(20)],
  ["5-dusk", (t) => t.maghrib + minutes(20)],
  ["6-night", (t) => t.isha + minutes(60)],
];

for (const [name, at] of SKIES) {
  add({ name: `card-compact-${name}`, view: { kind: "card", layout: "compact" }, at });
  add({ name: `card-list-${name}`, view: { kind: "card", layout: "list" }, at });
  add({ name: `island-${name}-collapsed`, view: { kind: "island", expanded: false }, at });
  add({ name: `island-${name}-expanded`, view: { kind: "island", expanded: true }, at });
}

const WARNINGS: [string, (t: DailyPrayerTimes) => number][] = [
  ["warning-20", (t) => t.asr - minutes(18)],
  ["warning-15", (t) => t.asr - minutes(13)],
  ["warning-5", (t) => t.asr - minutes(3)],
  ["warning-asr", (t) => t.maghrib - minutes(27)],
  ["warning-asr-overdue", (t) => t.maghrib - minutes(12)],
  ["warning-maghrib-5", (t) => t.isha - minutes(3)],
  ["warning-isha-10", (t) => t.fajr + 86_400 - minutes(8)],
];
for (const [name, at] of WARNINGS) {
  add({ name: `card-compact-${name}`, view: { kind: "card", layout: "compact" }, at });
  add({ name: `island-${name}-collapsed`, view: { kind: "island", expanded: false }, at });
  add({ name: `island-${name}-expanded`, view: { kind: "island", expanded: true }, at });
}

add({ name: "card-list-prayed", view: { kind: "card", layout: "list" }, at: (t) => t.asr + minutes(30), prayed: ["fajr", "dhuhr"] });
add({ name: "card-compact-prayed", view: { kind: "card", layout: "compact" }, at: (t) => t.asr + minutes(30), prayed: ["fajr", "dhuhr"] });
add({ name: "card-list-isha-open", view: { kind: "card", layout: "list" }, at: (t) => t.isha + minutes(40), prayed: ["isha"] });
add({ name: "card-compact-ringing", view: { kind: "card", layout: "compact" }, at: (t) => t.dhuhr + 2, ringing: true });
add({ name: "island-ringing", view: { kind: "island", expanded: true }, at: (t) => t.dhuhr + 2, ringing: true });
add({ name: "banner", view: { kind: "banner" }, at: (t) => t.asr + 2, ringing: true });
add({ name: "popover", view: { kind: "popover" }, at: (t) => t.asr + minutes(30) });
add({
  name: "popover-paused",
  view: { kind: "popover" },
  at: (t) => t.maghrib + minutes(30),
  settings: (s) => ({ ...s, alertsPausedUntil: null }),
});

const COVERS: [string, Urgency, "dhuhr" | "asr" | "maghrib" | "isha", number, string][] = [
  ["cover-dhuhr-10", Stage.ten, "dhuhr", 0.97, "Dhuhr ends in 9:42"],
  ["cover-dhuhr-5", Stage.five, "dhuhr", 0.4, "Dhuhr ends in 4:00"],
  ["cover-asr-10", Stage.ten, "asr", 0.8, "Best time for Asr ends in 8:00"],
  ["cover-asr-overdue", Stage.five, "asr", -0.35, "Maghrib is in 13:00. Pray Asr now."],
  ["cover-maghrib-5", Stage.five, "maghrib", 0.2, "Maghrib ends in 2:00"],
  ["cover-isha-10", Stage.ten, "isha", 0.6, "Isha ends in 6:00"],
];
for (const [name, urgency, prayer, sun, detail] of COVERS) {
  add({ name, view: { kind: "cover", urgency, prayer, sun, detail }, at: (t) => t.dhuhr });
}
add({
  name: "cover-quit",
  view: { kind: "cover", urgency: Stage.ten, prayer: "dhuhr", sun: 0.97, detail: "Dhuhr ends in 9:42", quit: true },
  at: (t) => t.dhuhr,
});

for (const tab of ["general", "alarms", "runningOut", "calculation"] as const) {
  add({ name: `settings-${tab}`, view: { kind: "settings", tab }, at: (t) => t.dhuhr + minutes(40) });
}

export function dumpSettings(): AppSettings {
  return defaultSettings(DUMP_ZONE);
}
