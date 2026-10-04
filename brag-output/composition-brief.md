# Hyperframes Composition Brief: Namaz

## Objective
Create a short launch-style brag video for Namaz.

## Output
- Composition directory: `brag-output/composition/`
- Rendered video: `brag-output/brag.mp4`
- Format: landscape — 1920x1080
- Duration: 24.8 seconds

## Source Material
- Project root: the repository root (`namaz/`)
- Primary files read: `README.md`, `Sources/Namaz/Views/IslandView.swift`, `PrayerCard.swift`, `SkyTheme.swift`, `PopoverView.swift`, `Sources/Namaz/Formatting.swift`, `scripts/make-icon.swift`, plus the app's own interface pictures (`NAMAZ_DUMP_UI`) for exact layout and content
- Product name: Namaz
- Tagline / strongest claim: "Prayer times and alarms for macOS: a menu bar item, an island at the notch, and the adhan at each prayer."
- Key UI or visual moment to recreate: the island at the notch in its three states (at rest, opened timetable, ringing with Stop), and the compact desktop card with its six sky backdrops
- Copy that must appear verbatim:
  - Next prayer · 6:15 PM
  - It's time to pray · 6:15 PM
  - Karachi · 24 Rabiʻ II 1448
  - Stop
  - Prayer times and alarms for macOS.

## Creative Direction
- Tone preset: polished
- Creative direction: a quiet product film; one continuous evening at the notch, afternoon to night
- Interpretation: slow reveals, few words, long holds; motion comes from the product itself
- Angle: The notch is the one part of a Mac screen that does nothing. Namaz makes it where the day's prayers live. The video watches one real moment: the countdown to Maghrib reaches zero, the island opens, the sky turns to dusk, and the adhan begins.
- Hook: "Your Mac has a notch." / "Let it call you to prayer." under a bare notch that then becomes the island
- Outro / punchline: icon, "Namaz", "Prayer times and alarms for macOS.", as the adhan's opening phrase ends
- Avoid:
  - Generic SaaS language
  - Abstract filler visuals
  - Unrelated visual redesign
  - Any instrumental music, or any sound over the adhan

## Visual Identity
- Background: the app's `SkyTheme` gradients (afternoon `#29487A → #7A5870 → #B86C39`, dusk `#21184D → #6C2B69 → #C4523F`, night `#060A1F → #0F1B3E → #1C2C58`)
- Text: `#FFFFFF`
- Accent: `#FFC46B` afternoon, `#FF8A4C` dusk, `#8FB2FF` night
- Display font: Iowan Old Style (installed with macOS; headlines only)
- Body font: system font (SF Pro), as the app uses
- Visual references from the project: island shape (flush top, 26pt bottom corners), `TimesStrip` six columns with filled/outlined/dimmed states, 4pt progress bar, white capsule Stop button, the app icon from `build/AppIcon.iconset`

## Storyboard
Use the storyboard in `brag-output/brag-plan.md` as the creative contract.

Scene summary:
1. Hook — 3.0s — bare notch, two headline lines, notch becomes the island
2. The island — 3.6s — live countdown, pointer opens the day's timetable
3. The alarm — 6.2s — countdown hits zero, ringing island with Stop, sky turns to dusk, adhan starts
4. The card that follows the sky — 5.7s — desktop card stepping through six times of day
5. Outro — 6.3s — night sky, icon, name, tagline, link, recording credit

## Audio
- Audio role: intentional near-silence, then the product's own sound
- Audio arc: two soft interface cues in the first six seconds; the adhan from 6.6s to the end; quiet tail
- Music: none (intentional)
- Music treatment: adhan excerpt `assets/audio/adhan-opening.m4a` (source 0.95–18.7s of `Resources/Adhan.m4a`) at 6.6s, volume 0.9, tail fade baked into the file
- Music cue guidance: unavailable; continue without beat/cue sync (a recitation has no beat grid; the alarm moment is the one hard sync)
- Audio-reactive treatment: subtle; dusk glow, bell waves and night stars follow the adhan's loudness envelope
- Audio-coupled moments:
  - island appears (2.7s) — soft drop
  - pointer opens the island (4.25s) — soft rollover
  - countdown reaches zero (6.6s) — adhan begins
- SFX selection guidance: low high-frequency-risk files only, quiet, none once the adhan has started
- SFX analysis guidance: `~/.claude/skills/brag/assets/sfx/sfx-analysis.md`
- Exact SFX choice: Hyperframes should choose filenames, timestamps, density, and volume based on the implemented animation.
- Audio files: copy the adhan excerpt and any selected SFX into `brag-output/composition/assets/`

## Hyperframes Instructions
Load the composition-building Hyperframes domain skills — `hyperframes-core`, `hyperframes-animation`, `hyperframes-creative`, `hyperframes-keyframes`, and `hyperframes-cli`. /brag is its own workflow: do not enter the `hyperframes` entry-point intent interview and do not route into its generic promo / launch-video workflow. Prefer native Hyperframes conventions over anything in `/brag`.

Requirements:
- Show at least one real UI, copy, or visual element from the source project.
- Keep all text readable in the final render.
- Keep the video within 15-25 seconds.
- Include the planned audio layer (adhan plus two SFX).
- Choose SFX after the visual animation exists.
- No beat sync: there is no music bed. The adhan start is locked to the alarm frame.
- Wire at least one visual element to the adhan's loudness (pre-extracted, deterministic).
- Use local assets for audio and images.
- Run `hyperframes check` before render — it is brag's single gate.

## Credit
The adhan is "Call to prayer from the Prophet's Mosque" by ejaz215 (Freesound, via Wikimedia Commons), CC BY 3.0. The video uses a trimmed excerpt and credits it on the last frame.
