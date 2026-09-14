import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ConfirmingPayment, ManageBillingButton, UpgradeButton } from "@/components/billing/billing-actions";
import { PlanTable } from "@/components/billing/plan-table";
import { LogoMark } from "@/components/brand/mark";
import { Card, Pill, SectionTitle } from "@/components/ui/card";
import { getBillingOverview } from "@/lib/billing/entitlements";
import { PRICE_PER_MEMBER, formatPrice, isBillingEnabled, trialDaysLeft } from "@/lib/billing/plans";
import { stripeConfigured } from "@/lib/billing/stripe";
import { teamPath } from "@/lib/paths";
import { getTeamPageContext } from "@/lib/team-context";

export const metadata = { title: "Plan & billing" };

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" });

export default async function BillingPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string; teamSlug: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  if (!isBillingEnabled()) notFound();
  const { orgSlug, teamSlug } = await params;
  const { status } = await searchParams;
  const { team } = await getTeamPageContext(orgSlug, teamSlug);
  if (team.role !== "owner" && team.role !== "admin") notFound();
  const isOwner = team.role === "owner";

  const now = new Date();
  const { entitlements: e, billing, seats, teamCount, aiUsed } = await getBillingOverview(team.orgId, now);
  const subscribed = !!billing?.stripeSubscriptionId && (billing.status === "active" || billing.status === "past_due");
  const trialLeft = trialDaysLeft(e, now);
  const canPay = stripeConfigured();
  const interval = billing?.interval === "year" ? "year" : "month";

  const planName = e.status === "trialing" ? "Pro trial" : e.plan === "pro" ? "Pro" : "Free";
  const summary =
    e.status === "trialing" && trialLeft != null
      ? `${trialLeft} day${trialLeft === 1 ? "" : "s"} left. Then Free, unless you upgrade. No card needed until then.`
      : billing?.status === "past_due"
        ? "Your last payment didn't go through. Update your card to keep Pro."
        : subscribed && billing?.cancelAtPeriodEnd && billing.currentPeriodEnd
          ? `Canceled. Pro stays on until ${dateFmt.format(billing.currentPeriodEnd)}, then Free.`
          : subscribed && billing?.currentPeriodEnd
            ? `${billing.seats} member${billing.seats === 1 ? "" : "s"} × ${formatPrice(PRICE_PER_MEMBER[interval])} / ${interval}. Renews ${dateFmt.format(billing.currentPeriodEnd)}.`
            : "Up to 3 members and one team, free forever.";

  const aiLimit = e.aiSecondsPerMonth;
  const root = teamPath(orgSlug, teamSlug);

  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 pt-8 md:pt-12 pb-16 space-y-10">
      <header className="space-y-4">
        <Link href={`${root}/settings`} className="inline-flex items-center gap-1.5 text-sm text-soft hover:text-ink transition">
          <ArrowLeft className="size-4" /> Settings
        </Link>
        <div className="space-y-2">
          <p className="kicker">{team.orgName}</p>
          <h1 className="display text-4xl sm:text-5xl text-ink">Plan &amp; billing</h1>
        </div>
      </header>

      {status === "success" && e.plan !== "pro" && <ConfirmingPayment />}
      {status === "success" && e.plan === "pro" && e.status !== "trialing" && (
        <p role="status" className="rounded-2xl border border-amber/25 bg-amber/[0.05] px-4 py-3 text-sm text-ink">
          You&rsquo;re on Pro. Thank you for supporting Asincly.
        </p>
      )}

      <Card className="p-5 sm:p-6 space-y-5">
        <div className="flex items-start gap-4">
          <LogoMark size={36} state={e.plan === "pro" ? (billing?.status === "past_due" ? "blocked" : "done") : "before"} className="text-ink shrink-0" />
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-2">
              <h2 className="display text-2xl text-ink">{planName}</h2>
              {billing?.status === "past_due" && <Pill tone="danger">payment failed</Pill>}
            </div>
            <p className="text-sm text-soft">{summary}</p>
          </div>
        </div>

        {isOwner && canPay && (
          <div className="border-t border-line pt-5 flex flex-wrap gap-3">
            {subscribed ? (
              <ManageBillingButton teamId={team.teamId} label={billing?.status === "past_due" ? "Update payment method" : "Manage billing"} />
            ) : (
              <>
                <UpgradeButton
                  teamId={team.teamId}
                  seats={Math.max(1, seats)}
                  prices={{ month: formatPrice(PRICE_PER_MEMBER.month), year: formatPrice(PRICE_PER_MEMBER.year) }}
                />
                {billing?.stripeCustomerId && <ManageBillingButton teamId={team.teamId} label="Invoices" />}
              </>
            )}
          </div>
        )}
        {!isOwner && <p className="border-t border-line pt-4 text-xs text-soft">Only the owner can change the plan.</p>}
        {isOwner && !canPay && (
          <p className="border-t border-line pt-4 text-xs text-soft">Payments aren&rsquo;t configured on this server yet.</p>
        )}
      </Card>

      <section className="space-y-3" aria-labelledby="usage">
        <SectionTitle>
          <span id="usage">This month</span>
        </SectionTitle>
        <Card className="divide-y divide-line">
          <Meter label="Members" hint="Guests are free" used={seats} limit={e.maxMembers} format={(n) => String(n)} />
          <Meter label="Teams" used={teamCount} limit={e.maxTeams} format={(n) => String(n)} />
          <Meter
            label="AI minutes"
            hint="Transcribing video check-ins"
            used={aiUsed}
            limit={aiLimit}
            format={(s) => `${Math.ceil(s / 60)}`}
          />
        </Card>
      </section>

      <section className="space-y-3" aria-labelledby="compare">
        <SectionTitle>
          <span id="compare">Plans</span>
        </SectionTitle>
        <PlanTable current={e.status === "trialing" ? null : e.plan === "pro" ? "pro" : "free"} />
        <p className="text-xs text-soft">
          Prices exclude VAT where it applies. Seats follow your team: adding or removing a member adjusts the next invoice
          pro rata. Self-hosting Asincly is free with every feature.
        </p>
      </section>
    </div>
  );
}

function Meter({
  label,
  hint,
  used,
  limit,
  format,
}: {
  label: string;
  hint?: string;
  used: number;
  limit: number | null;
  format: (n: number) => string;
}) {
  const ratio = limit ? Math.min(1, used / limit) : 0;
  return (
    <div className="p-4 sm:p-5 space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[15px] text-ink">
          {label}
          {hint && <span className="ml-2 text-xs text-soft">{hint}</span>}
        </p>
        <p className="text-sm tabular-nums text-soft">
          <span className="text-ink">{format(used)}</span>
          {limit != null ? ` of ${format(limit)}` : " · no limit"}
        </p>
      </div>
      {limit != null && (
        <div
          className="h-1.5 rounded-full bg-ink/[0.06] overflow-hidden"
          role="meter"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={limit}
          aria-valuenow={Math.min(used, limit)}
        >
          <div
            className={ratio >= 1 ? "h-full bg-danger" : ratio > 0.8 ? "h-full bg-amber" : "h-full bg-ink/40"}
            style={{ width: `${ratio * 100}%` }}
          />
        </div>
      )}
    </div>
  );
}
