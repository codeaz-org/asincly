import { describe, expect, it } from "vitest";
import { cityFromTz, memberStatus, railCounts, railPositions, windowBand } from "./day-rail";

const NINE_TO_ELEVEN = { windowOpenLocal: "09:00:00", windowCloseLocal: "11:00:00" };
const flags = { done: false, away: false };

describe("windowBand", () => {
  it("is one segment for a normal window", () => {
    expect(windowBand(NINE_TO_ELEVEN)).toEqual([{ from: 9, to: 11 }]);
  });
  it("splits a window that wraps midnight", () => {
    expect(windowBand({ windowOpenLocal: "22:30", windowCloseLocal: "01:00" })).toEqual([
      { from: 22.5, to: 24 },
      { from: 0, to: 1 },
    ]);
  });
  it("is empty without a schedule", () => {
    expect(windowBand(null)).toEqual([]);
  });
});

describe("memberStatus", () => {
  // 2026-05-15 13:30 UTC — the demo meeting time from the landing page.
  const now = new Date("2026-05-15T13:30:00Z");

  it("puts four zones in the right state", () => {
    // New York 09:30 (EDT) → inside the window.
    expect(memberStatus(now, "America/New_York", NINE_TO_ELEVEN, flags)).toBe("open");
    // Berlin 15:30 → window already closed today.
    expect(memberStatus(now, "Europe/Berlin", NINE_TO_ELEVEN, flags)).toBe("missed");
    // Los Angeles 06:30 → morning, window later.
    expect(memberStatus(now, "America/Los_Angeles", NINE_TO_ELEVEN, flags)).toBe("before");
    // Tokyo 22:30 → night.
    expect(memberStatus(now, "Asia/Tokyo", NINE_TO_ELEVEN, flags)).toBe("asleep");
    // Kolkata 19:00 (+5:30) → evening, window over.
    expect(memberStatus(now, "Asia/Kolkata", NINE_TO_ELEVEN, flags)).toBe("missed");
  });

  it("done and away win over the window", () => {
    expect(memberStatus(now, "Asia/Tokyo", NINE_TO_ELEVEN, { done: true, away: true })).toBe("done");
    expect(memberStatus(now, "America/New_York", NINE_TO_ELEVEN, { done: false, away: true })).toBe(
      "away",
    );
  });

  it("follows DST: 09:30 local is open on both sides of the US spring-forward", () => {
    // 2026-03-07 is PST (UTC-8): 09:30 local = 17:30 UTC.
    expect(
      memberStatus(new Date("2026-03-07T17:30:00Z"), "America/Los_Angeles", NINE_TO_ELEVEN, flags),
    ).toBe("open");
    // 2026-03-09 is PDT (UTC-7): 09:30 local = 16:30 UTC; 17:30 UTC is 10:30, still open.
    expect(
      memberStatus(new Date("2026-03-09T16:30:00Z"), "America/Los_Angeles", NINE_TO_ELEVEN, flags),
    ).toBe("open");
    // …and 08:30 PDT (15:30 UTC) is before the window, not inside it.
    expect(
      memberStatus(new Date("2026-03-09T15:30:00Z"), "America/Los_Angeles", NINE_TO_ELEVEN, flags),
    ).toBe("before");
  });

  it("keeps a midnight-wrapping window open after midnight", () => {
    const late = { windowOpenLocal: "22:00", windowCloseLocal: "02:00" };
    // 01:00 UTC → still inside yesterday's 22:00–02:00 window.
    expect(memberStatus(new Date("2026-05-15T01:00:00Z"), "UTC", late, flags)).toBe("open");
    // 23:00 UTC → inside today's window.
    expect(memberStatus(new Date("2026-05-15T23:00:00Z"), "UTC", late, flags)).toBe("open");
    // 03:00 UTC → closed and night.
    expect(memberStatus(new Date("2026-05-15T03:00:00Z"), "UTC", late, flags)).toBe("asleep");
  });

  it("uses night/day when there is no schedule", () => {
    expect(memberStatus(now, "Asia/Tokyo", null, flags)).toBe("asleep");
    expect(memberStatus(now, "Europe/Berlin", null, flags)).toBe("before");
  });
});

describe("railPositions", () => {
  const now = new Date("2026-05-15T13:30:00Z");

  it("places members by local hour with offsets and cities", () => {
    // Sorted by local hour: Auckland 01:30, LA 06:30, New York 09:30.
    const [akl, la, ny] = railPositions(
      [
        { userId: "akl", tz: "Pacific/Auckland", done: true, away: false },
        { userId: "ny", tz: "America/New_York", done: false, away: false },
        { userId: "la", tz: "America/Los_Angeles", done: false, away: false },
      ],
      NINE_TO_ELEVEN,
      now,
    );
    expect(akl).toMatchObject({ userId: "akl", localTime: "01:30", utcOffset: "+12:00", status: "done" });
    expect(la).toMatchObject({ localTime: "06:30", localHour: 6.5, city: "Los Angeles" });
    expect(ny).toMatchObject({ localTime: "09:30", status: "open" });
  });

  it("stacks members that would overlap into lanes", () => {
    const rows = railPositions(
      [
        { userId: "a", tz: "Europe/London", done: false, away: false },
        { userId: "b", tz: "Europe/Lisbon", done: false, away: false },
        { userId: "c", tz: "Europe/Berlin", done: false, away: false },
        { userId: "d", tz: "Asia/Tokyo", done: false, away: false },
      ],
      NINE_TO_ELEVEN,
      now,
    );
    const lane = Object.fromEntries(rows.map((r) => [r.userId, r.lane]));
    // London and Lisbon share 14:30 → different lanes; Berlin is an hour
    // later and Tokyo far away → back on the line.
    expect(new Set([lane.a, lane.b])).toEqual(new Set([0, 1]));
    expect(lane.c).toBe(0);
    expect(lane.d).toBe(0);
  });

  it("counts statuses", () => {
    const rows = railPositions(
      [
        { userId: "a", tz: "America/New_York", done: false, away: false },
        { userId: "b", tz: "Asia/Tokyo", done: true, away: false },
      ],
      NINE_TO_ELEVEN,
      now,
    );
    expect(railCounts(rows)).toMatchObject({ open: 1, done: 1, asleep: 0 });
  });
});

describe("cityFromTz", () => {
  it("uses the last segment", () => {
    expect(cityFromTz("America/Argentina/Buenos_Aires")).toBe("Buenos Aires");
    expect(cityFromTz("UTC")).toBe("UTC");
  });
});
