import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { LogoMark, type MarkState } from "@/components/brand/mark";
import { buttonVariants } from "@/components/ui/button";
import type { AwayPeriod, MyCheckIn, Schedule } from "@/lib/queries";
import { dayLabel } from "@/lib/feed-view";

// The one primary action on Today. The mark mirrors the viewer's state.
export function YourCard({
  mine,
  state,
  schedule,
  away,
  checkInHref,
  viewerTz,
}: {
  mine: MyCheckIn;
  state: MarkState;
  schedule: Schedule | null;
  away: AwayPeriod | null;
  checkInHref: string;
  viewerTz: string;
}) {
  const copy = describe(mine, state, schedule, away, viewerTz);
  return (
    <section
      aria-label="Your check-in"
      className="relative overflow-hidden rounded-2xl border border-line bg-ground-raised/70 p-5 sm:p-6"
    >
      <span
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-20 size-64 rounded-full"
        style={{ background: "radial-gradient(circle, oklch(0.78 0.15 60 / 0.14), transparent 65%)" }}
      />
      <div className="relative flex flex-col sm:flex-row sm:items-center gap-5">
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <LogoMark size={48} state={state} className="text-ink" />
          <div className="min-w-0">
            <p className="text-lg font-semibold tracking-tight text-ink">{copy.headline}</p>
            <p className="text-sm text-soft">{copy.hint}</p>
          </div>
        </div>
        {copy.button && (
          <Link href={checkInHref} className={buttonVariants({ variant: copy.primary ? "primary" : "secondary", size: "lg" })}>
            {copy.button}
            <ArrowRight />
          </Link>
        )}
      </div>
    </section>
  );
}

function describe(
  mine: MyCheckIn,
  state: MarkState,
  schedule: Schedule | null,
  away: AwayPeriod | null,
  tz: string,
): { headline: string; hint: string; button: string | null; primary: boolean } {
  if (mine?.status === "submitted") {
    return {
      headline: "You're in.",
      hint: "Edit any time today — your team sees the latest version.",
      button: "Edit check-in",
      primary: false,
    };
  }
  if (away) {
    return {
      headline: "You're away.",
      hint: `Until ${dayLabel(away.endsOn)}. No reminders, nobody waits on you.`,
      button: "Check in anyway",
      primary: false,
    };
  }
  if (mine?.hasContent) {
    const saved = mine.updatedAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: tz });
    return { headline: "Your draft is waiting.", hint: `Autosaved at ${saved}. A minute to finish.`, button: "Continue", primary: true };
  }
  const window = schedule
    ? `${schedule.windowOpenLocal.slice(0, 5)}–${schedule.windowCloseLocal.slice(0, 5)}`
    : null;
  switch (state) {
    case "open":
      return { headline: "Your window is open.", hint: "Yesterday, today, blockers. Two minutes.", button: "Check in", primary: true };
    case "before":
      return {
        headline: "Good morning.",
        hint: window ? `Your window opens at ${window.slice(0, 5)}. You can check in early.` : "Check in whenever you're ready.",
        button: "Check in early",
        primary: true,
      };
    case "asleep":
      return { headline: "Rest up.", hint: window ? `Your window is ${window} your time.` : "Check in tomorrow morning.", button: "Check in", primary: false };
    default:
      return {
        headline: "You missed today's window.",
        hint: "Late is fine — your team still reads it.",
        button: "Check in",
        primary: true,
      };
  }
}
