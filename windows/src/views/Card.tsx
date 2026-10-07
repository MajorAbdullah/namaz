import type { ComponentChildren, JSX } from "preact";
import { Countdown, type CardContent, type Row, type WidgetLayout } from "../app";
import { Urgency, type Prayer, type PrayerEvent, prayerName } from "../core";
import { Icon, prayerIcon } from "./icons";
import { skyBackground, skyTheme, starField, urgencyColor, urgencyIcon } from "./theme";

export const CARD_WIDTH: Record<"compact" | "list", number> = { compact: 364, list: 296 };

/** Lets a glow breathe: slowly at first, quicker at each stage, and as a heartbeat in the last five minutes. */
export function breatheClass(urgency: Urgency): string {
  switch (urgency) {
    case Urgency.twenty:
      return "breathe breathe-slow";
    case Urgency.fifteen:
      return "breathe breathe-mid";
    case Urgency.ten:
      return "breathe breathe-fast";
    case Urgency.five:
      return "heartbeat";
    default:
      return "";
  }
}

/** A fixed scatter of faint stars across the upper part of the card. */
function Stars() {
  return (
    <svg class="stars" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      {starField().map((star) => (
        <ellipse cx={star.x} cy={star.y} rx={star.r * 0.5} ry={star.r * 0.3} fill="#fff" opacity={star.o} />
      ))}
    </svg>
  );
}

/** The sky of a part of the day: its colours, its glow, and stars at night. */
export function SkyBackground({ period, glowRadius }: { period: Prayer | null; glowRadius?: number }) {
  const theme = skyTheme(period);
  return (
    <div class="sky" style={{ background: skyBackground(theme, glowRadius) }}>
      {theme.hasStars && <Stars />}
    </div>
  );
}

export function ProgressBar({ value, tint = "#fff" }: { value: number; tint?: string }) {
  return (
    <div class="progress">
      <div class="progress-fill" style={{ width: `max(4px, ${Math.round(value * 1000) / 10}%)`, background: tint }} />
    </div>
  );
}

export function StopButton({ onStop }: { onStop: () => void }) {
  return (
    <button class="stop" type="button" onClick={onStop}>
      Stop
    </button>
  );
}

/**
 * Marks the open prayer as prayed. It names the prayer, because it sits beside a headline that is
 * usually about the next one. Quiet for most of the day; solid once time runs short.
 */
export function PrayedButton({ prayer, isUrgent, onClick }: { prayer: string; isUrgent: boolean; onClick: () => void }) {
  return (
    <button
      class={`prayed ${isUrgent ? "prayed-urgent" : ""}`}
      type="button"
      onClick={onClick}
      title={`Mark ${prayer} as prayed`}
      aria-label={`Mark ${prayer} as prayed`}
    >
      <Icon name="check" size={13} />
      <span>Prayed {prayer}</span>
    </button>
  );
}

/**
 * The countdown, which sits in a smoked chip with an hourglass while time runs short. The chip is
 * what lets the warning's colour read on every sky: laid straight on the sky, gold over midday
 * blue turns olive.
 */
function CountdownText({ content }: { content: CardContent }) {
  const color = urgencyColor(content.urgency);
  const digits = <span class="digits">{Countdown.precise(content.remaining)}</span>;
  if (!color) return digits;
  return (
    <span class="chip" style={{ color }}>
      <span class={breatheClass(content.urgency)}>
        <Icon name={urgencyIcon(content.urgency)} size={17} />
      </span>
      {digits}
    </span>
  );
}

function Headline({
  content,
  layout,
  onSetPrayed,
  onStop,
}: {
  content: CardContent;
  layout: "compact" | "list";
  onSetPrayed: (event: PrayerEvent, prayed: boolean) => void;
  onStop: () => void;
}) {
  const { headline } = content;
  switch (headline.kind) {
    case "upcoming":
      return (
        <div class="headline">
          <div class={`title-row ${layout === "compact" ? "title-large" : ""}`}>
            <span class="title">{headline.title}</span>
            <CountdownText content={content} />
          </div>
          <div class="caption-row">
            <span class="dim">{headline.caption}</span>
            {content.open ? (
              <PrayedButton
                prayer={content.openTitle ?? prayerName(content.open.prayer)}
                isUrgent={content.warning !== null}
                onClick={() => onSetPrayed(content.open!, true)}
              />
            ) : (
              <span class="dim">remaining</span>
            )}
          </div>
        </div>
      );
    case "ringing":
      return (
        <div class="headline ringing">
          <div>
            <div class={`title-row ${layout === "compact" ? "title-large" : ""}`}>
              <span class="title">{headline.title}</span>
              <span class="ring-bell">
                <Icon name="bellRinging" size={17} />
              </span>
            </div>
            <div class="caption-row dim">{headline.caption}</div>
          </div>
          <StopButton onStop={onStop} />
        </div>
      );
    case "unavailable":
      return (
        <p class="unavailable">
          Prayer times can't be worked out here today. The sun doesn't rise or set at this latitude.
        </p>
      );
  }
}

/** The day's six times side by side. */
export function TimesStrip({ rows }: { rows: Row[] }) {
  return (
    <div class="strip">
      {rows.map((row) => (
        <div class={`column state-${row.state}`} title={row.alarmOn ? `${row.title} at ${row.time}` : `${row.title} at ${row.time}, alarm off`} key={row.prayer}>
          {row.isPrayed && (
            <span class="prayed-mark" role="img" aria-label="Prayed">
              <Icon name="checkCircle" size={11} />
            </span>
          )}
          {!row.alarmOn && (
            <span class="alarm-off" role="img" aria-label="Alarm off">
              <Icon name="bellSlash" size={10} />
            </span>
          )}
          <Icon name={prayerIcon(row.prayer)} size={16} />
          <span class="column-name">{row.title}</span>
          <span class="column-time">{row.shortTime}</span>
        </div>
      ))}
    </div>
  );
}

function Line({
  row,
  onToggleAlarm,
  onSetPrayed,
}: {
  row: Row;
  onToggleAlarm: (prayer: Prayer) => void;
  onSetPrayed: (event: PrayerEvent, prayed: boolean) => void;
}) {
  return (
    <div class={`line state-${row.state}`}>
      <Icon name={prayerIcon(row.prayer)} size={15} class="line-icon" />
      <span class="line-name">{row.title}</span>
      {row.state === "current" && <span class="now">NOW</span>}
      <span class="line-time">{row.time}</span>
      {row.canMarkPrayed ? (
        <button
          class={`icon-button tick ${row.isPrayed ? "is-on" : ""}`}
          type="button"
          onClick={() => onSetPrayed(row.event, !row.isPrayed)}
          title={row.isPrayed ? "Prayed. Click to unmark." : "Click to mark as prayed."}
          aria-label={row.isPrayed ? `${row.title} prayed. Unmark.` : `Mark ${row.title} as prayed`}
        >
          <Icon name={row.isPrayed ? "checkCircle" : "circle"} size={15} />
        </button>
      ) : (
        // Keeps the times in one column on the rows that cannot be ticked.
        <span class="icon-button placeholder" />
      )}
      <button
        class={`icon-button bell ${row.alarmOn ? "is-on" : ""}`}
        type="button"
        onClick={() => onToggleAlarm(row.prayer)}
        title={row.alarmOn ? "Alarm on. Click to turn off." : "Alarm off. Click to turn on."}
        aria-label={row.alarmOn ? `${row.title} alarm on` : `${row.title} alarm off`}
      >
        <Icon name={row.alarmOn ? "bell" : "bellSlash"} size={14} />
      </button>
    </div>
  );
}

/** The prayer-times card, used by both the desktop widget and the tray popover. */
export function PrayerCard({
  content,
  layout,
  onToggleAlarm = () => {},
  onSetPrayed = () => {},
  onStop = () => {},
  children,
  ...rest
}: {
  content: CardContent;
  layout: "compact" | "list";
  onToggleAlarm?: (prayer: Prayer) => void;
  onSetPrayed?: (event: PrayerEvent, prayed: boolean) => void;
  onStop?: () => void;
  children?: ComponentChildren;
} & JSX.HTMLAttributes<HTMLDivElement>) {
  const tint = urgencyColor(content.urgency) ?? "#fff";
  return (
    <div class={`card card-${layout}`} style={{ width: `${CARD_WIDTH[layout]}px` }} {...rest}>
      <SkyBackground period={content.period} />
      <div class="card-body">
        <div class="card-header" data-tauri-drag-region>
          <Icon name="location" size={10} />
          <span class="place">{content.placeName}</span>
          <span class="hijri">{content.hijriDate}</span>
        </div>
        <Headline content={content} layout={layout} onSetPrayed={onSetPrayed} onStop={onStop} />
        <div class="progress-wrap">
          <ProgressBar value={content.progress} tint={tint} />
        </div>
        {content.rows.length > 0 && (
          <div class="timetable">
            {layout === "list" ? (
              content.rows.map((row) => (
                <Line row={row} onToggleAlarm={onToggleAlarm} onSetPrayed={onSetPrayed} key={row.prayer} />
              ))
            ) : (
              <TimesStrip rows={content.rows} />
            )}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

/** The widget layouts that are cards (the island is its own window). */
export function cardLayout(layout: WidgetLayout): "compact" | "list" {
  return layout === "list" ? "list" : "compact";
}


