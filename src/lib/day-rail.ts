import { formatInTimeZone } from "date-fns-tz";
import { localDate, windowFor, windowStatus } from "@/lib/time";

// The day rail: every teammate placed on one 24h axis by *their* local time
// of day. Because the check-in window is defined in each member's local time,
// the window is the same band for everyone — people slide into it as the
// earth turns. Pure; the client re-runs it every minute.

export type RailStatus = "done" | "away" | "open" | "before" | "missed" | "asleep";

export type RailMemberInput = {
  userId: string;
  tz: string;
  done: boolean;
  away: boolean;
};

export type RailSchedule = {
  /** "HH:mm" or "HH:mm:ss" local */
  windowOpenLocal: string;
  windowCloseLocal: string;
};

export type RailPosition = {
  userId: string;
  /** 0 ≤ hour < 24, fractional */
  localHour: number;
  /** "07:40" */
  localTime: string;
  /** "Auckland" */
  city: string;
  /** "+13:00" */
  utcOffset: string;
  status: RailStatus;
  /** Vertical lane so dots that would overlap stack instead. 0 = on the line. */
  lane: number;
};

export type RailBand = Array<{ from: number; to: number }>;

// Local night: before 06:00 or from 22:00. Only used when the window isn't open.
const NIGHT_START = 22;
const NIGHT_END = 6;
// Two dots closer than this (in hours) share a lane → stack.
const MIN_GAP_HOURS = 0.75;

export function cityFromTz(tz: string): string {
  const last = tz.split("/").pop() ?? tz;
  return last.replace(/_/g, " ");
}

function hm(t: string): string {
  return t.slice(0, 5);
}

function hours(t: string): number {
  const [h, m] = hm(t).split(":").map(Number);
  return h + m / 60;
}

// The window as one or two segments on the 0–24 axis (two when it wraps midnight).
export function windowBand(s: RailSchedule | null): RailBand {
  if (!s) return [];
  const from = hours(s.windowOpenLocal);
  const to = hours(s.windowCloseLocal);
  if (to > from) return [{ from, to }];
  return [
    { from, to: 24 },
    { from: 0, to },
  ].filter((seg) => seg.to > seg.from);
}

export function memberStatus(
  now: Date,
  tz: string,
  s: RailSchedule | null,
  flags: { done: boolean; away: boolean },
): RailStatus {
  if (flags.done) return "done";
  if (flags.away) return "away";

  const localHour = hourIn(now, tz);
  const night = localHour >= NIGHT_START || localHour < NIGHT_END;
  if (!s) return night ? "asleep" : "before";

  const today = localDate(now, tz);
  const open = hm(s.windowOpenLocal);
  const close = hm(s.windowCloseLocal);
  const w = windowFor(today, open, close, tz);
  let status = windowStatus(now, w);

  // A window that wraps midnight may still be open from yesterday.
  if (status === "before") {
    const y = new Date(`${today}T12:00:00Z`);
    y.setUTCDate(y.getUTCDate() - 1);
    const yesterday = windowFor(y.toISOString().slice(0, 10), open, close, tz);
    if (windowStatus(now, yesterday) === "open") status = "open";
  }

  if (status === "open") return "open";
  if (night) return "asleep";
  return status === "before" ? "before" : "missed";
}

function hourIn(now: Date, tz: string): number {
  const [h, m] = formatInTimeZone(now, tz, "HH:mm").split(":").map(Number);
  return h + m / 60;
}

export function railPositions(
  members: RailMemberInput[],
  schedule: RailSchedule | null,
  now: Date,
): RailPosition[] {
  const placed = members
    .map((m) => ({
      userId: m.userId,
      localHour: hourIn(now, m.tz),
      localTime: formatInTimeZone(now, m.tz, "HH:mm"),
      city: cityFromTz(m.tz),
      utcOffset: formatInTimeZone(now, m.tz, "xxx"),
      status: memberStatus(now, m.tz, schedule, m),
      lane: 0,
    }))
    .sort((a, b) => a.localHour - b.localHour || a.userId.localeCompare(b.userId));

  // Greedy lane assignment: each lane remembers the last hour it used.
  const laneEnds: number[] = [];
  for (const p of placed) {
    let lane = laneEnds.findIndex((end) => p.localHour - end >= MIN_GAP_HOURS);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(p.localHour);
    } else {
      laneEnds[lane] = p.localHour;
    }
    p.lane = lane;
  }
  return placed;
}

export type RailCounts = Record<RailStatus, number>;

export function railCounts(positions: Pick<RailPosition, "status">[]): RailCounts {
  const counts: RailCounts = { done: 0, away: 0, open: 0, before: 0, missed: 0, asleep: 0 };
  for (const p of positions) counts[p.status]++;
  return counts;
}
