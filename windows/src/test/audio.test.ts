import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AlarmPlayer } from "../platform/audio";

/** Stands in for HTMLAudioElement: each source either plays or rejects with a named error. */
class FakeAudio {
  static outcomes = new Map<string, string | null>();
  static made: FakeAudio[] = [];
  /** When set, the next play() returns this instead of settling at once. */
  static pending: Promise<void> | null = null;
  volume = 1;
  currentTime = 0;
  private listeners = new Map<string, (() => void)[]>();
  constructor(public src: string) {
    FakeAudio.made.push(this);
  }
  addEventListener(type: string, listener: () => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  emit(type: string) {
    for (const listener of this.listeners.get(type) ?? []) listener();
  }
  play(): Promise<void> {
    if (FakeAudio.pending) {
      const pending = FakeAudio.pending;
      FakeAudio.pending = null;
      return pending;
    }
    const failure = FakeAudio.outcomes.get(this.src) ?? null;
    if (!failure) return Promise.resolve();
    // A real element fires "error" as well as rejecting when it cannot decode the source.
    this.emit("error");
    return Promise.reject(Object.assign(new Error(failure), { name: failure }));
  }
  error: { code: number } | null = null;
  pause() {}
}

describe("the alarm player", () => {
  beforeEach(() => {
    FakeAudio.outcomes.clear();
    FakeAudio.made = [];
    FakeAudio.pending = null;
    vi.stubGlobal("Audio", FakeAudio);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("plays the adhan from the .m4a when it can", async () => {
    const onEnd = vi.fn();
    expect(await new AlarmPlayer().play({ kind: "adhan" }, 1, onEnd)).toBe(true);
    expect(FakeAudio.made.map((audio) => audio.src)).toEqual(["/Adhan.m4a"]);
    expect(onEnd).not.toHaveBeenCalled();
  });

  it("falls back to the Ogg copy when the .m4a cannot be decoded, without ending the alarm", async () => {
    FakeAudio.outcomes.set("/Adhan.m4a", "NotSupportedError");
    const onEnd = vi.fn();
    expect(await new AlarmPlayer().play({ kind: "adhan" }, 1, onEnd)).toBe(true);
    expect(FakeAudio.made.map((audio) => audio.src)).toEqual(["/Adhan.m4a", "/Adhan.ogg"]);
    expect(onEnd).not.toHaveBeenCalled();
    FakeAudio.made[1].emit("ended");
    expect(onEnd).toHaveBeenCalledOnce();
  });

  it("does not try the Ogg copy when playing without a click is refused", async () => {
    FakeAudio.outcomes.set("/Adhan.m4a", "NotAllowedError");
    expect(await new AlarmPlayer().play({ kind: "adhan" }, 1, vi.fn())).toBe(false);
    expect(FakeAudio.made).toHaveLength(1);
  });

  it("reports failure when neither source plays", async () => {
    FakeAudio.outcomes.set("/Adhan.m4a", "NotSupportedError");
    FakeAudio.outcomes.set("/Adhan.ogg", "NotSupportedError");
    expect(await new AlarmPlayer().play({ kind: "adhan" }, 1, vi.fn())).toBe(false);
    expect(FakeAudio.made).toHaveLength(2);
  });

  it("ends the alarm on an error after playback has started", async () => {
    const onEnd = vi.fn();
    await new AlarmPlayer().play({ kind: "adhan" }, 1, onEnd);
    FakeAudio.made[0].emit("error");
    expect(onEnd).toHaveBeenCalledOnce();
  });

  it("tries the Ogg copy for a media decode error, but not for any other failure", async () => {
    FakeAudio.outcomes.set("/Adhan.m4a", "AbortError");
    expect(await new AlarmPlayer().play({ kind: "adhan" }, 1, vi.fn())).toBe(false);
    expect(FakeAudio.made).toHaveLength(1);
  });

  it("does not start the Ogg copy when the alarm is stopped while the .m4a is starting", async () => {
    let reject: (error: Error) => void = () => {};
    FakeAudio.pending = new Promise<void>((_, r) => (reject = r));
    const player = new AlarmPlayer();
    const playing = player.play({ kind: "adhan" }, 1, vi.fn());
    await vi.waitFor(() => expect(FakeAudio.made).toHaveLength(1));
    player.stop();
    reject(Object.assign(new Error("NotSupportedError"), { name: "NotSupportedError" }));
    expect(await playing).toBe(false);
    expect(FakeAudio.made.map((audio) => audio.src)).toEqual(["/Adhan.m4a"]);
  });

  it("lets a new alarm replace one whose .m4a is still starting, without the old one falling back", async () => {
    let reject: (error: Error) => void = () => {};
    FakeAudio.pending = new Promise<void>((_, r) => (reject = r));
    const player = new AlarmPlayer();
    const first = player.play({ kind: "adhan" }, 1, vi.fn());
    await vi.waitFor(() => expect(FakeAudio.made).toHaveLength(1));
    const second = player.play({ kind: "tone", name: "Glass" }, 1, vi.fn());
    reject(Object.assign(new Error("NotSupportedError"), { name: "NotSupportedError" }));
    expect(await first).toBe(false);
    expect(await second).toBe(true);
    expect(FakeAudio.made.map((audio) => audio.src)).toEqual(["/Adhan.m4a", "/tones/Glass.wav"]);
  });
});
