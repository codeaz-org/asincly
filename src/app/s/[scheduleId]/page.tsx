import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { members, organizations, schedules, teams } from "@/db/schema";
import { updateSchedule } from "@/lib/actions/schedule";
import { requireUser } from "@/lib/session";
import { PRESET_RRULES } from "@/lib/time";

export default async function ScheduleEditPage({
  params,
}: {
  params: Promise<{ scheduleId: string }>;
}) {
  const { scheduleId } = await params;
  const user = await requireUser();

  const [row] = await db
    .select({
      id: schedules.id,
      name: schedules.name,
      rrule: schedules.rrule,
      windowOpenLocal: schedules.windowOpenLocal,
      windowCloseLocal: schedules.windowCloseLocal,
      active: schedules.active,
      teamName: teams.name,
      teamSlug: teams.slug,
      orgName: organizations.name,
      orgSlug: organizations.slug,
      role: members.role,
    })
    .from(schedules)
    .innerJoin(teams, eq(teams.id, schedules.teamId))
    .innerJoin(organizations, eq(organizations.id, teams.orgId))
    .innerJoin(
      members,
      and(eq(members.teamId, teams.id), eq(members.userId, user.id)),
    )
    .where(eq(schedules.id, scheduleId));

  if (!row) notFound();
  if (row.role !== "owner" && row.role !== "admin") notFound();

  const matchingPreset =
    Object.entries(PRESET_RRULES).find(([, r]) => r === row.rrule)?.[0] ?? "custom";

  const presets = [
    ["daily", "Every day"],
    ["weekdays", "Weekdays"],
    ["mwf", "M · W · F"],
    ["weekly", "Weekly"],
    ["custom", "Custom"],
  ] as const;

  return (
    <main className="min-h-dvh px-6 py-14 md:py-20 flex items-start justify-center">
      <div className="w-full max-w-xl space-y-10">
        <header className="space-y-3">
          <Link
            href={`/${row.orgSlug}/${row.teamSlug}`}
            className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-muted-foreground hover:text-foreground transition"
          >
            ← {row.orgName} · {row.teamName}
          </Link>
          <h1 className="text-4xl font-medium tracking-tight leading-none">
            Schedule.
          </h1>
        </header>

        <form action={updateSchedule} className="space-y-8">
          <input type="hidden" name="scheduleId" value={row.id} />

          <div className="space-y-2">
            <Label>Name</Label>
            <input
              id="name"
              name="name"
              defaultValue={row.name}
              required
              className="w-full h-12 rounded-md bg-white/[0.02] border border-white/10 px-4 text-base focus:outline-none focus:border-white/30 focus:bg-white/[0.04] transition"
            />
          </div>

          <div className="space-y-2">
            <Label>Cadence</Label>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              {presets.map(([val, label]) => (
                <label
                  key={val}
                  className="cursor-pointer relative rounded-md border border-white/10 px-3 py-3 text-center text-sm hover:bg-white/[0.03] transition has-[input:checked]:border-accent has-[input:checked]:bg-accent/[0.08] has-[input:checked]:text-foreground"
                >
                  <input
                    type="radio"
                    name="preset"
                    value={val}
                    defaultChecked={val === matchingPreset}
                    className="sr-only"
                  />
                  {label}
                </label>
              ))}
            </div>
            <input
              name="customRrule"
              defaultValue={matchingPreset === "custom" ? row.rrule : ""}
              placeholder="Custom RRULE — e.g. FREQ=WEEKLY;BYDAY=TU,TH"
              className="w-full h-11 rounded-md bg-white/[0.02] border border-white/10 px-3 text-sm font-mono placeholder:text-muted-foreground/50 focus:outline-none focus:border-white/30 focus:bg-white/[0.04] transition"
            />
          </div>

          <div className="space-y-2">
            <Label>Window (local time)</Label>
            <div className="grid grid-cols-2 gap-3">
              <TimeField
                name="windowOpen"
                label="Opens"
                defaultValue={row.windowOpenLocal.slice(0, 5)}
              />
              <TimeField
                name="windowClose"
                label="Closes"
                defaultValue={row.windowCloseLocal.slice(0, 5)}
              />
            </div>
          </div>

          <label className="flex items-center justify-between rounded-md border border-white/10 px-4 py-3 cursor-pointer hover:border-white/20 transition">
            <span className="text-sm">
              <span className="font-medium">Active</span>
              <span className="ml-2 text-muted-foreground">
                Reminders and digests fire when on.
              </span>
            </span>
            <input
              type="checkbox"
              name="active"
              defaultChecked={row.active}
              value="on"
              className="size-4 accent-emerald-400"
            />
          </label>

          <div className="flex gap-3 pt-4 border-t border-border">
            <button
              type="submit"
              className="h-11 px-6 rounded-md bg-foreground text-primary-foreground text-sm font-medium hover:bg-foreground/90 active:scale-[0.99] transition"
            >
              Save changes
            </button>
            <Link
              href={`/${row.orgSlug}/${row.teamSlug}`}
              className="h-11 px-4 rounded-md text-sm text-muted-foreground hover:text-foreground inline-flex items-center transition"
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </main>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="block text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
      {children}
    </span>
  );
}

function TimeField({
  name,
  label,
  defaultValue,
}: {
  name: string;
  label: string;
  defaultValue: string;
}) {
  return (
    <label className="space-y-1.5 block">
      <span className="text-xs text-muted-foreground">{label}</span>
      <input
        name={name}
        type="time"
        defaultValue={defaultValue}
        required
        className="w-full h-11 rounded-md bg-white/[0.02] border border-white/10 px-3 text-sm font-mono focus:outline-none focus:border-white/30 focus:bg-white/[0.04] transition"
      />
    </label>
  );
}
