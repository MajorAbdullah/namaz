import type { AlarmSound } from "../app";
import { isTauri } from "./runtime";

/** The short tones that ship with the app, in the order the picker lists them. */
export const TONES = ["Bell", "Glass", "Soft"] as const;

/** How long a short tone is repeated, so that an alarm made of one is hard to miss. */
const TONE_RING_SECONDS = 20;

const CUSTOM_DIR = "sounds";

/** Plays the alarm sound and reports when it has run its course. */
export class AlarmPlayer {
  private audio: HTMLAudioElement | null = null;
  private objectURL: string | null = null;
  private chimes = new Map<string, HTMLAudioElement>();

  async play(sound: AlarmSound, volume: number, onEnd: () => void): Promise<boolean> {
    this.stop();
    const source = await this.source(sound);
    if (!source) return false;

    const audio = new Audio(source);
    audio.volume = Math.min(Math.max(volume, 0), 1);
    if (sound.kind === "tone") {
      // Played again until about twenty seconds have passed.
      const started = Date.now();
      audio.addEventListener("ended", () => {
        if (this.audio !== audio) return;
        if (Date.now() - started < TONE_RING_SECONDS * 1000) void audio.play().catch(() => onEnd());
        else this.finish(audio, onEnd);
      });
    } else {
      audio.addEventListener("ended", () => this.finish(audio, onEnd));
    }
    audio.addEventListener("error", () => this.finish(audio, onEnd));
    try {
      this.audio = audio;
      await audio.play();
      return true;
    } catch {
      // Blocked or unplayable: the alarm still shows, as it does with no sound at all.
      if (this.audio === audio) this.release();
      return false;
    }
  }

  stop(): void {
    this.audio?.pause();
    this.release();
  }

  /** A short sound for something that is not an alarm. */
  chime(volume: number): void {
    const key = "Glass";
    let audio = this.chimes.get(key);
    if (!audio) {
      audio = new Audio(`/tones/${key}.wav`);
      this.chimes.set(key, audio);
    }
    audio.volume = Math.min(Math.max(volume, 0), 1);
    audio.currentTime = 0;
    void audio.play().catch(() => {});
  }

  private finish(audio: HTMLAudioElement, onEnd: () => void): void {
    // Ignore a late callback from a player that has since been replaced or stopped.
    if (this.audio !== audio) return;
    this.release();
    onEnd();
  }

  private release(): void {
    this.audio = null;
    if (this.objectURL) URL.revokeObjectURL(this.objectURL);
    this.objectURL = null;
  }

  private async source(sound: AlarmSound): Promise<string | null> {
    switch (sound.kind) {
      case "silent":
        return null;
      case "adhan":
        return "/Adhan.m4a";
      case "tone":
        return `/tones/${sound.name}.wav`;
      case "custom": {
        if (!isTauri) return null;
        try {
          const { BaseDirectory, readFile } = await import("@tauri-apps/plugin-fs");
          const bytes = await readFile(`${CUSTOM_DIR}/${sound.fileName}`, { baseDir: BaseDirectory.AppData });
          this.objectURL = URL.createObjectURL(new Blob([bytes]));
          return this.objectURL;
        } catch {
          return null;
        }
      }
    }
  }
}

/**
 * Lets the user pick an audio file, checks that it plays, and copies it into the app's data folder
 * (replacing any earlier one), so the alarm keeps working if the original is moved.
 */
export async function importCustomSound(): Promise<AlarmSound | null> {
  if (!isTauri) return null;
  const { open } = await import("@tauri-apps/plugin-dialog");
  const { BaseDirectory, copyFile, mkdir, readDir, remove } = await import("@tauri-apps/plugin-fs");
  const picked = await open({
    multiple: false,
    filters: [{ name: "Audio", extensions: ["mp3", "m4a", "aac", "wav", "ogg", "flac"] }],
  });
  if (typeof picked !== "string") return null;
  const fileName = picked.split(/[\\/]/).pop() ?? "sound";

  await mkdir(CUSTOM_DIR, { baseDir: BaseDirectory.AppData, recursive: true });
  for (const entry of await readDir(CUSTOM_DIR, { baseDir: BaseDirectory.AppData })) {
    await remove(`${CUSTOM_DIR}/${entry.name}`, { baseDir: BaseDirectory.AppData });
  }
  await copyFile(picked, `${CUSTOM_DIR}/${fileName}`, { toPathBaseDir: BaseDirectory.AppData });
  return { kind: "custom", fileName };
}

export async function importedSoundName(): Promise<string | null> {
  if (!isTauri) return null;
  try {
    const { BaseDirectory, readDir } = await import("@tauri-apps/plugin-fs");
    const entries = await readDir(CUSTOM_DIR, { baseDir: BaseDirectory.AppData });
    return entries.find((entry) => entry.isFile && !entry.name.startsWith("."))?.name ?? null;
  } catch {
    return null;
  }
}
