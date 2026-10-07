import { useEffect, useRef, useState } from "preact/hooks";
import type { Prayer, Urgency } from "../core";
import { Urgency as Stage } from "../core";
import { breatheClass, SkyBackground } from "./Card";
import { Icon } from "./icons";
import { Palette, urgencyColor } from "./theme";

const SUN_RADIUS = 42;
/** How long the Prayed button has to be held. Long enough that it is never pressed out of habit, which matters because, short of the time running out or quitting Namaz, it is the only way to get the screen back. */
export const HOLD_SECONDS = 3;
const BUTTON_SIZE = 116;

export function prefersReducedMotion(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * A button that acts only after it has been held down for a while, with a ring that fills as it is
 * held. Letting go early does nothing. Once it is done it says so for a moment before acting, so
 * that the person sees their press was taken.
 */
export function HoldToConfirmButton({
  title,
  duration,
  confirmationDelay = 0.6,
  onConfirm,
}: {
  title: string;
  duration: number;
  /** How long the finished button stays before `onConfirm` runs. */
  confirmationDelay?: number;
  onConfirm: () => void;
}) {
  const [pressing, setPressing] = useState(false);
  const [done, setDone] = useState(false);
  const hold = useRef<ReturnType<typeof setTimeout>>();
  const confirmed = useRef(false);

  const cancel = () => {
    if (hold.current) clearTimeout(hold.current);
    hold.current = undefined;
    if (!confirmed.current) setPressing(false);
  };
  const begin = () => {
    if (confirmed.current || hold.current) return;
    setPressing(true);
    hold.current = setTimeout(confirm, duration * 1000);
  };
  const confirm = () => {
    if (confirmed.current) return;
    confirmed.current = true;
    hold.current = undefined;
    setPressing(false);
    setDone(true);
    setTimeout(onConfirm, confirmationDelay * 1000);
  };
  useEffect(() => () => hold.current && clearTimeout(hold.current), []);

  const caption = done ? "Prayed" : pressing ? "Keep holding" : "Press and hold";
  return (
    <div class="hold-wrap">
      <button
        type="button"
        class={`hold ${pressing ? "is-pressing" : ""} ${done ? "is-done" : ""}`}
        style={{ "--hold-seconds": `${duration}s` }}
        onPointerDown={(event) => {
          (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
          begin();
        }}
        onPointerUp={cancel}
        onPointerCancel={cancel}
        onPointerLeave={cancel}
        onKeyDown={(event) => {
          if ((event.key === " " || event.key === "Enter") && !event.repeat) begin();
        }}
        onKeyUp={cancel}
        onBlur={cancel}
        aria-label="Mark as prayed. Press and hold."
      >
        <svg viewBox="0 0 116 116" class="hold-ring" aria-hidden="true">
          <circle cx="58" cy="58" r="55.5" class="hold-track" />
          <circle cx="58" cy="58" r="55.5" class="hold-progress" pathLength="1" />
        </svg>
        <span class="hold-face">
          <Icon name="check" size={28} />
          <span>{title}</span>
        </span>
      </button>
      <span class="hold-caption" aria-live="polite">
        {caption}
      </span>
    </div>
  );
}

/**
 * The cover itself: the sky of the open prayer with the light going out of it, and a sun that
 * comes down to the horizon as the time runs out. How high the sun stands is the time left,
 * readable from across the room.
 */
export function TakeoverContent({
  detail,
  urgency,
  period,
  sun,
  width,
  height,
  entrance = true,
  holdSeconds = HOLD_SECONDS,
  onPrayed,
  onQuit,
}: {
  detail: string;
  urgency: Urgency;
  /** The open prayer, whose sky the cover shows. */
  period: Prayer | null;
  /** From 1 at the top of the sun's path to 0 on the horizon, and below zero as it sets. */
  sun: number;
  width: number;
  height: number;
  /** Whether the parts arrive one after another. Off for still pictures. */
  entrance?: boolean;
  holdSeconds?: number;
  onPrayed: () => void;
  /** Set only when ⌘Q's equivalent could not be reserved and there would be no way to quit. */
  onQuit?: () => void;
}) {
  const [arrived, setArrived] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setArrived(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  const arranged = arrived || !entrance || prefersReducedMotion();

  const light = urgencyColor(urgency) ?? Palette.sunCream;
  const horizon = height * 0.62;
  const columnWidth = Math.min(width - 96, 960);
  const left = (width - columnWidth) / 2;
  const path = Math.min(horizon * 0.5, 300);
  const reach = sun >= 0 ? path : SUN_RADIUS * 2;
  const sunY = horizon - SUN_RADIUS - reach * sun;

  return (
    <div class={`cover ${arranged ? "is-arranged" : ""}`} style={{ width: `${width}px`, height: `${height}px`, "--light": light }}>
      {/* The period's own sky under a veil of night that deepens as the sun comes down. */}
      <SkyBackground period={period} glowRadius={Math.max(width, height) * 0.55} />
      <div class="cover-veil" style={{ opacity: 0.55 + 0.25 * (1 - Math.max(sun, 0)) }} />

      <div class="cover-sky" style={{ height: `${horizon}px` }}>
        <div
          class="sun"
          style={{
            left: `${left + columnWidth - 64 - SUN_RADIUS}px`,
            top: `${sunY - SUN_RADIUS}px`,
            width: `${SUN_RADIUS * 2}px`,
            height: `${SUN_RADIUS * 2}px`,
          }}
        />
      </div>

      {/* Darker below the horizon, with the last light rising from it in the final stages. */}
      <div class="ground" style={{ top: `${horizon}px`, height: `${height - horizon}px` }} />
      {urgency >= Stage.ten && (
        <div
          class={`ground-light ${breatheClass(urgency)}`}
          style={{
            // The last light rising from the horizon, in the sky just above it.
            top: `${horizon * 0.5}px`,
            height: `${horizon * 0.5}px`,
            background: `linear-gradient(to bottom, transparent, ${light}${urgency >= Stage.five ? "80" : "38"})`,
          }}
        />
      )}
      <div class="horizon" style={{ top: `${horizon}px` }} />

      <div class="words" style={{ left: `${left}px`, width: `${columnWidth - 150}px`, height: `${horizon - 30}px` }}>
        <h1>Prayer is better than work.</h1>
        <p class="detail">{detail}</p>
      </div>

      <div class="cover-controls" style={{ left: `${left}px`, top: `${horizon + 44}px` }}>
        <HoldToConfirmButton title="Prayed" duration={holdSeconds} onConfirm={onPrayed} />
        {onQuit && (
          <button type="button" class="quit-link" onClick={onQuit} style={{ marginTop: `${18}px`, width: `${BUTTON_SIZE}px` }}>
            Quit Namaz
          </button>
        )}
      </div>
    </div>
  );
}
