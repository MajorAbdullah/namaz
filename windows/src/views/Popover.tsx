import type { ComponentChildren } from "preact";
import { type AppSettings, ClockFormat } from "../app";
import type { PauseLength } from "../core";
import { qiblaDescription } from "../core";
import { currentPlace } from "../app";
import { PrayerCard } from "./Card";
import { Icon } from "./icons";

const PAUSES: { label: string; length: PauseLength }[] = [
  { label: "For 1 Hour", length: { kind: "hour" } },
  { label: "For the Rest of Today", length: { kind: "restOfToday" } },
  { label: "For 3 Days", length: { kind: "days", days: 3 } },
  { label: "For 7 Days", length: { kind: "days", days: 7 } },
];

/** The lengths a pause can have, offered in the popover and in Settings. */
export function PauseAlertsMenu({
  onPause,
  children,
}: {
  onPause: (length: PauseLength) => void;
  children: ComponentChildren;
}) {
  return (
    <label class="menu-button">
      {children}
      <select
        value=""
        onChange={(event) => {
          const choice = PAUSES[Number(event.currentTarget.value)];
          event.currentTarget.value = "";
          if (choice) onPause(choice.length);
        }}
        aria-label="Pause alerts"
      >
        <option value="" disabled selected hidden />
        {PAUSES.map((pause, index) => (
          <option value={index} key={pause.label}>
            {pause.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** A way to quieten the end-of-time alerts for a while, or to bring them back. */
export function PauseRow({
  pauseEnd,
  now,
  format,
  onPause,
  onResume,
}: {
  pauseEnd: number | null;
  now: number;
  format: ClockFormat;
  onPause: (length: PauseLength) => void;
  onResume: () => void;
}) {
  return (
    <div class="row-small">
      {pauseEnd !== null ? (
        <>
          <span class="with-icon">
            <Icon name="pause" size={14} />
            Alerts paused until {format.timeAndDay(pauseEnd, now)}
          </span>
          <button type="button" class="link" onClick={onResume}>
            Resume
          </button>
        </>
      ) : (
        <PauseAlertsMenu onPause={onPause}>
          <span class="with-icon" title="Stops the end-of-time alerts and the screen cover for a while. The adhan still rings.">
            <Icon name="pause" size={14} />
            Pause Alerts
          </span>
        </PauseAlertsMenu>
      )}
    </div>
  );
}

/** What opens from the tray icon: the full timetable with alarm switches, and app controls. */
export function PopoverContent({
  card,
  settings,
  pauseEnd,
  now,
  format,
  onPause,
  onResume,
  onSettings,
  onToggleWidget,
  onQuit,
}: {
  card: ComponentChildren;
  settings: AppSettings;
  pauseEnd: number | null;
  now: number;
  format: ClockFormat;
  onPause: (length: PauseLength) => void;
  onResume: () => void;
  onSettings: () => void;
  onToggleWidget: () => void;
  onQuit: () => void;
}) {
  return (
    <div class="popover">
      {card}
      <div class="row-small">
        <span class="with-icon">
          <Icon name="location" size={13} />
          Qibla {qiblaDescription(currentPlace(settings).coordinates)}
        </span>
        <span>{settings.calculation.madhab === "hanafi" ? "Hanafi Asr" : "Standard Asr"}</span>
      </div>
      {settings.endOfTimeAlerts && (
        <PauseRow pauseEnd={pauseEnd} now={now} format={format} onPause={onPause} onResume={onResume} />
      )}
      <hr />
      <div class="popover-actions">
        <button type="button" class="link with-icon" onClick={onSettings}>
          <Icon name="gear" size={15} />
          Settings…
        </button>
        <button type="button" class="link with-icon" onClick={onToggleWidget}>
          <Icon name="window" size={15} />
          {settings.showsWidget ? "Hide Widget" : "Show Widget"}
        </button>
        <button type="button" class="link with-icon" onClick={onQuit}>
          <Icon name="power" size={15} />
          Quit
        </button>
      </div>
    </div>
  );
}

export function popoverCard(content: Parameters<typeof PrayerCard>[0]) {
  return <PrayerCard {...content} layout="list" />;
}
