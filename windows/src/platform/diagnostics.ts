import { type Diagnostics, NO_DIAGNOSTICS } from "../app";
import { isTauri } from "./runtime";

/**
 * Switches for trying the app without waiting for a real prayer time, read from the environment
 * (or from the address in a browser):
 *
 *     NAMAZ_FAKE_NOW=2026-10-04T18:15:50+05:00   start the clock at this instant
 *     NAMAZ_TZ=Asia/Karachi                      use this time zone instead of the computer's
 *     NAMAZ_MUTE=1                               play alarm sounds at zero volume
 *
 * Setting any of them also keeps the run away from the user's real settings.
 */
export interface DiagnosticsInput {
  fakeNow?: string | null;
  timeZone?: string | null;
  mute?: boolean;
}

export function parseDiagnostics(input: DiagnosticsInput, realNowMs = Date.now()): Diagnostics {
  const diagnostics: Diagnostics = { ...NO_DIAGNOSTICS };
  if (input.fakeNow) {
    const at = Date.parse(input.fakeNow);
    if (Number.isNaN(at)) {
      console.warn(`Ignoring NAMAZ_FAKE_NOW: ${input.fakeNow} is not an ISO 8601 date and time`);
    } else {
      diagnostics.clockOffset = (at - realNowMs) / 1000;
      diagnostics.isActive = true;
    }
  }
  if (input.timeZone) {
    diagnostics.timeZone = input.timeZone;
    diagnostics.isActive = true;
  }
  if (input.mute) {
    diagnostics.mutesSound = true;
    diagnostics.isActive = true;
  }
  return diagnostics;
}

export async function readDiagnostics(): Promise<Diagnostics> {
  if (isTauri) {
    const { invoke } = await import("@tauri-apps/api/core");
    const env = await invoke<{ fakeNow: string | null; timeZone: string | null; mute: boolean }>("diagnostics");
    return parseDiagnostics(env);
  }
  const params = new URLSearchParams(location.search);
  return parseDiagnostics({ fakeNow: params.get("fake"), timeZone: params.get("tz"), mute: params.has("mute") });
}
