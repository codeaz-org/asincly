import Link from "next/link";
import { notFound } from "next/navigation";
import { PlanTable } from "@/components/billing/plan-table";
import { Footer } from "@/components/footer";
import { Logo } from "@/components/logo";
import { buttonVariants } from "@/components/ui/button";
import { TRIAL_DAYS, isBillingEnabled } from "@/lib/billing/plans";
import { SOURCE_URL } from "@/lib/source";

export const metadata = {
  title: "Pricing · Asincly",
  description: "Free for up to 3 members. Pro is €8 per member per month. Self-hosting is free with every feature.",
};

// BILLING_ENABLED is read at request time, not baked in at build time.
export const dynamic = "force-dynamic";

// Hosted cloud only. Self-hosted installs have no plans, so no pricing page.
export default function PricingPage() {
  if (!isBillingEnabled()) notFound();
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-ground/80 backdrop-blur-xl">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 h-16 flex items-center gap-4">
          <Logo size={22} className="text-ink" />
          <span className="flex-1" />
          <Link href="/sign-in" className="text-sm text-soft hover:text-ink transition">
            Sign in
          </Link>
        </div>
      </header>

      <main className="flex-1">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 py-12 md:py-16 space-y-10">
          <header className="space-y-3">
            <p className="kicker">Pricing</p>
            <h1 className="display text-4xl sm:text-5xl text-ink">Pay for people, not meetings.</h1>
            <p className="text-soft max-w-xl">
              Small teams use Asincly free. Pro unlocks bigger teams, longer videos and your full history. Every new
              team starts with {TRIAL_DAYS} days of Pro, no card needed.
            </p>
            <div className="pt-2">
              <Link href="/sign-in" className={buttonVariants({ variant: "primary", size: "lg" })}>
                Start free →
              </Link>
            </div>
          </header>

          <PlanTable />

          <section className="grid gap-6 sm:grid-cols-2 text-sm">
            <div className="space-y-1.5">
              <h2 className="text-[15px] font-medium text-ink">Who counts as a member?</h2>
              <p className="text-soft">
                Anyone who checks in, across all teams in your organization, counted once. Guests who only read and
                reply are free.
              </p>
            </div>
            <div className="space-y-1.5">
              <h2 className="text-[15px] font-medium text-ink">What happens after the trial?</h2>
              <p className="text-soft">
                You move to Free. Nothing is deleted: history older than 14 days is locked until you upgrade.
              </p>
            </div>
            <div className="space-y-1.5">
              <h2 className="text-[15px] font-medium text-ink">Can I self-host instead?</h2>
              <p className="text-soft">
                Yes. Asincly is{" "}
                <a href={SOURCE_URL} className="text-amber hover:underline underline-offset-4" target="_blank" rel="noopener noreferrer">
                  open source under AGPL-3.0
                </a>
                . Self-hosted installs get every feature, with no limits and no license key.
              </p>
            </div>
            <div className="space-y-1.5">
              <h2 className="text-[15px] font-medium text-ink">Can I leave with my data?</h2>
              <p className="text-soft">Always. Export everything as JSON on any plan, or delete your organization.</p>
            </div>
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
}
