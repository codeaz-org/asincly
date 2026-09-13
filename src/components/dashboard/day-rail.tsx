"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { LogoMark, type MarkState } from "@/components/brand/mark";
import { Avatar } from "@/components/ui/avatar";
import { PopoverContent, PopoverRoot, PopoverTrigger } from "@/components/ui/menu";
import { railCounts, railPositions, windowBand, type RailSchedule, type RailStatus } from "@/lib/day-rail";
import { displayName } from "@/lib/display";

export type RailMember = {
  userId: string;
  name: string | null;
  email: string;
  tz: string;
  done: boolean;
  away: boolean;
};

const STATUS_COPY: Record<RailStatus, string> = {
  done: "Checked in",
  open: "In their window",
  before: "Window opens later",
  missed: "Window closed",
  asleep: "Asleep",
  away: "Away",
};

const LEGEND: Array<{ state: MarkState; label: string }> = [
  { state: "done", label: "checked in" },
  { state: "open", label: "window open" },
  { state: "before", label: "later" },
  { state: "asleep", label: "asleep" },
];

const LANE_PX = 26;

// The signature element of Today: one 24h line, everyone placed at their
// own local time, the check-in window as an amber band. Recomputes every
// minute so people drift across it like the landing page's divider.
export function DayRail({
  members,
  schedule,
  nowISO,
  viewerId,
}: {
  members: RailMember[];
  schedule: RailSchedule | null;
  nowISO: string;
  viewerId: string;
}) {
  const [now, setNow] = useState(() => new Date(nowISO));
  const [showList, setShowList] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const byId = useMemo(() => new Map(members.map((m) => [m.userId, m])), [members]);
  const positions = useMemo(() => railPositions(members, schedule, now), [members, schedule, now]);
  const band = useMemo(() => windowBand(schedule), [schedule]);
  const counts = railCounts(positions);
  const lanes = Math.max(1, ...positions.map((p) => p.lane + 1));
  const viewer = positions.find((p) => p.userId === viewerId);

  return (
    <section aria-label="Where everyone is in their day" className="space-y-4">
      <div
        className="relative select-none"
        style={{ paddingTop: 8 + (lanes - 1) * LANE_PX, paddingBottom: 30 }}
      >
        {/* The line */}
        <div className="relative h-10">
          {/* Night at both ends of the local day */}
          <span aria-hidden className="absolute inset-y-1 left-0 rounded-l-lg bg-cold/[0.08]" style={{ width: `${(6 / 24) * 100}%` }} />
          <span aria-hidden className="absolute inset-y-1 right-0 rounded-r-lg bg-cold/[0.08]" style={{ width: `${(2 / 24) * 100}%` }} />
          <div aria-hidden className="absolute inset-x-0 top-1/2 h-px bg-line-strong" />
          {band.map((seg) => (
            <div
              key={seg.from}
              aria-hidden
              className="absolute top-1/2 -translate-y-1/2 h-10 rounded-lg bg-amber/[0.1] border-x border-amber/40"
              style={{ left: `${(seg.from / 24) * 100}%`, width: `${((seg.to - seg.from) / 24) * 100}%` }}
            >
              <span className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 bg-amber shadow-[0_0_14px_oklch(0.78_0.15_60/0.6)]" />
            </div>
          ))}

          {viewer && (
            <span
              aria-hidden
              className="absolute top-1/2 h-14 w-px -translate-y-1/2 bg-ink/20"
              style={{ left: `${(viewer.localHour / 24) * 100}%` }}
            />
          )}

          {positions.map((p) => {
            const m = byId.get(p.userId);
            if (!m) return null;
            const name = displayName(m.name, m.email);
            const isViewer = p.userId === viewerId;
            return (
              <PopoverRoot key={p.userId}>
                <PopoverTrigger
                  aria-label={`${name}, ${p.localTime} in ${p.city}: ${STATUS_COPY[p.status]}`}
                  className={`absolute grid place-items-center rounded-full text-ink outline-none focus-visible:ring-2 focus-visible:ring-amber transition-[left,bottom] duration-700 ease-out hover:scale-125 ${
                    isViewer ? "size-7 bg-ground ring-1 ring-amber/60" : "size-6 bg-ground"
                  }`}
                  style={{
                    left: `${(p.localHour / 24) * 100}%`,
                    bottom: `calc(50% + ${p.lane * LANE_PX}px)`,
                    transform: "translate(-50%, 50%)",
                  }}
                >
                  <LogoMark size={isViewer ? 20 : 18} state={p.status} />
                </PopoverTrigger>
                <PopoverContent align="center" className="w-60 p-3">
                  <div className="flex items-center gap-3">
                    <Avatar name={m.name} email={m.email} size={36} status={p.status} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink truncate">
                        {name}
                        {isViewer && <span className="ml-1.5 text-soft font-normal">(you)</span>}
                      </p>
                      <p className="text-xs text-soft">
                        <span className="font-mono tabular-nums text-ink">{p.localTime}</span> · {p.city}
                      </p>
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-soft">{STATUS_COPY[p.status]}</p>
                </PopoverContent>
              </PopoverRoot>
            );
          })}
        </div>

        {/* Hour ticks */}
        <div aria-hidden className="absolute inset-x-0 bottom-0 h-5 font-mono text-[10px] text-faint tabular-nums">
          {[0, 6, 12, 18, 24].map((h) => (
            <span
              key={h}
              className="absolute -translate-x-1/2 first:translate-x-0 last:-translate-x-full"
              style={{ left: `${(h / 24) * 100}%` }}
            >
              {String(h % 24).padStart(2, "0")}:00
            </span>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3">
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-soft">
          {LEGEND.map((l) => (
            <li key={l.state} className="inline-flex items-center gap-1.5 text-ink">
              <LogoMark size={13} state={l.state} />
              <span className="text-soft">{l.label}</span>
            </li>
          ))}
          {schedule && (
            <li className="inline-flex items-center gap-1.5">
              <span className="h-2 w-4 rounded-sm bg-amber/25 border-x border-amber/60" />
              window {schedule.windowOpenLocal.slice(0, 5)}–{schedule.windowCloseLocal.slice(0, 5)} local
            </li>
          )}
        </ul>
        <button
          type="button"
          onClick={() => setShowList((v) => !v)}
          aria-expanded={showList}
          className="inline-flex items-center gap-1 text-xs text-soft hover:text-ink transition"
        >
          Who&rsquo;s where
          <ChevronDown className={`size-3.5 transition-transform ${showList ? "rotate-180" : ""}`} />
        </button>
      </div>

      {showList && (
        <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-1 animate-rise-in">
          {[...positions]
            .sort((a, b) => order(a.status) - order(b.status) || a.localHour - b.localHour)
            .map((p) => {
              const m = byId.get(p.userId)!;
              return (
                <li key={p.userId} className="flex items-center gap-3 py-1.5">
                  <LogoMark size={14} state={p.status} className="text-ink" />
                  <span className="text-sm text-ink truncate flex-1">{displayName(m.name, m.email)}</span>
                  <span className="text-xs text-soft truncate">{p.city}</span>
                  <span className="font-mono text-xs tabular-nums text-ink w-11 text-right">{p.localTime}</span>
                </li>
              );
            })}
        </ul>
      )}

      <p className="sr-only">
        {counts.done} checked in, {counts.open} in their window, {counts.before} later today, {counts.asleep} asleep,{" "}
        {counts.away} away.
      </p>
    </section>
  );
}

function order(s: RailStatus): number {
  return ["open", "before", "done", "missed", "asleep", "away"].indexOf(s);
}
