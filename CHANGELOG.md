# Changelog

What changed in each version of Namaz, newest first.

## 1.2.1 (7 October 2026)

- **No more quitting at midnight.** The app could close by itself when the day changed, and take
  the island with it until you opened it again. It now keeps running through midnight, and when
  the clock or time zone changes.

## 1.2.0 (6 October 2026)

- **Mark a prayer as prayed.** Press **Prayed** on the island, the card or the menu bar popover,
  and a tick appears beside that prayer. In the popover you can tick or untick any prayer that
  has started.
- **A warning as a prayer's time runs out.** For a prayer you have not marked, the island and card
  turn gold 20 minutes before its time ends, then amber at 15, orange at 10 and red at 5. They
  pulse, a chime sounds at each step, and the menu bar counts down, unless you have set it to
  show only the icon. Asr counts down to 20 minutes before Maghrib, when its time is disliked,
  not to Maghrib itself.
- **A cover over the screen for the last 10 minutes.** Every screen is covered with a setting sun
  that sinks as the time runs out. Press and hold **Prayed** for three seconds to clear it, or
  press ⌘Q to quit Namaz. Turn the cover or the alerts off in Settings → Running Out.
- **Quiet the alerts for a while.** Pause them for an hour, the rest of today, 3 days or 7 days
  from the popover or Settings. They come back by themselves.

## 1.1.1 (5 October 2026)

- **See at a glance which alarms are off.** In the island and the compact card, a prayer whose
  alarm is switched off now has a small crossed-out bell on its column. Before, the only way to
  tell was to open the menu bar popover or Settings, so an alarm turned off by accident went
  unnoticed until it failed to ring.

## 1.1 (5 October 2026)

- **Set any prayer to any time.** Settings → Calculation → Adjust Times now has a time field for
  each prayer: type the time you want, or use the arrows. Before, a time could only be moved by
  up to 30 minutes either way.
- An adjusted prayer shows how far it has been moved, with a Reset link to undo it.
- The adjustment is kept as a difference from the calculated time, so it carries over to every
  day and keeps following the sun. Adjustments made in 1.0 are kept.

## 1.0 (4 October 2026)

The first release.

- Menu bar item showing the next prayer, with the day's timetable and a bell for each prayer.
- Island at the MacBook notch, in the manner of the iPhone's Dynamic Island, which opens into
  the timetable when pointed at. Or a card on the desktop that can be dragged anywhere.
- The adhan at each prayer time, with a Stop button, and an optional reminder beforehand.
- Location from Location Services or a chosen city; eleven calculation methods; Standard or
  Hanafi Asr; the Hijri date and the Qibla bearing.
- Runs on Apple Silicon and Intel Macs, macOS 14 or later.
