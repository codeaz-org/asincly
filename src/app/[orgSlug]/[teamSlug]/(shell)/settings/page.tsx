import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { ChevronDown, Download } from "lucide-react";
import Link from "next/link";
import { PlanGate } from "@/components/billing/plan-gate";
import { LogoMark } from "@/components/brand/mark";
import { RulesCard } from "@/components/settings/rules-card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, Pill, SectionTitle } from "@/components/ui/card";
import { FieldLabel, Input } from "@/components/ui/field";
import { db } from "@/db";
import { schedules, teams } from "@/db/schema";
import { updateSchedule } from "@/lib/actions/schedule";
import {
  createSchedule,
  deleteOrg,
  deleteSchedule,
  deleteTeam,
  renameTeam,
  setRecordingRetention,
} from "@/lib/actions/team-admin";
import { teamPath } from "@/lib/paths";
import { getTeamPageContext, getTeamPlan } from "@/lib/team-context";
import { MIN_WINDOW_MINUTES, PRESET_RRULES } from "@/lib/time";

export const metadata = { title: "Settings" };

const PRESETS = [
  ["daily", "Every day"],
  ["weekdays", "Weekdays"],
  ["mwf", "M · W · F"],
  ["weekly", "Weekly"],
  ["custom", "Custom"],
] as const;

export default async function TeamSettingsPage({ params }: { params: Promise<{ orgSlug: string; teamSlug: string }> }) {
  const { orgSlug, teamSlug } = await params;
  const { team } = await getTeamPageContext(orgSlug, teamSlug);
  if (team.role !== "owner" && team.role !== "admin") notFound();
  const isOwner = team.role === "owner";

  const [[t], teamSchedules, plan] = await Promise.all([
    db.select().from(teams).where(eq(teams.id, team.teamId)),
    db.select().from(schedules).where(eq(schedules.teamId, team.teamId)),
    getTeamPlan(orgSlug, teamSlug),
  ]);
  const billingHref = plan.plan === "unlimited" ? null : `${teamPath(orgSlug, teamSlug)}/settings/billing`;

  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 pt-8 md:pt-12 pb-16 space-y-12">
      <header className="space-y-2">
        <p className="kicker">
          {team.orgName} · {team.role}
        </p>
        <h1 className="display text-4xl sm:text-5xl text-ink">Settings</h1>
        <p className="text-soft">How {team.teamName} checks in, and what happens to its data.</p>
      </header>

      {billingHref && (
        <section className="space-y-3">
          <SectionTitle>Plan</SectionTitle>
          <Link
            href={billingHref}
            className="flex items-center gap-4 rounded-2xl border border-line bg-ground-raised/70 px-4 sm:px-5 py-4 hover:border-line-strong transition"
          >
            <LogoMark size={20} state={plan.plan === "pro" ? "done" : "before"} className="text-ink" />
            <span className="flex-1 text-[15px] text-ink">
              {plan.status === "trialing" ? "Pro trial" : plan.plan === "pro" ? "Pro" : "Free"}
              <span className="block text-sm text-soft">Plan, members and billing for {team.orgName}</span>
            </span>
            <span className="text-sm text-soft">Manage →</span>
          </Link>
        </section>
      )}

      <section className="space-y-3">
        <SectionTitle>Integrations</SectionTitle>
        <Link
          href={`${teamPath(orgSlug, teamSlug)}/settings/integrations`}
          className="flex items-center gap-4 rounded-2xl border border-line bg-ground-raised/70 px-4 sm:px-5 py-4 hover:border-line-strong transition"
        >
          <span className="flex-1 text-[15px] text-ink">
            Slack
            <span className="block text-sm text-soft">Digest in a channel, reminders by DM</span>
          </span>
          <span className="text-sm text-soft">Set up →</span>
        </Link>
      </section>

      <section className="space-y-3">
        <SectionTitle>Team</SectionTitle>
        <Card className="p-4 sm:p-5">
          <form action={renameTeam.bind(null, team.teamId)} className="space-y-3">
            <FieldLabel htmlFor="team-name">Name</FieldLabel>
            <div className="flex flex-col sm:flex-row gap-2">
              <Input id="team-name" name="name" defaultValue={t.name} required className="flex-1" />
              <Button type="submit" size="lg">Rename</Button>
            </div>
          </form>
        </Card>
      </section>

      <section className="space-y-3">
        <SectionTitle>Check-in rules</SectionTitle>
        <Card>
          <RulesCard
            teamId={team.teamId}
            requireVideo={t.requireVideo && plan.requireVideoRule}
            locked={!plan.requireVideoRule}
            billingHref={isOwner ? billingHref : null}
          />
        </Card>
      </section>

      <section className="space-y-3">
        <SectionTitle count={teamSchedules.length}>Check-in schedules</SectionTitle>
        <p className="text-sm text-soft -mt-1">
          Each has its own cadence and window, in every member&rsquo;s local time. Today shows them all.
        </p>
        <div className="space-y-2">
          {teamSchedules.map((sched) => {
            const matching = Object.entries(PRESET_RRULES).find(([, r]) => r === sched.rrule)?.[0] ?? "custom";
            return (
              <Card as="div" key={sched.id} className="overflow-hidden">
                <details className="group">
                  <summary className="cursor-pointer list-none px-4 sm:px-5 py-4 flex items-center gap-3 hover:bg-ink/[0.03] transition [&::-webkit-details-marker]:hidden">
                    <LogoMark size={20} state={sched.active ? "open" : "missed"} className="text-ink" />
                    <span className="flex-1 min-w-0">
                      <span className="block text-[15px] font-medium text-ink truncate">{sched.name}</span>
                      <span className="block text-xs text-soft">
                        {PRESETS.find(([v]) => v === matching)?.[1]} ·{" "}
                        <span className="font-mono">
                          {sched.windowOpenLocal.slice(0, 5)}–{sched.windowCloseLocal.slice(0, 5)}
                        </span>
                      </span>
                    </span>
                    {sched.active ? <Pill tone="amber">active</Pill> : <Pill>paused</Pill>}
                    <ChevronDown className="size-4 text-soft transition-transform group-open:rotate-180" />
                  </summary>
                  <div className="border-t border-line p-4 sm:p-5 space-y-5">
                    <form action={updateSchedule} className="space-y-5">
                      <input type="hidden" name="scheduleId" value={sched.id} />
                      <div className="space-y-2">
                        <FieldLabel htmlFor={`name-${sched.id}`}>Name</FieldLabel>
                        <Input id={`name-${sched.id}`} name="name" defaultValue={sched.name} required />
                      </div>
                      <fieldset className="space-y-2">
                        <legend className="kicker mb-2">Cadence</legend>
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                          {PRESETS.map(([val, label]) => (
                            <label
                              key={val}
                              className="cursor-pointer rounded-xl border border-line px-3 py-2.5 text-center text-sm text-soft hover:text-ink transition has-[input:checked]:border-amber/60 has-[input:checked]:bg-amber/[0.08] has-[input:checked]:text-ink has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-amber"
                            >
                              <input type="radio" name="preset" value={val} defaultChecked={val === matching} className="sr-only" />
                              {label}
                            </label>
                          ))}
                        </div>
                        <Input
                          name="customRrule"
                          aria-label="Custom RRULE"
                          defaultValue={matching === "custom" ? sched.rrule : ""}
                          placeholder="Custom RRULE, e.g. FREQ=WEEKLY;BYDAY=TU,TH"
                          className="h-11 font-mono text-sm"
                        />
                      </fieldset>
                      <div className="grid grid-cols-2 gap-3">
                        <label className="space-y-2">
                          <span className="kicker block">Opens</span>
                          <Input name="windowOpen" type="time" defaultValue={sched.windowOpenLocal.slice(0, 5)} required className="h-11 font-mono" />
                        </label>
                        <label className="space-y-2">
                          <span className="kicker block">Closes</span>
                          <Input name="windowClose" type="time" defaultValue={sched.windowCloseLocal.slice(0, 5)} required className="h-11 font-mono" />
                        </label>
                      </div>
                      <p className="text-xs text-soft">
                        At least {MIN_WINDOW_MINUTES} minutes long — reminders fire on a timer, so a
                        shorter window can close again before anyone is told.
                      </p>
                      <label className="flex items-center justify-between gap-4 rounded-xl border border-line px-4 py-3 cursor-pointer">
                        <span className="text-sm">
                          <span className="block font-medium text-ink">Active</span>
                          <span className="block text-soft">Reminders and digests run while on.</span>
                        </span>
                        <input type="checkbox" name="active" defaultChecked={sched.active} value="on" className="size-5 accent-[oklch(0.78_0.15_60)]" />
                      </label>
                      <Button type="submit" variant="primary" size="lg">
                        Save schedule
                      </Button>
                    </form>
                    {teamSchedules.length > 1 && (
                      <form action={deleteSchedule.bind(null, sched.id)}>
                        <Button type="submit" variant="quiet" size="sm" className="text-danger/80 hover:text-danger">
                          Delete this schedule
                        </Button>
                      </form>
                    )}
                  </div>
                </details>
              </Card>
            );
          })}
        </div>

        {!plan.multipleSchedules && teamSchedules.length > 0 && billingHref ? (
          <PlanGate
            compact
            title="Multiple schedules are part of Pro."
            hint="Run separate check-ins, like an EU and a US sync, in one team."
            href={billingHref}
            canUpgrade={isOwner}
          />
        ) : (
        <form
          action={createSchedule.bind(null, team.teamId)}
          className="rounded-2xl border border-dashed border-line-strong p-4 flex flex-wrap items-end gap-2"
        >
          <label className="flex-1 min-w-[200px] space-y-1.5">
            <span className="kicker block text-[10px]">New schedule</span>
            <Input name="name" required placeholder="e.g. EU sync" className="h-11" />
          </label>
          <label className="space-y-1.5">
            <span className="kicker block text-[10px]">Opens</span>
            <Input name="windowOpen" type="time" defaultValue="09:00" className="h-11 w-36 px-3 font-mono text-sm" />
          </label>
          <label className="space-y-1.5">
            <span className="kicker block text-[10px]">Closes</span>
            <Input name="windowClose" type="time" defaultValue="11:00" className="h-11 w-36 px-3 font-mono text-sm" />
          </label>
          <Button type="submit" size="lg" className="h-11">
            Add
          </Button>
          <p className="w-full text-xs text-soft">
            Windows are at least {MIN_WINDOW_MINUTES} minutes long.
          </p>
        </form>
        )}
      </section>

      {isOwner && (
      <section className="space-y-3">
        <SectionTitle>Data</SectionTitle>
        <Card className="divide-y divide-line">
          <form
            action={async (fd) => {
              "use server";
              await setRecordingRetention({ teamId: team.teamId, days: Number(fd.get("days") ?? 90) });
            }}
            className="p-4 sm:p-5 flex flex-wrap items-center gap-3"
          >
            <div className="flex-1 min-w-[12rem]">
              <p className="text-[15px] font-medium text-ink">Recording retention</p>
              <p className="text-sm text-soft">
                Videos older than this are deleted. 0 keeps them forever.
                {plan.historyDays != null && ` On the Free plan, videos are kept for ${plan.historyDays} days.`}
              </p>
            </div>
            <label className="flex items-center gap-2">
              <span className="sr-only">Days</span>
              <Input name="days" type="number" min={0} max={3650} defaultValue={t.recordingRetentionDays} className="h-11 w-24 px-3 font-mono" />
              <span className="text-sm text-soft">days</span>
            </label>
            <Button type="submit">Save</Button>
          </form>
          <div className="p-4 sm:p-5 flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[12rem]">
              <p className="text-[15px] font-medium text-ink">Export</p>
              <p className="text-sm text-soft">
                JSON of members, schedules, check-ins, replies, reactions and recordings (transcripts decrypted).
              </p>
            </div>
            <a href={`/api/teams/${team.teamId}/export`} download className={buttonVariants({ variant: "secondary" })}>
              <Download /> Download
            </a>
          </div>
        </Card>
      </section>

      )}

      {isOwner && (
      <section className="space-y-3">
        <SectionTitle className="[&_h2]:text-danger">Danger zone</SectionTitle>
        <div className="rounded-2xl border border-danger/30 bg-danger/[0.04] divide-y divide-danger/20">
          <DangerForm
            title={`Delete ${t.name}`}
            body="Removes this team with all its check-ins, replies and recordings. The organization and other teams stay."
            confirmText={t.name}
            button="Delete team"
            action={async (fd) => {
              "use server";
              if (String(fd.get("confirm") ?? "") !== t.name) throw new Error("Type the team name exactly to confirm.");
              await deleteTeam(team.teamId);
            }}
          />
          <DangerForm
            title={`Delete ${team.orgName}`}
            body="Every team, schedule, check-in and recording in the organization. Cannot be undone."
            confirmText={team.orgName}
            button="Delete organization"
            action={async (fd) => {
              "use server";
              if (String(fd.get("confirm") ?? "") !== team.orgName) {
                throw new Error("Type the organization name exactly to confirm.");
              }
              await deleteOrg(team.orgId);
            }}
          />
        </div>
      </section>
      )}
    </div>
  );
}

function DangerForm({
  title,
  body,
  confirmText,
  button,
  action,
}: {
  title: string;
  body: string;
  confirmText: string;
  button: string;
  action: (fd: FormData) => Promise<void>;
}) {
  return (
    <form action={action} className="p-4 sm:p-5 space-y-3">
      <div>
        <p className="text-[15px] font-medium text-ink">{title}</p>
        <p className="text-sm text-soft">{body}</p>
      </div>
      <div className="flex flex-col sm:flex-row gap-2">
        <Input
          name="confirm"
          required
          aria-label={`Type ${confirmText} to confirm`}
          placeholder={`Type "${confirmText}" to confirm`}
          className="flex-1 h-11 text-sm focus:border-danger/60 focus:ring-danger/15"
        />
        <Button type="submit" variant="danger" size="lg" className="h-11">
          {button}
        </Button>
      </div>
    </form>
  );
}
