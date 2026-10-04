# Brag Plan: Namaz

## What is this app?
Namaz is a macOS menu bar app that keeps the five daily prayer times at the MacBook's notch and plays the adhan when each one arrives.

## The angle
The notch is the one part of a Mac screen that does nothing. Namaz turns it into the place the day's prayers live, and the video simply watches that happen in real time: a countdown reaches zero at Maghrib, the island opens, the sky behind it turns from afternoon to dusk, and the adhan begins. Nothing is claimed that the app does not do; the product's own sound is the soundtrack.

## Hook (first 2-3 seconds)
A Mac desktop under a late-afternoon sky, the bare notch at the top. Two lines land beneath it:

> Your Mac has a notch.
> *Let it call you to prayer.*

While the second line holds, the notch grows wings and becomes the island, answering the line.

## Key moments (the middle)
- The island at rest: "Maghrib" on the left of the notch, a live countdown on the right, ticking 0:04 → 0:01.
- The pointer reaches it and it opens into the day's timetable: Fajr 5:10 through Isha 7:31, Asr outlined as current, Maghrib filled as next.
- The countdown hits zero. The island switches to "Maghrib · It's time to pray · 6:15 PM" with the Stop button, the sky turns to dusk, and the adhan from Masjid an-Nabawi starts.
- The desktop card, whose backdrop runs through the whole day: dawn, morning, midday, afternoon, dusk, night.

## Outro / punchline
The night sky, the app icon, and the name. "Prayer times and alarms for macOS." The adhan's opening phrase finishes on its own just before the last frame.

## User flow worth showing
Glance at the notch (next prayer and countdown) → point at it (the day's timetable opens) → the time arrives (island opens by itself, adhan plays, Stop button offered).

## Tone
- Preset: polished
- Creative direction: a quiet product film; one continuous evening at the notch, afternoon to night
- Interpretation: slow, confident reveals, few words, long holds. No jokes, no hype. The motion comes from the product (the island opening, the countdown, the sky changing), not from decoration.

## Format: landscape — 1920x1080
## Duration: 24.8 seconds

## Visual identity (from the project)
- Background: the app's own `SkyTheme` gradients. Afternoon `#29487A → #7A5870 → #B86C39`, dusk `#21184D → #6C2B69 → #C4523F`, night `#060A1F → #0F1B3E → #1C2C58`
- Accent: the period glow colours, `#FFC46B` (afternoon), `#FF8A4C` (dusk), `#8FB2FF` (night)
- Text: white `#FFFFFF`; island surface black `#000000`
- Display font: Iowan Old Style (headlines only; the app has no display face of its own)
- Body font: the system font, SF Pro, which is what the app itself draws with
- Strongest visual element: the black island wrapped around the notch, opening into the six-column timetable

## Share copy (draft)
Namaz puts the day's prayer times at your Mac's notch and plays the adhan when each one arrives. Free and open source.

## Audio direction
- Role: intentional near-silence, then the product's own sound
- Music: none. The bundled tracks are upbeat instrumental beds; under a call to prayer they would be wrong for the subject and for much of the audience. The adhan recording the app ships with is the soundtrack.
- Music treatment: the opening phrase of `Resources/Adhan.m4a` (source 0.95s–18.7s, one complete phrase) starts at 6.6s, exactly when the island rings, and runs to the end. Short fade at the tail only.
- Music cue guidance: unavailable; continue without beat/cue sync. There is no beat grid in a recitation, and the one hard sync point (alarm at 6.6s) is set by the story.
- Audio-reactive treatment: subtle; the dusk sky's glow and the island's bell waves breathe with the adhan's loudness. No waveform or equalizer visuals.
- SFX posture: sparse; two soft cues before the adhan (island appearing, island opening), none after it starts.
- Audio-coupled moments: island wings extend; pointer opens the timetable; countdown reaches zero and the adhan begins.
- Restraint rule: nothing plays over the adhan, and it is never cut mid-phrase.

## Storyboard

### Scene 1 — Hook — 3.0s (0.0–3.0)
Afternoon sky as the desktop, a faint menu bar, the bare notch. "Your Mac has a notch." settles by 0.75s; "Let it call you to prayer." settles by 1.7s and holds to 3.9s (carried into scene 2). At 2.7s the notch widens into the resting island.
Sequential/interaction: two lines, one after the other; second holds 2.2s.
Audio intent: quiet; one soft drop as the island appears.
Audio-coupled idea: drop sound on the island's first frame.
Music: none
Transition mood: soft → Scene 2 (no cut; the same desktop continues)

### Scene 2 — The island — 3.6s (3.0–6.6)
Island at rest: sunset symbol and "Maghrib" left of the notch, countdown right, ticking once a second (0:04, 0:03, 0:02, 0:01). The pointer glides up and at 4.25s the island opens into the timetable: "Next prayer · 6:15 PM", "Karachi · 24 Rabiʻ II 1448", the progress bar nearly full, six columns with Asr outlined and Maghrib filled. Label beneath: "Point at it for the day's timetable." (settled 4.9–6.9s).
Sequential/interaction: simulated pointer hover opening the island; live countdown.
Audio intent: one soft rollover as it opens.
Audio-coupled idea: rollover sound at the hover.
Transition mood: soft → Scene 3 (same desktop; the alarm is the transition)

### Scene 3 — The alarm — 6.2s (6.6–12.8)
Countdown reaches zero. The island grows into its ringing state: bell symbol and "now" in the bar, "Maghrib" large, "It's time to pray · 6:15 PM", white Stop button; in the timetable Asr dims, Maghrib becomes the outlined one, Isha the filled one. The menu bar item changes from "Maghrib 6:15 PM" to "Isha 7:31 PM". The sky cross-fades from afternoon to dusk over 1.5s. Headline: "The adhan, at each prayer." (settled 7.9s), then "Recorded at Masjid an-Nabawi, Madinah." Both hold to 12.3s.
Sequential/interaction: the island opening on its own; two text lines, the set held about 4s.
Audio intent: the adhan begins on the frame the countdown reaches zero.
Audio-coupled idea: sky glow and bell waves follow the adhan's loudness.
Transition mood: soft → Scene 4

### Scene 4 — The card that follows the sky — 5.7s (12.8–18.5)
The island slides away. Left: "Or a card that follows the sky." and "Drag it anywhere on the desktop." (both held for the whole scene). Right: the compact desktop card, stepping through its six backdrops about 0.7s apart, each with its real content: Sunrise 46:00 (dawn), Dhuhr 3:20:00 (morning), Asr 3:06:00 (midday), Maghrib 1:05:00 (afternoon), Isha 46:00 (dusk), Fajr 6:40:00 (night). A six-step strip under the card names the part of the day. Ends and holds on night.
Sequential/interaction: six card states in order; they are colour-led accents, the readable copy is the held headline.
Audio intent: adhan continues, nothing added.
Audio-coupled idea: none
Transition mood: soft → Scene 5 (the night card's sky becomes the frame's sky)

### Scene 5 — Outro — 6.3s (18.5–24.8)
Night sky with stars. The app icon, "Namaz", "Prayer times and alarms for macOS.", "Free and open source · github.com/MajorAbdullah/namaz", and a small credit for the recording. The adhan phrase ends naturally at about 23.9s; the frame holds in quiet.
Sequential/interaction: icon, name, tagline, link arrive in order and hold 4s+.
Audio intent: let the phrase finish; silence after.
Audio-coupled idea: stars and glow breathe very slightly with the voice.
Transition mood: none (end)

**Music mood for this video:** none (intentional; the adhan is the soundtrack)
**Audio summary:** Six quiet seconds with two soft interface cues, then one complete phrase of the adhan from the moment the alarm rings to the end.
