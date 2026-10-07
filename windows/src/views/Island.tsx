import { type CardContent } from "../app";
import { type PrayerEvent, prayerName } from "../core";
import { PrayedButton, ProgressBar, StopButton, TimesStrip, breatheClass } from "./Card";
import { Icon, prayerIcon } from "./icons";
import { Countdown } from "../app";
import { skyTheme, urgencyColor, urgencyIcon } from "./theme";

/** The island's dimensions. Windows has no notch, so it is a pill that hangs a little below the top edge. */
export const ISLAND = {
  collapsed: { width: 224, height: 30 },
  expandedWidth: 400,
  /** The extra height when open: the details under the bar. */
  detailsHeight: 134,
  detailsHeightRinging: 148,
  /** How far the pill hangs below the top of the screen. */
  gap: 6,
} as const;

export function islandSize(expanded: boolean, ringing: boolean) {
  if (!expanded) return ISLAND.collapsed;
  return {
    width: ISLAND.expandedWidth,
    height: ISLAND.collapsed.height + (ringing ? ISLAND.detailsHeightRinging : ISLAND.detailsHeight),
  };
}

/**
 * A black island at the top of the screen: at rest it shows the next prayer and a countdown, and
 * it opens into the day's timetable when pointed at, or when an alarm rings. While an unprayed
 * prayer's time runs out it shows that prayer instead, counting down to its deadline in the
 * warning's colour.
 */
export function IslandContent({
  content,
  expanded,
  onPrayed = () => {},
  onStop = () => {},
}: {
  content: CardContent;
  expanded: boolean;
  onPrayed?: (event: PrayerEvent) => void;
  onStop?: () => void;
}) {
  const ringing = content.headline.kind === "ringing";
  const size = islandSize(expanded, ringing);
  /** The colour of the part of the day, or of the warning while there is one. */
  const accent = urgencyColor(content.urgency) ?? skyTheme(content.period).glow;
  const warning = content.warning !== null;
  const next = content.rows.find((row) => row.state === "next");

  return (
    <div
      class={`island ${expanded ? "island-open" : ""}`}
      style={{ width: `${size.width}px`, height: `${size.height}px` }}
    >
      {urgencyColor(content.urgency) && (
        // Light spilling from under the island, in the colour of the time left.
        <div
          class={`island-glow ${breatheClass(content.urgency)}`}
          style={{ background: `linear-gradient(to bottom, transparent, ${urgencyColor(content.urgency)}b3)` }}
        />
      )}
      <div class="island-bar">
        <div class="island-side island-left">
          {content.headline.kind === "upcoming" && (
            <>
              <span style={{ color: accent }} class="island-icon">
                <Icon name={warning ? urgencyIcon(content.urgency) : next ? prayerIcon(next.prayer) : "moonStars"} size={14} />
              </span>
              {/* During a warning, only the prayer's name: the hourglass and the colour say the rest. */}
              <span class="island-title">{warning ? (content.openTitle ?? content.headline.title) : content.headline.title}</span>
            </>
          )}
          {content.headline.kind === "ringing" && (
            <>
              <span style={{ color: accent }} class="island-icon ring-bell">
                <Icon name="bellRinging" size={14} />
              </span>
              <span class="island-title">{content.headline.title}</span>
            </>
          )}
          {content.headline.kind === "unavailable" && <span class="island-title">Namaz</span>}
        </div>
        <div class="island-side island-right">
          {content.headline.kind === "upcoming" && (
            <span class="digits" style={{ color: urgencyColor(content.urgency) ?? "#fff" }}>
              {Countdown.precise(content.remaining)}
            </span>
          )}
          {content.headline.kind === "ringing" && <span>now</span>}
          {content.headline.kind === "unavailable" && <span>No times</span>}
        </div>
      </div>

      {expanded && (
        <div class="island-details">
          {content.headline.kind === "upcoming" && (
            <>
              <div class="island-caption">
                <span class="dim island-grow">{content.headline.caption}</span>
                <span class="dim">{content.open === null ? `${content.placeName} · ${content.hijriDate}` : content.hijriDate}</span>
                {content.open && (
                  <PrayedButton
                    prayer={content.openTitle ?? prayerName(content.open.prayer)}
                    isUrgent={content.warning !== null}
                    onClick={() => onPrayed(content.open!)}
                  />
                )}
              </div>
              <div class="island-progress">
                <ProgressBar value={content.progress} tint={accent} />
              </div>
            </>
          )}
          {content.headline.kind === "ringing" && (
            <div class="island-ringing">
              <div>
                <div class="island-ring-title">{content.headline.title}</div>
                <div class="dim island-caption-small">{content.headline.caption}</div>
              </div>
              <StopButton onStop={onStop} />
            </div>
          )}
          {content.headline.kind === "unavailable" && (
            <div class="dim island-caption-small">Prayer times can't be worked out here today.</div>
          )}
          {content.rows.length > 0 && (
            <div class="island-strip">
              <TimesStrip rows={content.rows} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

