"use client";

import { useState, useTransition } from "react";
import { CalendarOff } from "lucide-react";
import { LogoMark } from "@/components/brand/mark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { clearAway, setAway } from "@/lib/actions/social";

export function AwayControl({
  teamId,
  todayISO,
  current,
}: {
  teamId: string;
  todayISO: string;
  current: { id: string; startsOn: string; endsOn: string; note: string | null } | null;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (current) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-ground-raised/60 px-4 py-3">
        <LogoMark size={22} state="away" className="text-ink" />
        <p className="flex-1 text-sm text-ink">
          You&rsquo;re away {current.startsOn === current.endsOn ? `on ${current.startsOn}` : `${current.startsOn} → ${current.endsOn}`}
          {current.note && <span className="text-soft"> · {current.note}</span>}
        </p>
        <Button
          variant="secondary"
          size="sm"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const res = await clearAway({ awayId: current.id });
              if (!res.ok) setError(res.error);
            })
          }
        >
          I&rsquo;m back
        </Button>
        {error && <p role="alert" className="w-full text-xs text-danger">{error}</p>}
      </div>
    );
  }

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <CalendarOff /> Set yourself away
      </Button>
    );
  }

  return (
    <form
      className="rounded-2xl border border-line bg-ground-raised/60 p-4 space-y-3"
      action={(fd) =>
        startTransition(async () => {
          setError(null);
          const res = await setAway({
            teamId,
            startsOn: String(fd.get("startsOn") ?? ""),
            endsOn: String(fd.get("endsOn") ?? ""),
            note: String(fd.get("note") ?? ""),
          });
          if (res.ok) setOpen(false);
          else setError(res.error);
        })
      }
    >
      <p className="text-sm text-ink">No reminders while you&rsquo;re away, and nobody waits on your check-in.</p>
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1">
          <span className="kicker text-[10px]">From</span>
          <Input type="date" name="startsOn" defaultValue={todayISO} min={todayISO} required className="h-11 font-mono text-sm" />
        </label>
        <label className="space-y-1">
          <span className="kicker text-[10px]">Until</span>
          <Input type="date" name="endsOn" defaultValue={todayISO} min={todayISO} required className="h-11 font-mono text-sm" />
        </label>
      </div>
      <Input name="note" maxLength={140} placeholder="Note (optional) — e.g. Conference" className="h-11 text-sm" />
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
      <div className="flex gap-2 justify-end">
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={pending}>
          Set away
        </Button>
      </div>
    </form>
  );
}
