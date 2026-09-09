import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { members, teams } from "@/db/schema";
import { deleteOrg, setRecordingRetention } from "@/lib/actions/team-admin";
import { getTeamBySlug, requireUser } from "@/lib/session";

export default async function TeamSettingsPage({
  params,
}: {
  params: Promise<{ orgSlug: string; teamSlug: string }>;
}) {
  const { orgSlug, teamSlug } = await params;
  const user = await requireUser();
  const team = await getTeamBySlug(user.id, teamSlug);
  if (!team) notFound();

  // Owner only.
  const [role] = await db
    .select({ role: members.role })
    .from(members)
    .where(and(eq(members.teamId, team.teamId), eq(members.userId, user.id)));
  if (!role || role.role !== "owner") notFound();

  const [t] = await db.select().from(teams).where(eq(teams.id, team.teamId));

  return (
    <main className="min-h-dvh px-6 py-14 md:py-20 flex items-start justify-center">
      <div className="w-full max-w-xl space-y-10">
        <header className="space-y-3">
          <Link
            href={`/${orgSlug}/${teamSlug}`}
            className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-muted-foreground hover:text-foreground transition"
          >
            ← {team.orgName} · {team.teamName}
          </Link>
          <h1 className="text-4xl font-medium tracking-tight leading-none">
            Settings.
          </h1>
        </header>

        <section className="space-y-3">
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Recording retention
          </h2>
          <form
            action={async (fd) => {
              "use server";
              await setRecordingRetention({
                teamId: team.teamId,
                days: Number(fd.get("days") ?? 90),
              });
            }}
            className="flex items-center gap-2"
          >
            <input
              name="days"
              type="number"
              min={0}
              max={3650}
              defaultValue={t.recordingRetentionDays}
              className="w-24 h-11 rounded-md bg-white/[0.02] border border-white/10 px-3 text-sm font-mono focus:outline-none focus:border-white/30 focus:bg-white/[0.04] transition"
            />
            <span className="text-sm text-muted-foreground">days · 0 = never delete</span>
            <span className="flex-1" />
            <button
              type="submit"
              className="h-11 px-4 rounded-md bg-foreground text-primary-foreground text-sm font-medium hover:bg-foreground/90 transition"
            >
              Save
            </button>
          </form>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Export team data
          </h2>
          <p className="text-sm text-muted-foreground">
            A JSON bundle of org, team, members, schedules, occurrences,
            check-ins, and recordings (with decrypted transcripts + summaries).
          </p>
          <a
            href={`/api/teams/${team.teamId}/export`}
            download
            className="h-11 px-4 rounded-md border border-white/10 text-sm font-medium hover:bg-white/[0.04] transition inline-flex items-center"
          >
            Download JSON
          </a>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-medium uppercase tracking-wider text-destructive/90">
            Danger zone
          </h2>
          <div className="rounded-md border border-destructive/30 bg-destructive/[0.04] p-4 space-y-3">
            <p className="text-sm">
              Delete <span className="font-medium">{team.orgName}</span> and
              every team, schedule, check-in, and recording under it. This
              cannot be undone.
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
              className="flex gap-2"
            >
              <input
                name="confirm"
                placeholder={`Type "${team.orgName}" to confirm`}
                className="flex-1 h-11 rounded-md bg-white/[0.02] border border-white/10 px-3 text-sm focus:outline-none focus:border-white/30 transition"
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
    </main>
  );
}
