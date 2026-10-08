# Working on Namaz

Guidance for people and coding agents making changes here. The README covers what the app does;
this file covers how to work on it.

## What this is

A macOS menu bar app that shows prayer times and plays the adhan at each one. It is a Swift
package, not an Xcode project, and it builds with the Command Line Tools alone.

## Set up

```bash
xcode-select --install   # once, if the Command Line Tools are not installed
make test                # build and run every test
make start               # build build/Namaz.app and open it
```

`make` on its own lists every command. There are no dependencies to fetch.

## Windows

A Windows version lives in `windows/`: a Tauri app, TypeScript in `src/` and a thin Rust shell in
`src-tauri/`. The Mac app does not depend on it. It needs Node 22; the Rust shell is built by CI
(`.github/workflows/windows.yml`) and by anyone with Rust installed.

```bash
cd windows
npm ci            # once
npm test          # the prayer maths, the engine, the shell's configuration
npm run dump-ui   # a picture of every view in ui-dump/ (--channel chrome to use installed Chrome)
npm run dev       # the pages in a browser: http://localhost:1420/?w=dump lists every scene
npm run tauri build   # on Windows: the installer, in src-tauri/target/release/bundle/nsis
```

- `src/core/` is a file-for-file port of `Sources/NamazCore`. Change the Swift maths and the port
  together, then regenerate the vectors the port is checked against:
  `NAMAZ_EXPORT_VECTORS=$PWD/windows/src/test/vectors.json make test FILTER=GoldenVectors`.
  `npm test` must then agree with Swift exactly. Do not loosen the tolerances in
  `src/test/sunPosition.test.ts` either.
- `src/app/` is the port of `AppModel`, written so it never touches the operating system
  (`Platform` in `engine.ts`): its timer, alarms and clock-change handling are tested with fake
  timers. `src/views/` are the pages, `src/shell/` opens and places the windows, `src/platform/`
  is storage, sound, toasts and location.
- One hidden window (`?w=engine`) runs the engine and publishes snapshots; every other window
  draws them and sends commands back. Windows that are made from script must use the same
  `BROWSER_ARGS` as the engine window in `tauri.conf.json`; a test keeps them in step.
- The version is the one in `Resources/Info.plist`. `npm run sync-version` copies it into the
  Windows files; CI fails if they differ.
- The diagnostic switches are the same, as environment variables: `NAMAZ_FAKE_NOW`, `NAMAZ_MUTE`,
  and `NAMAZ_TZ=Asia/Karachi` to make a fake clock set in another country make sense.

## Linux

The same Tauri app builds on Linux with a .deb and AppImage via `npm run tauri build`. It needs:

```bash
libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev libgtk-3-dev patchelf
```

CI builds it in `.github/workflows/linux.yml`. Known limits:

- The tray has no click events or tooltip, so the menu shows the next prayer instead.
- On Wayland windows cannot be placed and the cover's escape is Ctrl+Alt+Q inside the cover or
  its Quit button; on X11 both work as on Mac and Windows.
- Sound needs gstreamer1.0-plugins-good; if it is missing, the app falls back to
  `Resources/Adhan.ogg`. Regenerate it if the adhan changes:
  `ffmpeg -i Resources/Adhan.m4a -c:a libopus -b:a 96k Resources/Adhan.ogg`.

## Layout

```
Sources/NamazCore     Prayer-time maths and scheduling. Foundation only, no UI.
Sources/Namaz         The app.
  AppModel.swift        State, the wake-up timer, and ringing alarms.
  AppSettings.swift     Everything the user can change, saved as one JSON value.
  Views/                SwiftUI: the card, the island, the popover, Settings.
  Windows/              AppKit: the menu bar item and the borderless panels.
Tests/NamazCoreTests  The maths, against published times and a model of the sun.
Tests/NamazTests      Settings, formatting, and mouse events through the panels.
scripts/              Bundle builder, disk image builder, icon generator.
Resources/            Info.plist, the icon, the adhan recording.
```

Logic that can be tested without a window belongs in `NamazCore`. `AppModel` should stay a thin
layer that connects that logic to timers, sound and windows.

## Commands

| Command | What it does |
| --- | --- |
| `make test` | Runs all tests. Use this, not bare `swift test` (see below). |
| `make test FILTER=<Suite>` | Runs one test suite. |
| `make start` | Release build, then opens `build/Namaz.app`. |
| `scripts/build-app.sh debug` | Faster debug build of the bundle, for this Mac's architecture only. |
| `make install` | Copies the app to `/Applications` and opens it. |
| `make dist` | Builds `build/Namaz-<version>.dmg`. |
| `make stop` | Quits the running app. |

## Things that will trip you up

- **Do not write `@State`.** From the macOS 27 SDK it is a macro whose plugin ships only with
  Xcode, so it fails to compile here. Use `@ViewState` (see `Views/ViewState.swift`), which is
  the same property wrapper under another name.
- **Run tests with `make test`.** Without Xcode, bare `swift test` intermittently fails with
  "plugin for module 'TestingMacros' not found". The Makefile passes the plugin path. To run
  one suite: `make test FILTER=FormattingTests`.
- **Tests use Swift Testing** (`import Testing`, `@Test`, `#expect`), not XCTest, which the
  Command Line Tools do not include.
- **The code compiles in Swift 6 mode.** Types that touch UI are `@MainActor`. Delegate
  callbacks that arrive off the main actor are `nonisolated` and hop back with a `Task`.
- **The panels never become the key window**, so that clicking the island or card does not take
  keyboard focus from the user's work. Two consequences: buttons need a hosting view that
  accepts the first click (`ClickThroughHostingView`), and SwiftUI's `.onHover` does not fire,
  which is why the island tracks the pointer itself (`HoverTrackingHostingView`). The screen
  cover (`CoverPanel`) is the one exception: it takes the keyboard on purpose while it is up,
  and hands it back when it goes.
- **Rebuilding changes the app's identity.** It is ad-hoc signed, so after each rebuild macOS
  asks again about location and notifications.
- **The panel tests put real windows on screen** for a second or two. That is expected.
- **The screen cover really covers the screen.** Starting the clock within ten minutes of a
  prayer's deadline (see below) brings it up at once. Asr's deadline is 20 minutes before
  Maghrib, and its cover stays until Maghrib, so the Maghrib example below lands in it. Hold
  Prayed for three seconds, or press ⌘Q, which the app reserves system-wide while the cover is
  showing.

## Trying changes without waiting for a prayer time

Environment variables put the app in a mode that keeps settings in memory, skips permission
prompts, and leaves the user's real settings alone:

```bash
# Start the clock ten seconds before Maghrib in Karachi, with the sound muted.
NAMAZ_FAKE_NOW=2026-10-04T18:15:50+05:00 NAMAZ_MUTE=1 build/Namaz.app/Contents/MacOS/Namaz

# Save a PNG of every view (cards, island, popover, each Settings tab), then quit.
NAMAZ_DUMP_UI=/tmp/namaz-ui NAMAZ_MUTE=1 build/Namaz.app/Contents/MacOS/Namaz
```

After a visual change, run the second command and look at the pictures. If you add a view, add
it to `UIDump.swift` so it is covered too.

## Common changes

- **A new setting.** Add the property to `AppSettings`, give it a value in `defaults(for:)`,
  and add a `read(...)` line in `init(from:)`. That last step is what lets settings saved by an
  older version keep loading. Then add the control in `Views/SettingsView.swift`.
- **A new calculation method.** Add a case to `CalculationMethod` with its name and angles, and
  a reference case in `Tests/NamazCoreTests/PrayerTimesTests.swift` taken from a published
  timetable.
- **A new city.** Add a line to `City.all` in `NamazCore/Place.swift`: name, country, latitude,
  longitude, time zone identifier.
- **Anything in the prayer-time maths.** `SunPositionTests` checks every computed time against
  an independent model of the sun. It must keep passing; do not loosen its tolerances to make a
  change fit.

## Conventions

- Match the code around you: doc comments that say why, not what, and no force unwraps where
  a value can really be missing.
- Write user-facing text in plain words.
- Times shown to the user are rounded to the nearest minute. Keep exact instants internal.
- User-facing strings are English only for now and live beside the views that show them.
- Do not commit `build/` or `.build/`.

## Releasing

1. Set the new version in `Resources/Info.plist` (`CFBundleShortVersionString`, and raise
   `CFBundleVersion` by one), then run `npm run sync-version` in `windows/` so the Windows
   files agree with it.
2. Add an entry at the top of `CHANGELOG.md`, written for people who use the app.
3. Run `make test`, then `make dist` to build `build/Namaz-<version>.dmg`.
4. Commit, push, and publish a GitHub release tagged `v<version>` with the disk image attached
   and the changelog entry as its notes. Attach the Windows installer from the Windows
   workflow's run for the same commit (`Namaz-<version>-windows-setup.exe`), and the Linux
   workflow's artifacts (`Namaz-<version>-linux-amd64.deb` and
   `Namaz-<version>-linux-x86_64.AppImage`).

## Sending changes

`main` is protected. Work on a branch and open a pull request; every pull request needs the
owner's review before it can be merged. Run `make test` first, and include a picture for
anything that changes how the app looks.

The code is MIT licensed. The adhan recording in `Resources/` has its own licence (CC BY 3.0);
if you replace it, update the Credits section of the README.
