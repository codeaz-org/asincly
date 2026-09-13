import Link from "next/link";
import { eq } from "drizzle-orm";
import { signOut } from "@/auth";
import { LogoMark, type MarkState } from "@/components/brand/mark";
import { Footer } from "@/components/footer";
import { Inbox } from "@/components/inbox";
import { BottomNav, DesktopTabs } from "@/components/shell/nav";
import { TeamSwitcher, UserMenu } from "@/components/shell/menus";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { db } from "@/db";
import { users } from "@/db/schema";
import { setName } from "@/lib/actions/onboarding";
import { displayName } from "@/lib/display";
import { listRecentForUser, unreadCount } from "@/lib/notifications";
import { trialDaysLeft } from "@/lib/billing/plans";
import { getMemberships } from "@/lib/session";
import { getTeamPlan } from "@/lib/team-context";
import { SOURCE_URL } from "@/lib/source";

type Props = {
  orgSlug: string;
  teamSlug: string;
  teamName: string;
  orgName: string;
  role: "owner" | "admin" | "member" | "guest";
  userId: string;
  userEmail: string;
  /** The viewer's own state for today — drawn on the mobile check-in button. */
  myState: MarkState;
  children: React.ReactNode;
};

export async function AppShell(props: Props) {
  const [inbox, unread, memberships, [me], plan] = await Promise.all([
    listRecentForUser(props.userId),
    unreadCount(props.userId),
    getMemberships(props.userId),
    db.select({ name: users.name }).from(users).where(eq(users.id, props.userId)),
    getTeamPlan(props.orgSlug, props.teamSlug),
  ]);

  const teamRoot = `/${props.orgSlug}/${props.teamSlug}`;
  const canManage = props.role === "owner" || props.role === "admin";
  const checkInLabel = props.myState === "done" ? "Edit your check-in" : "Check in";

  // Billing nudges go to the owner only: they're the one who can act.
  const trialLeft = trialDaysLeft(plan, new Date());
  const billingBanner =
    props.role !== "owner"
      ? null
      : plan.status === "past_due"
        ? { tone: "danger" as const, text: "Your last payment failed. Update your card to keep Pro." }
        : trialLeft != null && trialLeft <= 3
          ? {
              tone: "amber" as const,
              text:
                trialLeft === 0
                  ? "Your Pro trial ends today."
                  : `Your Pro trial ends in ${trialLeft} day${trialLeft === 1 ? "" : "s"}.`,
            }
          : null;

  async function signOutAction() {
    "use server";
    await signOut({ redirectTo: "/sign-in" });
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-ground/80 backdrop-blur-xl">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 h-16 flex items-center gap-3 sm:gap-5">
          <Link href={teamRoot} aria-label="Today" className="text-ink shrink-0 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-amber">
            <LogoMark size={26} />
          </Link>
          <span aria-hidden className="h-6 w-px bg-line shrink-0" />
          <TeamSwitcher
            current={{ orgName: props.orgName, teamName: props.teamName, orgSlug: props.orgSlug, teamSlug: props.teamSlug }}
            teams={memberships.map((m) => ({
              memberId: m.memberId,
              orgName: m.orgName,
              orgSlug: m.orgSlug,
              teamName: m.teamName,
              teamSlug: m.teamSlug,
            }))}
          />
          <span className="flex-1" />
          <DesktopTabs teamRoot={teamRoot} isOwner={canManage} />
          <span aria-hidden className="hidden md:block h-6 w-px bg-line" />
          <Inbox
            items={inbox.map((n) => ({
              id: n.id,
              type: n.type,
              title: n.title,
              body: n.body,
              linkPath: n.linkPath,
              createdAt: n.createdAt,
              readAt: n.readAt,
            }))}
            unread={unread}
          />
          <UserMenu
            name={displayName(me?.name, props.userEmail)}
            email={props.userEmail}
            settingsHref={canManage ? `${teamRoot}/settings` : null}
            sourceUrl={SOURCE_URL}
            signOutAction={signOutAction}
          />
        </div>
      </header>

      {!me?.name && (
        <div className="border-b border-amber/20 bg-amber/[0.06]">
          <form action={setName} className="mx-auto max-w-5xl px-4 sm:px-6 py-3 flex flex-wrap items-center gap-3">
            <LogoMark size={18} state="open" className="text-ink" />
            <label htmlFor="shell-name" className="text-sm text-ink">
              What should teammates call you?
            </label>
            <div className="flex gap-2 w-full sm:w-auto">
              <Input id="shell-name" name="name" required placeholder="Your name" className="h-10 sm:w-56" />
              <Button type="submit" variant="primary">Save</Button>
            </div>
          </form>
        </div>
      )}

      {billingBanner && (
        <div className={billingBanner.tone === "danger" ? "border-b border-danger/25 bg-danger/[0.06]" : "border-b border-amber/20 bg-amber/[0.06]"}>
          <div className="mx-auto max-w-5xl px-4 sm:px-6 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <LogoMark size={16} state={billingBanner.tone === "danger" ? "blocked" : "before"} className="text-ink" />
            <span className="text-ink">{billingBanner.text}</span>
            <Link href={`${teamRoot}/settings/billing`} className="text-amber hover:underline underline-offset-4">
              Plan &amp; billing →
            </Link>
          </div>
        </div>
      )}

      <main className="flex-1 pb-24 md:pb-0">{props.children}</main>

      <div className="hidden md:block">
        <Footer />
      </div>
      <BottomNav teamRoot={teamRoot} myState={props.myState} checkInLabel={checkInLabel} canCheckIn={props.role !== "guest"} />
    </div>
  );
}
