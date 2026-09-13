import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { RRule } from "rrule";

// ────────── Building blocks ──────────

// Local ISO date (yyyy-MM-dd) for `at` in `tz`. Everything else in the
// product ("today's occurrence", "your window is open") derives from this,
// so all callers see the same wall-clock date the user does.
export function localDate(at: Date, tz: string): string {
  return formatInTimeZone(at, tz, "yyyy-MM-dd");
}

// Convert a wall-clock (yyyy-MM-dd, HH:mm[:ss]) in tz to a UTC Date.
// DST-safe: date-fns-tz picks the correct offset for that instant in tz.
export function localToUtc(dateISO: string, timeHM: string, tz: string): Date {
  const time = timeHM.length === 5 ? `${timeHM}:00` : timeHM;
  return fromZonedTime(`${dateISO}T${time}`, tz);
}

// ────────── Window ──────────

export type Window = {
  /** UTC instant the window opens. */
  openAt: Date;
  /** UTC instant the window closes. Guaranteed > openAt (handles wrap-past-midnight). */
  closeAt: Date;
};

// Window for `date` (in member tz) between openLocal ("HH:mm") and closeLocal.
// If closeLocal <= openLocal, the window wraps to the next local day.
export function windowFor(
  dateISO: string,
  openLocal: string,
  closeLocal: string,
  tz: string,
): Window {
  const openAt = localToUtc(dateISO, openLocal, tz);
  let closeAt = localToUtc(dateISO, closeLocal, tz);
  if (closeAt <= openAt) {
    const [y, m, d] = dateISO.split("-").map(Number);
    const next = new Date(Date.UTC(y, m - 1, d + 1));
    const nextISO = next.toISOString().slice(0, 10);
    closeAt = localToUtc(nextISO, closeLocal, tz);
  }
  return { openAt, closeAt };
}

export type WindowStatus = "before" | "open" | "closed";

export function windowStatus(at: Date, w: Window): WindowStatus {
  if (at < w.openAt) return "before";
  if (at >= w.closeAt) return "closed";
  return "open";
}

// ────────── Schedules ──────────

// Anchor RRULE expansion to a fixed date in the past. Callers only care
// about which local dates match the pattern, not what DTSTART was.
const ANCHOR = new Date(Date.UTC(2020, 0, 1));

// Next occurrence date (yyyy-MM-dd in member tz) at or after `from` that
// satisfies the RRULE. RRULEs are stored as-is and treated as local calendar
// rules — we normalize by comparing local-date strings, not UTC instants.
export function nextOccurrenceDate(
  rrule: string,
  from: Date,
  tz: string,
): string | null {
  const opts = RRule.parseString(rrule);
  const rule = new RRule({ ...opts, dtstart: ANCHOR });
  const fromLocalISO = localDate(from, tz);
  const yearLater = new Date(from.getTime() + 366 * 24 * 3600 * 1000);
  const candidates = rule.between(
    new Date(`${fromLocalISO}T00:00:00Z`),
    yearLater,
    true,
  );
  for (const c of candidates) {
    const iso = c.toISOString().slice(0, 10);
    if (iso >= fromLocalISO) return iso;
  }
  return null;
}

// ────────── Convenience presets ──────────

export const PRESET_RRULES = {
  daily: "FREQ=DAILY",
  weekdays: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
  mwf: "FREQ=WEEKLY;BYDAY=MO,WE,FR",
  weekly: "FREQ=WEEKLY;BYDAY=MO",
} as const;

export type PresetKey = keyof typeof PRESET_RRULES;

// True for IANA zone names the runtime knows ("Europe/Bucharest", "UTC").
export function isValidTimeZone(tz: string): boolean {
  if (!tz || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
