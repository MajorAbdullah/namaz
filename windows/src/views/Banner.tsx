import type { Prayer } from "../core";
import { SkyBackground, StopButton } from "./Card";
import { Icon } from "./icons";

export const BANNER_WIDTH = 430;

/** The alarm itself: a banner at the top of the screen that stays until stopped. */
export function AlarmBanner({
  title,
  detail,
  period,
  onStop,
}: {
  title: string;
  detail: string;
  period: Prayer | null;
  onStop: () => void;
}) {
  return (
    <div class="banner" style={{ width: `${BANNER_WIDTH}px` }}>
      <SkyBackground period={period} />
      <div class="banner-body">
        <span class="banner-icon ring-bell">
          <Icon name="bellRinging" size={26} />
        </span>
        <div class="banner-text">
          <div class="banner-title">{title}</div>
          <div class="banner-detail">{detail}</div>
        </div>
        <StopButton onStop={onStop} />
      </div>
    </div>
  );
}
