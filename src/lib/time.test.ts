import { describe, expect, it } from "vitest";
import {
  PRESET_RRULES,
  isValidTimeZone,
  localDate,
  localToUtc,
  nextOccurrenceDate,
  occursOn,
  windowFor,
  windowStatus,
} from "./time";

// Zones chosen to cover: negative offset with DST (LA), positive with DST
// (Berlin), positive-non-integer (Kolkata, +5:30), always-UTC.
const ZONES = ["America/Los_Angeles", "Europe/Berlin", "Asia/Kolkata", "UTC"] as const;

describe("localDate", () => {
  it("gives the wall-clock date in each tz", () => {
    // Same UTC instant, four different local dates possible.
    const instant = new Date("2026-03-08T03:30:00Z");
    expect(localDate(instant, "UTC")).toBe("2026-03-08");
    // 2026-03-08 03:30 UTC is 2026-03-07 19:30 in LA (still on standard time).
    expect(localDate(instant, "America/Los_Angeles")).toBe("2026-03-07");
    expect(localDate(instant, "Europe/Berlin")).toBe("2026-03-08");
    expect(localDate(instant, "Asia/Kolkata")).toBe("2026-03-08");
  });
});

describe("localToUtc", () => {
  it("round-trips for every zone", () => {
    for (const tz of ZONES) {
      const utc = localToUtc("2026-05-15", "09:00", tz);
      expect(localDate(utc, tz)).toBe("2026-05-15");
    }
  });

  it("handles the US DST spring-forward correctly", () => {
    // 2026-03-08 is DST start in the US: 02:00 local jumps to 03:00.
    // 09:00 local on that day is 16:00 UTC (PDT = UTC-7), not 17:00 (PST).
    const utc = localToUtc("2026-03-08", "09:00", "America/Los_Angeles");
    expect(utc.toISOString()).toBe("2026-03-08T16:00:00.000Z");
    // The day before is still PST (UTC-8), so 09:00 = 17:00 UTC.
    const utcPrev = localToUtc("2026-03-07", "09:00", "America/Los_Angeles");
    expect(utcPrev.toISOString()).toBe("2026-03-07T17:00:00.000Z");
  });
});

describe("windowFor", () => {
  it("shrinks by one hour when the window straddles DST spring-forward", () => {
    // A 09:00–10:00 local window on the DST day. Between 09:00 and 10:00
    // local, no jump happens, so it's still one hour. But a 01:00–03:00
    // window spans the missing 02:00→03:00 hour and is effectively 1 hour.
    const w = windowFor("2026-03-08", "01:00", "03:00", "America/Los_Angeles");
    const durationMs = w.closeAt.getTime() - w.openAt.getTime();
    expect(durationMs).toBe(60 * 60 * 1000); // one hour of real time
  });

  it("wraps past midnight when close <= open", () => {
    const w = windowFor("2026-05-15", "22:00", "02:00", "Europe/Berlin");
    // Open 22:00 Berlin = 20:00 UTC. Close is next day 02:00 Berlin = 00:00 UTC next day.
    expect(w.openAt.toISOString()).toBe("2026-05-15T20:00:00.000Z");
    expect(w.closeAt.toISOString()).toBe("2026-05-16T00:00:00.000Z");
    expect(w.closeAt > w.openAt).toBe(true);
  });
});

describe("windowStatus", () => {
  const w = {
    openAt: new Date("2026-05-15T14:00:00Z"),
    closeAt: new Date("2026-05-15T18:00:00Z"),
  };
  it("classifies correctly", () => {
    expect(windowStatus(new Date("2026-05-15T13:59:59Z"), w)).toBe("before");
    expect(windowStatus(new Date("2026-05-15T14:00:00Z"), w)).toBe("open");
    expect(windowStatus(new Date("2026-05-15T17:59:59Z"), w)).toBe("open");
    expect(windowStatus(new Date("2026-05-15T18:00:00Z"), w)).toBe("closed");
  });
});

describe("nextOccurrenceDate", () => {
  it("finds today's date for a daily rule", () => {
    // Berlin morning: the current local date should qualify.
    const from = new Date("2026-05-15T05:00:00Z"); // 07:00 Berlin
    expect(nextOccurrenceDate(PRESET_RRULES.daily, from, "Europe/Berlin")).toBe("2026-05-15");
  });

  it("skips weekends for weekdays rule", () => {
    // 2026-05-16 is a Saturday. Ask on Sat morning → next is Monday.
    const from = new Date("2026-05-16T14:00:00Z");
    expect(nextOccurrenceDate(PRESET_RRULES.weekdays, from, "UTC")).toBe("2026-05-18");
  });

  it("MWF rule from a Tuesday returns the coming Wednesday", () => {
    // 2026-05-12 is a Tuesday.
    const from = new Date("2026-05-12T00:00:00Z");
    expect(nextOccurrenceDate(PRESET_RRULES.mwf, from, "UTC")).toBe("2026-05-13");
  });
});

describe("occursOn", () => {
  // 2026-05-11 Mon · 12 Tue · 13 Wed · 14 Thu · 15 Fri · 16 Sat · 17 Sun
  it("daily matches every date, including weekends", () => {
    for (const d of ["2026-05-11", "2026-05-14", "2026-05-16", "2026-05-17"]) {
      expect(occursOn(PRESET_RRULES.daily, d)).toBe(true);
    }
  });

  it("MWF matches Mon/Wed/Fri and nothing else — the bug that made presets decorative", () => {
    expect(occursOn(PRESET_RRULES.mwf, "2026-05-11")).toBe(true); // Mon
    expect(occursOn(PRESET_RRULES.mwf, "2026-05-12")).toBe(false); // Tue
    expect(occursOn(PRESET_RRULES.mwf, "2026-05-13")).toBe(true); // Wed
    expect(occursOn(PRESET_RRULES.mwf, "2026-05-14")).toBe(false); // Thu
    expect(occursOn(PRESET_RRULES.mwf, "2026-05-15")).toBe(true); // Fri
    expect(occursOn(PRESET_RRULES.mwf, "2026-05-16")).toBe(false); // Sat
  });

  it("weekdays skips the weekend", () => {
    expect(occursOn(PRESET_RRULES.weekdays, "2026-05-15")).toBe(true); // Fri
    expect(occursOn(PRESET_RRULES.weekdays, "2026-05-16")).toBe(false); // Sat
    expect(occursOn(PRESET_RRULES.weekdays, "2026-05-17")).toBe(false); // Sun
    expect(occursOn(PRESET_RRULES.weekdays, "2026-05-18")).toBe(true); // Mon
  });

  it("weekly matches only its weekday", () => {
    expect(occursOn(PRESET_RRULES.weekly, "2026-05-11")).toBe(true); // Mon
    expect(occursOn(PRESET_RRULES.weekly, "2026-05-13")).toBe(false); // Wed
    expect(occursOn(PRESET_RRULES.weekly, "2026-05-18")).toBe(true); // next Mon
  });

  // The date string is the contract: two members on opposite sides of the
  // date line must agree on whether a given local date is a standup day.
  it("agrees with nextOccurrenceDate across far-apart zones", () => {
    const from = new Date("2026-05-12T23:00:00Z"); // Tue 23:00 UTC
    for (const tz of ["Pacific/Auckland", "America/Los_Angeles", "UTC"]) {
      const next = nextOccurrenceDate(PRESET_RRULES.mwf, from, tz);
      expect(next && occursOn(PRESET_RRULES.mwf, next)).toBe(true);
    }
  });

  // DST changes the UTC offset but never which calendar date it is.
  it("is unaffected by a DST boundary", () => {
    // Europe/Berlin springs forward on 2026-03-29 (a Sunday).
    expect(occursOn(PRESET_RRULES.weekdays, "2026-03-27")).toBe(true); // Fri before
    expect(occursOn(PRESET_RRULES.weekdays, "2026-03-29")).toBe(false); // Sun
    expect(occursOn(PRESET_RRULES.weekdays, "2026-03-30")).toBe(true); // Mon after
  });

  it("handles a custom rule", () => {
    expect(occursOn("FREQ=WEEKLY;BYDAY=TU,TH", "2026-05-12")).toBe(true);
    expect(occursOn("FREQ=WEEKLY;BYDAY=TU,TH", "2026-05-13")).toBe(false);
  });
});

describe("isValidTimeZone", () => {
  it("accepts IANA names and rejects junk", () => {
    expect(isValidTimeZone("Europe/Bucharest")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
  });
});
