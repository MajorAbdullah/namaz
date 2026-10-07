import { useEffect, useState } from "preact/hooks";
import { AppEngine, ClockFormat, NO_DIAGNOSTICS, type Platform, type Snapshot, currentPlace } from "../app";
import { PrayedLog, PrayerSchedule, instantFromLocal } from "../core";
import { AlarmBanner } from "../views/Banner";
import { PrayerCard } from "../views/Card";
import { TakeoverContent } from "../views/Cover";
import { FixedContext, scheduleFor, useCardContent } from "../views/hooks";
import { IslandContent, islandSize } from "../views/Island";
import { PopoverContent } from "../views/Popover";
import { SettingsContent } from "../views/Settings";
import { DUMP_DAY, DUMP_ZONE, SCENES, type Scene, dumpSettings } from "./scenes";

const silentPlatform: Platform = {
  load: async () => null,
  save: async () => {},
  playSound: async () => false,
  stopSound: () => {},
  playChime: () => {},
  notify: () => {},
  clearAlarmNotification: () => {},
  log: () => {},
};

/** The snapshot an engine would publish at this scene's moment. */
async function snapshotFor(scene: Scene): Promise<{ snapshot: Snapshot; now: number }> {
  const settings = dumpSettings();
  const place = currentPlace(settings);
  const schedule = PrayerSchedule.make(instantFromLocal(DUMP_DAY, 12, 0, DUMP_ZONE), place.coordinates, DUMP_ZONE, settings.calculation)!;
  const now = scene.at(schedule.today);

  const engine = new AppEngine(silentPlatform, { ...NO_DIAGNOSTICS, clockOffset: now - Date.now() / 1000, timeZone: DUMP_ZONE, isActive: true });
  await engine.start();
  if (scene.settings) engine.setSettings(scene.settings(engine.settings));
  if (scene.name === "popover-paused") engine.pauseAlerts({ kind: "hour" });
  // Marks, as the engine would hold them.
  let prayed = new PrayedLog();
  for (const prayer of scene.prayed ?? []) {
    const event = { prayer, time: schedule.today.at(prayer) };
    prayed = prayed.setting(true, event, DUMP_ZONE);
  }
  const snapshot = engine.snapshot();
  const shot: Snapshot = {
    ...snapshot,
    prayed: prayed.toJSON(),
    ringing: scene.ringing ? { prayer: schedule.current(now)!.prayer, time: schedule.current(now)!.time } : null,
  };
  engine.stop();
  return { snapshot: shot, now };
}

function View({ scene, snapshot, now }: { scene: Scene; snapshot: Snapshot; now: number }) {
  const view = scene.view;
  const content = useCardContent(snapshot, now)!;
  const format = new ClockFormat(snapshot.settings.clockStyle, DUMP_ZONE);
  const timeZone = DUMP_ZONE;
  switch (view.kind) {
    case "card":
      return <PrayerCard content={content} layout={view.layout} />;
    case "island": {
      const size = islandSize(view.expanded, content.headline.kind === "ringing");
      return (
        <div style={{ width: `${size.width}px`, height: `${size.height}px` }}>
          <IslandContent content={content} expanded={view.expanded} />
        </div>
      );
    }
    case "banner":
      return (
        <AlarmBanner
          title={`${content.headline.kind === "ringing" ? content.headline.title : ""} · ${format.time(now)}`}
          detail={`It's time to pray in ${content.placeName}.`}
          period={content.period}
          onStop={() => {}}
        />
      );
    case "popover":
      return (
        <PopoverContent
          card={<PrayerCard content={content} layout="list" />}
          settings={snapshot.settings}
          pauseEnd={snapshot.settings.alertsPausedUntil !== null && snapshot.settings.alertsPausedUntil > now ? snapshot.settings.alertsPausedUntil : null}
          now={now}
          format={format}
          onPause={() => {}}
          onResume={() => {}}
          onSettings={() => {}}
          onToggleWidget={() => {}}
          onQuit={() => {}}
        />
      );
    case "cover":
      return (
        <TakeoverContent
          detail={view.detail}
          urgency={view.urgency}
          period={view.prayer}
          sun={view.sun}
          width={1440}
          height={900}
          entrance={false}
          onPrayed={() => {}}
          onQuit={view.quit ? () => {} : undefined}
        />
      );
    case "settings":
      return (
        <div style={{ width: "580px", height: "720px" }}>
          <SettingsContent
            tab={view.tab}
            onTab={() => {}}
            snapshot={snapshot}
            now={now}
            format={format}
            actions={{
              patch: () => {},
              pause: () => {},
              resume: () => {},
              testAlarm: () => {},
              stopAlarm: () => {},
              locate: () => {},
              chooseSound: async () => null,
              importedSoundName: async () => null,
              launchAtLogin: { get: async () => true, set: async () => {} },
            }}
          />
        </div>
      );
  }
  void timeZone;
  void scheduleFor;
}

/**
 * Draws one state of one view, on a fixed day, so a picture can be taken of it. The page address
 * names the scene: `?w=dump&scene=card-list-prayed`. With no scene, it lists them.
 */
export function DumpPage() {
  const params = new URLSearchParams(location.search);
  const name = params.get("scene");
  const scene = SCENES.find((candidate) => candidate.name === name);
  const [state, setState] = useState<{ snapshot: Snapshot; now: number } | null>(null);

  useEffect(() => {
    (window as unknown as { __scenes: string[] }).__scenes = SCENES.map((s) => s.name);
    if (!scene) return;
    document.body.style.background = scene.view.kind === "settings" ? "#1b1d24" : "#2b2d36";
    void snapshotFor(scene).then((result) => {
      setState(result);
      requestAnimationFrame(() => requestAnimationFrame(() => ((window as unknown as { __ready: boolean }).__ready = true)));
    });
  }, [name]);

  if (!scene) {
    return (
      <ul style={{ padding: "16px", userSelect: "text" }}>
        {SCENES.map((s) => (
          <li key={s.name}>
            <a href={`?w=dump&scene=${s.name}`} style={{ color: "#8fb2ff" }}>
              {s.name}
            </a>
          </li>
        ))}
      </ul>
    );
  }
  if (!state) return null;
  return (
    <FixedContext.Provider value={{ snapshot: state.snapshot, now: state.now }}>
      <div id="shot" style={{ display: "inline-block", padding: scene.view.kind === "cover" || scene.view.kind === "settings" ? 0 : "20px" }}>
        <View scene={scene} snapshot={state.snapshot} now={state.now} />
      </div>
    </FixedContext.Provider>
  );
}
