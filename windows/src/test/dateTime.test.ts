import { afterEach, describe, expect, it, vi } from "vitest";
import { ClockFormat } from "../app/format";
import { hijriDateString, isRamadan } from "../core/hijriDate";
import { instantFromLocal, localParts, systemTimeZone } from "../core/time";

const RealDTF = Intl.DateTimeFormat;

/** Replace Intl.DateTimeFormat; `make` gets the real constructor's arguments and the real class. */
function stubDTF(make: (args: unknown[], Real: typeof Intl.DateTimeFormat) => unknown) {
  const fake = function (this: unknown, ...args: unknown[]) {
    return make(args, RealDTF);
  };
  vi.stubGlobal("Intl", { ...Intl, DateTimeFormat: fake });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("systemTimeZone", () => {
  for (const value of ["", undefined]) {
    it(`falls back to UTC when the zone is ${JSON.stringify(value)}`, () => {
      stubDTF(() => ({ resolvedOptions: () => ({ timeZone: value }) }));
      expect(systemTimeZone()).toBe("UTC");
    });
  }

  it("does not hand on Etc/Unknown, which cannot be used to format times", () => {
    stubDTF(() => ({ resolvedOptions: () => ({ timeZone: "Etc/Unknown" }) }));
    const zone = systemTimeZone();
    vi.unstubAllGlobals();
    // Safe behaviour: either the zone works, or the app fell back to UTC.
    expect(() => localParts(1_700_000_000, zone)).not.toThrow();
    const parts = localParts(1_700_000_000, zone);
    expect(Number.isNaN(parts.hour)).toBe(false);
    expect(Number.isNaN(instantFromLocal({ year: 2026, month: 1, day: 1 }, 12, 0, zone))).toBe(false);
  });
});

describe("hijri date without the Umm al-Qura calendar", () => {
  const noParts = () =>
    stubDTF(([locale, options], Real) => {
      const real = new Real(locale as string, options as Intl.DateTimeFormatOptions);
      const isIslamic = String(locale).includes("islamic");
      return {
        resolvedOptions: () => ({ ...real.resolvedOptions(), calendar: isIslamic ? "gregory" : "gregory" }),
        formatToParts: (d: Date) => (isIslamic ? [] : real.formatToParts(d)),
        format: (d: Date) => real.format(d),
      };
    });

  it("hijriDateString does not throw when the parts are missing", () => {
    noParts();
    expect(() => hijriDateString(1_760_000_000, "UTC")).not.toThrow();
  });

  it("hijriDateString gives a blank-ish value, not 'undefined' or NaN", () => {
    noParts();
    const text = hijriDateString(1_760_000_000, "UTC");
    expect(text.trim()).toBe("");
    expect(text).not.toMatch(/undefined|NaN/);
  });

  it("isRamadan is false rather than throwing", () => {
    noParts();
    expect(isRamadan({ year: 2026, month: 3, day: 1 }, "UTC")).toBe(false);
  });
});

describe("ClockFormat system style", () => {
  const withCycle = (hourCycle: string) =>
    stubDTF(() => ({ resolvedOptions: () => ({ hourCycle }) }));

  it("uses 24 hour for h23", () => {
    withCycle("h23");
    expect(new ClockFormat("system", "UTC").uses24Hour).toBe(true);
  });

  it("uses 12 hour for h12", () => {
    withCycle("h12");
    expect(new ClockFormat("system", "UTC").uses24Hour).toBe(false);
  });
});
