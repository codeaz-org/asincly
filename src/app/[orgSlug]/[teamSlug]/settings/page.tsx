import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { members, schedules, teams } from "@/db/schema";
import { AppShell } from "@/components/app-shell";
import { updateSchedule } from "@/lib/actions/schedule";
import { deleteOrg, setRecordingRetention } from "@/lib/actions/team-admin";
import { getTeamBySlug, requireUser } from "@/lib/session";
import { PRESET_RRULES } from "@/lib/time";

export default async function TeamSettingsPage({
  params,
}: {
  params: Promise<{ orgSlug: string; teamSlug: string }>;
}) {
  const { orgSlug, teamSlug } = await params;
  const user = await requireUser();
  const team = await getTeamBySlug(user.id, teamSlug);
  if (!team) notFound();

  const [role] = await db
    .select({ role: members.role })
    .from(members)
    .where(and(eq(members.teamId, team.teamId), eq(members.userId, user.id)));
  if (!role || role.role !== "owner") notFound();

  const [t] = await db.select().from(teams).where(eq(teams.id, team.teamId));
  const [primary] = await db
    .select()
    .from(schedules)
    .where(and(eq(schedules.teamId, team.teamId), eq(schedules.active, true)))
    .limit(1);

  const matchingPreset = primary
    ? Object.entries(PRESET_RRULES).find(([, r]) => r === primary.rrule)?.[0] ?? "custom"
    : "weekdays";
  const presets = [
    ["daily", "Every day"],
    ["weekdays", "Weekdays"],
    ["mwf", "M · W · F"],
    ["weekly", "Weekly"],
    ["custom", "Custom"],
  ] as const;

  return (
    <AppShell
      orgSlug={orgSlug}
      teamSlug={teamSlug}
      orgName={team.orgName}
      teamName={team.teamName}
      role={team.role}
      userId={user.id}
      userEmail={user.email}
      active="settings"
    >
      <div className="mx-auto max-w-2xl px-6 py-10 md:py-12 space-y-12">
        <header className="space-y-2">
          <h1 className="text-3xl font-medium tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground">Owner-only controls for {team.teamName}.</p>
        </header>

        {/* Schedule */}
        {primary && (
          <section className="space-y-4">
            <SectionTitle>Schedule</SectionTitle>
            <form action={updateSchedule} className="space-y-4">
              <input type="hidden" name="scheduleId" value={primary.id} />
              <div className="space-y-1.5">
                <Label>Name</Label>
                <input
                  name="name"
                  defaultValue={primary.name}
                  required
                  className="w-full h-11 rounded-md bg-white/[0.02] border border-white/10 px-3 text-sm focus:outline-none focus:border-white/30 focus:bg-white/[0.04] transition"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Cadence</Label>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                  {presets.map(([val, label]) => (
                    <label
                      key={val}
                      className="cursor-pointer relative rounded-md border border-white/10 px-3 py-2.5 text-center text-sm hover:bg-white/[0.03] transition has-[input:checked]:border-accent has-[input:checked]:bg-accent/[0.08]"
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
                  defaultValue={matchingPreset === "custom" ? primary.rrule : ""}
                  placeholder="Custom RRULE — e.g. FREQ=WEEKLY;BYDAY=TU,TH"
                  className="w-full h-11 rounded-md bg-white/[0.02] border border-white/10 px-3 text-sm font-mono placeholder:text-muted-foreground/50 focus:outline-none focus:border-white/30 focus:bg-white/[0.04] transition"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Window opens</Label>
                  <input
                    name="windowOpen"
                    type="time"
                    defaultValue={primary.windowOpenLocal.slice(0, 5)}
                    required
                    className="w-full h-11 rounded-md bg-white/[0.02] border border-white/10 px-3 text-sm font-mono focus:outline-none focus:border-white/30 transition"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Window closes</Label>
                  <input
                    name="windowClose"
                    type="time"
                    defaultValue={primary.windowCloseLocal.slice(0, 5)}
                    required
                    className="w-full h-11 rounded-md bg-white/[0.02] border border-white/10 px-3 text-sm font-mono focus:outline-none focus:border-white/30 transition"
                  />
                </div>
              </div>
              <label className="flex items-center justify-between rounded-md border border-white/10 px-4 py-3 cursor-pointer">
                <span className="text-sm">
                  <span className="font-medium">Active</span>
                  <span className="ml-2 text-muted-foreground">
                    Reminders and digests fire when on.
                  </span>
                </span>
                <input
                  type="checkbox"
                  name="active"
                  defaultChecked={primary.active}
                  value="on"
                  className="size-4 accent-emerald-400"
                />
              </label>
              <button
                type="submit"
                className="h-11 px-5 rounded-md bg-foreground text-primary-foreground text-sm font-medium hover:bg-foreground/90 transition"
              >
                Save schedule
              </button>
            </form>
          </section>
        )}

        {/* Retention */}
        <section className="space-y-4">
          <SectionTitle>Recording retention</SectionTitle>
          <form
            action={async (fd) => {
              "use server";
              await setRecordingRetention({
                teamId: team.teamId,
                days: Number(fd.get("days") ?? 90),
              });
            }}
            className="flex items-center gap-3"
          >
            <input
              name="days"
              type="number"
              min={0}
              max={3650}
              defaultValue={t.recordingRetentionDays}
              className="w-24 h-11 rounded-md bg-white/[0.02] border border-white/10 px-3 text-sm font-mono focus:outline-none focus:border-white/30 transition"
            />
            <span className="text-sm text-muted-foreground">days · 0 = never delete</span>
            <span className="flex-1" />
            <button
              type="submit"
              className="h-11 px-4 rounded-md border border-white/10 text-sm hover:bg-white/[0.04] transition"
            >
              Save
            </button>
          </form>
        </section>

        {/* Export */}
        <section className="space-y-3">
          <SectionTitle>Export team data</SectionTitle>
          <p className="text-sm text-muted-foreground">
            A JSON bundle of org, team, members, schedules, occurrences, check-ins, and
            recordings (transcripts + summaries decrypted).
          </p>
          <a
            href={`/api/teams/${team.teamId}/export`}
            download
            className="h-11 px-4 rounded-md border border-white/10 text-sm hover:bg-white/[0.04] transition inline-flex items-center"
          >
            Download JSON
          </a>
        </section>

        {/* Danger */}
        <section className="space-y-3">
          <SectionTitle className="text-destructive/90">Danger zone</SectionTitle>
          <div className="rounded-md border border-destructive/30 bg-destructive/[0.04] p-4 space-y-3">
            <p className="text-sm">
              Delete <span className="font-medium">{team.orgName}</span> and every team,
              schedule, check-in, and recording under it. Cannot be undone.
            </p>
            <form
              action={async (fd) => {
                "use server";
                const confirm = String(fd.get("confirm") ?? "");
                if (confirm !== team.orgName) {
                  throw new Error("Type the organization name exactly to confirm.");
                }
                await deleteOrg(team.orgId);
              }}
              className="flex flex-wrap gap-2"
            >
              <input
                name="confirm"
                placeholder={`Type "${team.orgName}" to confirm`}
                className="flex-1 min-w-[240px] h-11 rounded-md bg-white/[0.02] border border-white/10 px-3 text-sm focus:outline-none focus:border-destructive/50 transition"
              />
              <button
                type="submit"
                className="h-11 px-4 rounded-md bg-destructive text-white text-sm font-medium hover:bg-destructive/90 transition"
              >
                Delete organization
              </button>
            </form>
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function SectionTitle({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h2
      className={`text-sm font-medium uppercase tracking-wider text-muted-foreground ${
        className ?? ""
      }`}
    >
      {children}
    </h2>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="block text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
      {children}
    </span>
  );
}
