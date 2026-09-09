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

  return (
    <main className="min-h-dvh p-6 max-w-lg mx-auto space-y-8">
      <header>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          {row.orgName} · {row.teamName}
        </p>
        <h1 className="text-2xl font-semibold">Edit schedule</h1>
      </header>

      <form action={updateSchedule} className="space-y-4">
        <input type="hidden" name="scheduleId" value={row.id} />

        <div className="space-y-1">
          <label htmlFor="name" className="text-sm font-medium">Name</label>
          <input
            id="name"
            name="name"
            defaultValue={row.name}
            required
            className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="preset" className="text-sm font-medium">Cadence</label>
          <select
            id="preset"
            name="preset"
            defaultValue={matchingPreset}
            className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="daily">Every day</option>
            <option value="weekdays">Weekdays (Mon–Fri)</option>
            <option value="mwf">Mon / Wed / Fri</option>
            <option value="weekly">Weekly (Monday)</option>
            <option value="custom">Custom RRULE</option>
          </select>
        </div>

        <div className="space-y-1">
          <label htmlFor="customRrule" className="text-sm font-medium">
            Custom RRULE (only used when cadence is Custom)
          </label>
          <input
            id="customRrule"
            name="customRrule"
            defaultValue={matchingPreset === "custom" ? row.rrule : ""}
            placeholder="FREQ=WEEKLY;BYDAY=TU,TH"
            className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm font-mono"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label htmlFor="windowOpen" className="text-sm font-medium">Window opens</label>
            <input
              id="windowOpen"
              name="windowOpen"
              type="time"
              defaultValue={row.windowOpenLocal.slice(0, 5)}
              required
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="windowClose" className="text-sm font-medium">Window closes</label>
            <input
              id="windowClose"
              name="windowClose"
              type="time"
              defaultValue={row.windowCloseLocal.slice(0, 5)}
              required
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
            />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="active"
            defaultChecked={row.active}
            value="on"
          />
          Active
        </label>

        <div className="flex gap-3">
          <button
            type="submit"
            className="h-10 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium"
          >
            Save
          </button>
          <Link
            href={`/${row.orgSlug}/${row.teamSlug}`}
            className="h-10 px-4 rounded-md border border-input text-sm font-medium inline-flex items-center"
          >
            Cancel
          </Link>
        </div>
      </form>
    </main>
  );
}
