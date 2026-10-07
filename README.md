# Namaz

Prayer times and alarms for macOS: a menu bar item, an island at the notch (or a card on the
desktop), and the adhan at each prayer. There is also a [Windows version](#namaz-for-windows).

https://github.com/user-attachments/assets/dbe27215-ea5d-4691-a895-f72465700a58

## Install

1. Download the **.dmg** file from the
   [latest release](https://github.com/MajorAbdullah/namaz/releases/latest).
2. Open it and drag **Namaz** onto **Applications**.
3. Open Namaz from Applications.

The first time, macOS will refuse to open it. See the next section.

## If macOS won't open it

Namaz is not signed with a paid Apple developer account, so macOS blocks it the first time.
This is expected, and you only have to get past it once.

**"Namaz" Not Opened: Apple could not verify "Namaz" is free of malware**

1. Click **Done**. Do not click Move to Trash.
2. Open **System Settings → Privacy & Security** and scroll to the bottom.
3. Beside the note that "Namaz" was blocked, click **Open Anyway**, then confirm with your
   password or Touch ID.

If there is no **Open Anyway** button, try opening Namaz again first. The button only appears
for a while after macOS has blocked the app.

**The quicker way, or if the steps above don't work**

Open Terminal, paste this, and press Return. It removes the "downloaded from the internet" flag
that macOS is objecting to. Then open Namaz as usual.

```bash
xattr -dr com.apple.quarantine /Applications/Namaz.app
```

This is also the fix if macOS says **"Namaz" is damaged and can't be opened**. The app is not
damaged; that is another form of the same block.

**The .dmg file itself won't open**

Clear the flag from the download instead, then open it again:

```bash
xattr -d com.apple.quarantine ~/Downloads/Namaz-*.dmg
```

**Still blocked**

On a Mac managed by a company or school, the administrator may have turned off the option to
open unverified apps. In that case only they can allow it.

## Namaz for Windows

The same app for Windows 10 and later, in the system tray: the times, the adhan,
**Prayed** marks, the end-of-time alerts and the screen cover, and the same settings. Differences
from the Mac: Windows has no notch, so the island is a pill at the top of the screen; a tray icon
cannot show text, so what the Mac shows in the menu bar is in the icon's tooltip; and **Ctrl+Alt+Q**
takes the place of ⌘Q as the way out of the screen cover.

1. Download **Namaz-<version>-windows-setup.exe** from the
   [latest release](https://github.com/MajorAbdullah/namaz/releases/latest).
2. Run it. It installs for you alone and needs no administrator password.
3. Open Namaz from the Start menu. Look for its icon in the tray, by the clock.

The first time, Windows SmartScreen will say it protected your PC, because Namaz is not signed
with a paid certificate. Click **More info**, then **Run anyway**. You only have to do this once.

Namaz needs the Microsoft Edge WebView2 runtime, which is already part of Windows 11 and of
up-to-date Windows 10. The installer fetches it if it is missing. The Windows app is in
[`windows/`](windows/); see [AGENTS.md](AGENTS.md) for how to build it.

## Requirements

It needs macOS 14 or later, on an Apple Silicon or Intel Mac. It was built and tested on
macOS 27 on Apple Silicon; the Intel build has not been run.

## Build it yourself

```bash
make install
```

This builds the app and copies it to Applications. It needs only the Command Line Tools
(`xcode-select --install`), not Xcode. `make dist` makes the disk image.

On first launch macOS asks two things: whether Namaz may use your location, and whether it may
show notifications. Both are optional. Without location it uses the city chosen in Settings;
without notifications the alarm still rings and still shows on screen.

## What you get

- **Menu bar item** showing the next prayer and its time. Click it for the full timetable, with a
  bell beside each prayer to turn its alarm on or off.
- **Island** at the top of the screen, in the manner of the iPhone's Dynamic Island. At rest it
  shows the next prayer and a countdown either side of the notch. Point at it and it opens into
  the day's timetable. On a screen without a notch it is a pill under the menu bar.
- **Desktop card**, as an alternative to the island: the same information on a card you can drag
  anywhere, whose backdrop changes with the time of day. Right-click either one to switch.
- **Alarms** at each prayer time: the adhan plays, the island opens with a Stop button (or a
  banner appears, when the card is in use), and a notification is posted. Optionally a reminder
  some minutes before.
- **Prayed marks.** Press **Prayed** on the island, the card or the menu bar popover once you
  have prayed, and a tick appears beside that prayer. In the popover you can tick or untick any
  prayer that has started.
- **End-of-time alerts** for a prayer you have not marked. From 20 minutes before its time ends
  the island and card turn gold and pulse, then amber at 15 and a deeper orange at 10. For the
  last 10 minutes every screen is covered with "Prayer is better than work." until you press and
  hold **Prayed**; it turns red for the last 5. Asr counts down to 20 minutes before Maghrib, and
  its cover stays until Maghrib.
- The Hijri date, which moves on at Maghrib, and the Qibla bearing.

## Settings

Open Settings from the menu bar popover, or by opening the app again while it is running.

| Tab | What is there |
| --- | --- |
| General | Location (automatic, a city, or coordinates), what the menu bar shows, island or card, 12 or 24-hour clock, Hijri date adjustment, open at login |
| Alarms | Which prayers ring, the sound and its volume, a test button, the advance reminder |
| Running Out | The end-of-time alerts, the screen cover, and pausing them |
| Calculation | Method, Asr school (Standard or Hanafi), high-latitude rule, and a time field for each prayer to move it to whatever time you want |

The starting method and Asr school are picked from the Mac's time zone. In Pakistan that is the
Karachi method (Fajr and Isha at 18°) with Hanafi Asr.

### The adhan

The alarm plays an adhan recorded at Masjid an-Nabawi in Madinah, in full (about three minutes),
or until you press Stop. The same recording is used for all five prayers, Fajr included.

To use a different one, go to Settings, Alarms, **Choose Audio File…** and pick a recording (MP3,
M4A, WAV or AIFF). It is copied into the app's support folder. The macOS alert sounds are also
on offer, repeated for about twenty seconds, as is no sound at all.

## Good to know

- Alarms ring only while the Mac is awake and Namaz is running. Turn on **Open Namaz at login**
  so it is always there. An alarm that passes while the Mac is asleep is skipped, not rung late.
- The island and card are the app's own windows, not widgets from the macOS widget gallery.
  Gallery widgets need Xcode to build, and cannot play an alarm in any case.
- At rest the island covers a little of the menu bar either side of the notch. Menus or status
  icons that reach that far sit behind it.
- The app is signed only for this Mac. After a rebuild, macOS treats it as a new app and asks
  again about location and notifications.
- The screen cover is strict on purpose: there is no snooze and no dismiss. **⌘Q quits Namaz**
  from anywhere while the cover is up, if you need the screen back at once. To skip it ahead of
  time, use **Pause Alerts** in the menu bar popover (an hour, the rest of today, 3 days or
  7 days; it comes back by itself), or turn it off in Settings.
- Times are rounded to the nearest minute. They can differ by a minute from another app or a
  mosque timetable, which is what the per-prayer adjustments are for.

## How the times are worked out

The sun's position comes from the US Naval Observatory's low-precision formulas, the same ones
PrayTimes.org uses, and each prayer is the instant the sun reaches the angle that defines it.

The tests check this two ways: against times published by the Aladhan API for twelve places and
dates, and against a separate, more precise model of the sun, confirming that at each computed
time the sun is where it should be (18° below the horizon at Fajr, a shadow one object-length
longer than at noon for Asr, and so on).

```bash
make test
```

What changed in each version is in the [changelog](CHANGELOG.md).

## Contributing

Contributions are welcome: bug reports, ideas and pull requests.

- **Found a problem or have an idea?** Open an
  [issue](https://github.com/MajorAbdullah/namaz/issues). For a wrong prayer time, include your
  city or coordinates, the date, the method and Asr school from Settings, and the time you
  expected along with where it comes from.
- **Want to change the code?** Fork the repo, make your change on a branch, and open a pull
  request. You need only the Command Line Tools; see [Development](#development) for the layout
  and the commands.
- **New to the code?** [AGENTS.md](AGENTS.md) is the working guide: setup, where things live,
  the pitfalls, and how to make the common kinds of change. Coding agents read it too
  (Claude Code picks it up through `CLAUDE.md`).
- **`main` is protected.** Changes go in through pull requests, and each one needs the owner's
  review before it can be merged.
- **Before you open a pull request**, run `make test` and make sure it passes. If you change how
  times are calculated, add a test for it. If you change how something looks, a screenshot in
  the pull request helps.

Some things that would be good to have:

- More built-in cities and calculation methods.
- A separate adhan for Fajr.
- Translations; the app is English-only.
- Someone to run it on an Intel Mac and on macOS 14 to 26 and report back.

Contributions are accepted under the MIT Licence, the same as the rest of the code.

## Licence

The code is released under the [MIT Licence](LICENSE). The adhan recording is not covered by
it; it has its own licence, below.

## Credits

The adhan is "Call to prayer from the Prophet's Mosque" by ejaz215, from Freesound via
[Wikimedia Commons](https://commons.wikimedia.org/wiki/File:33937_ejaz215_call-to-prayer-from-the-prophet-s-mo.ogg),
used under the [Creative Commons Attribution 3.0](https://creativecommons.org/licenses/by/3.0/)
licence. It was converted from Ogg to AAC and is otherwise unchanged.

## Development

```
Sources/NamazCore   Calculation and scheduling. No UI.
Sources/Namaz       The app: state and alarms, SwiftUI views, AppKit windows.
Tests               Tests for both.
windows             The Windows app (Tauri): a TypeScript port of NamazCore, the views, a Rust shell.
scripts             Bundle builder and icon generator.
```

Run `make` for the list of commands.

To try an alarm without waiting for a prayer time, start the app's clock just before one. Setting
any of these also keeps the run away from your real settings and skips the permission prompts:

```bash
NAMAZ_FAKE_NOW=2026-10-04T18:15:50+05:00 NAMAZ_MUTE=1 build/Namaz.app/Contents/MacOS/Namaz
```

| Variable | Effect |
| --- | --- |
| `NAMAZ_FAKE_NOW` | Start the clock at this ISO 8601 instant |
| `NAMAZ_MUTE` | Play alarm sounds at zero volume |
| `NAMAZ_DUMP_UI` | Save a PNG of each view into this directory, then quit |
