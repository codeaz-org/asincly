import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { PlanGate } from "@/components/billing/plan-gate";
import { SlackSettings } from "@/components/settings/slack-card";
import { buttonVariants } from "@/components/ui/button";
import { Card, SectionTitle } from "@/components/ui/card";
import { db } from "@/db";
import { slackInstalls } from "@/db/schema";
import { teamPath } from "@/lib/paths";
import { slackConfigured } from "@/lib/slack/api";
import { getTeamPageContext, getTeamPlan } from "@/lib/team-context";

export const metadata = { title: "Integrations" };

const NOTICE: Record<string, { tone: "ok" | "error"; text: string }> = {
  connected: { tone: "ok", text: "Slack is connected. Pick a channel for the digest." },
  denied: { tone: "error", text: "Slack wasn't connected: the request was cancelled." },
  error: { tone: "error", text: "Slack didn't finish connecting. Try again." },
};

export default async function IntegrationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string; teamSlug: string }>;
  searchParams: Promise<{ slack?: string }>;
}) {
  const { orgSlug, teamSlug } = await params;
  const { slack } = await searchParams;
  const { team } = await getTeamPageContext(orgSlug, teamSlug);
  if (team.role !== "owner" && team.role !== "admin") notFound();

  const [plan, [install]] = await Promise.all([
    getTeamPlan(orgSlug, teamSlug),
    db.select().from(slackInstalls).where(eq(slackInstalls.teamId, team.teamId)),
  ]);
  const root = teamPath(orgSlug, teamSlug);
  const notice = slack ? NOTICE[slack] : undefined;

  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 pt-8 md:pt-12 pb-16 space-y-10">
      <header className="space-y-4">
        <Link href={`${root}/settings`} className="inline-flex items-center gap-1.5 text-sm text-soft hover:text-ink transition">
          <ArrowLeft className="size-4" /> Settings
        </Link>
        <div className="space-y-2">
          <p className="kicker">{team.teamName}</p>
          <h1 className="display text-4xl sm:text-5xl text-ink">Integrations</h1>
        </div>
      </header>

      {notice && (
        <p
          role={notice.tone === "error" ? "alert" : "status"}
          className={
            notice.tone === "error"
              ? "rounded-xl border border-danger/30 bg-danger/[0.05] px-4 py-3 text-sm text-ink"
              : "rounded-xl border border-amber/25 bg-amber/[0.05] px-4 py-3 text-sm text-ink"
          }
        >
          {notice.text}
        </p>
      )}

      <section className="space-y-3" aria-labelledby="slack">
        <SectionTitle>
          <span id="slack">Slack</span>
        </SectionTitle>
        {!slackConfigured() ? (
          <Card className="p-4 sm:p-5 text-sm text-soft">
            Slack isn&rsquo;t set up on this server. Self-hosting? See <code className="text-ink">docs/SLACK.md</code>.
          </Card>
        ) : !plan.slack ? (
          <PlanGate
            title="Slack digest and reminders are part of Pro."
            hint="Post the daily digest to a channel and remind people by DM when their window opens."
            href={`${root}/settings/billing`}
            canUpgrade={team.role === "owner"}
          />
        ) : install ? (
          <Card className="p-4 sm:p-5 space-y-5">
            <p className="text-[15px] text-ink">
              Connected to <span className="font-medium">{install.slackTeamName}</span>
              {install.channelName && <span className="text-soft"> · #{install.channelName}</span>}
            </p>
            <SlackSettings
              teamId={team.teamId}
              workspace={install.slackTeamName}
              channelId={install.channelId}
              channelName={install.channelName}
              digestEnabled={install.digestEnabled}
              remindersEnabled={install.remindersEnabled}
            />
          </Card>
        ) : (
          <Card className="p-4 sm:p-5 flex flex-wrap items-center gap-4">
            <div className="flex-1 min-w-[14rem] space-y-1">
              <p className="text-[15px] font-medium text-ink">Post digests and reminders in Slack</p>
              <p className="text-sm text-soft">The digest goes to a channel you choose; reminders arrive as DMs.</p>
            </div>
            {/* A plain link: the install route redirects to Slack's consent screen. */}
            <a href={`/api/slack/install?teamId=${team.teamId}`} className={buttonVariants({ variant: "primary" })}>
              Add to Slack
            </a>
          </Card>
        )}
      </section>
    </div>
  );
}
