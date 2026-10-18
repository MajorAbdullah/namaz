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
  private generation = 0;

  async play(sound: AlarmSound, volume: number, onEnd: () => void): Promise<boolean> {
    this.stop();
    // Bumped by stop(), so an alarm dismissed while a source is still starting is not picked
    // up again by the fallback.
    const generation = this.generation;
    const sources = await this.sources(sound);
    for (let i = 0; i < sources.length; i++) {
      if (this.generation !== generation) return false;
      const outcome = await this.start(sound, sources[i], volume, onEnd, i < sources.length - 1);
      if (outcome !== "unsupported") return outcome === "playing";
    }
    return false;
  }

  /**
   * Starts one source. "unsupported" means the web view cannot decode it and the next source is
   * worth a try; it is only reported when there is a next one (`canFallBack`).
   */
  private async start(
    sound: AlarmSound,
    source: string,
    volume: number,
    onEnd: () => void,
    canFallBack: boolean,
  ): Promise<"playing" | "failed" | "unsupported"> {
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
    // While play() is pending, a decoding error is play()'s to report, so the fallback can run
    // without ending the alarm first.
    let pending = true;
    audio.addEventListener("error", () => {
      if (!pending) this.finish(audio, onEnd);
    });
    try {
      this.audio = audio;
      await audio.play();
      pending = false;
      return "playing";
    } catch (error) {
      pending = false;
      // Stopped or replaced while starting: nothing more to try.
      if (this.audio !== audio) return "failed";
      this.release(!canFallBack);
      // Only a format the web view cannot decode (WebKitGTK without AAC) is worth another try;
      // a refusal to play without a click, say, would refuse every source alike.
      return canFallBack && cannotDecode(error, audio) ? "unsupported" : "failed";
    }
  }

  stop(): void {
    this.generation++;
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

  private release(revoke = true): void {
    this.audio = null;
    if (!revoke) return;
    if (this.objectURL) URL.revokeObjectURL(this.objectURL);
    this.objectURL = null;
  }

  /** The files to try for a sound, best first. */
  private async sources(sound: AlarmSound): Promise<string[]> {
    switch (sound.kind) {
      case "silent":
        return [];
      case "adhan":
        // WebKitGTK on Linux often has no AAC decoder; the Ogg copy is for it.
        return ["/Adhan.m4a", "/Adhan.ogg"];
      case "tone":
        return [`/tones/${sound.name}.wav`];
      case "custom": {
        if (!isTauri) return [];
        try {
          const { BaseDirectory, readFile } = await import("@tauri-apps/plugin-fs");
          const bytes = await readFile(`${CUSTOM_DIR}/${sound.fileName}`, { baseDir: BaseDirectory.AppData });
          this.objectURL = URL.createObjectURL(new Blob([bytes]));
          return [this.objectURL];
        } catch {
          return [];
        }
      }
    }
  }
}

/** MediaError codes for a source the web view cannot decode. */
const MEDIA_ERR_DECODE = 3;
const MEDIA_ERR_SRC_NOT_SUPPORTED = 4;

function cannotDecode(error: unknown, audio: HTMLAudioElement): boolean {
  if (error instanceof Error && error.name === "NotSupportedError") return true;
  const code = audio.error?.code;
  return code === MEDIA_ERR_DECODE || code === MEDIA_ERR_SRC_NOT_SUPPORTED;
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
