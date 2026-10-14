import Link from "next/link";
import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { z } from "zod";
import { auth, signOut } from "@/auth";
import { Footer } from "@/components/footer";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Card, Pill, SectionTitle } from "@/components/ui/card";
import { FieldLabel, Input } from "@/components/ui/field";
import { db } from "@/db";
import { withUser } from "@/db/with-user";
import { members, organizations, recordings, teams, users } from "@/db/schema";
import { audit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";
import { deleteRecordingObjects, recordingKeys } from "@/lib/recording-objects";
import { cityFromTz } from "@/lib/day-rail";
import { getMemberships, requireUser } from "@/lib/session";
import { isValidTimeZone } from "@/lib/time";

export const metadata = { title: "Account" };

export default async function AccountPage() {
  const user = await requireUser();
  const memberships = await getMemberships(user.id);
  const [u] = await db.select().from(users).where(eq(users.id, user.id));
  const zones = Intl.supportedValuesOf("timeZone");
  const home = memberships[0] ? `/${memberships[0].orgSlug}/${memberships[0].teamSlug}` : "/onboarding";

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-ground/80 backdrop-blur-xl">
        <div className="mx-auto max-w-2xl px-4 sm:px-6 h-16 flex items-center gap-4">
          <Link href={home} className="inline-flex items-center gap-1.5 text-sm text-soft hover:text-ink transition">
            <ArrowLeft className="size-4" /> Back
          </Link>
          <span className="flex-1" />
          <Logo size={22} className="text-ink" wordmark={false} href={home} />
        </div>
      </header>

      <main className="flex-1">
        <div className="mx-auto max-w-2xl px-4 sm:px-6 pt-8 md:pt-12 pb-16 space-y-10">
          <header className="space-y-2">
            <p className="kicker">{u.email}</p>
            <h1 className="display text-4xl sm:text-5xl text-ink">Your account</h1>
          </header>

          <section className="space-y-3">
            <SectionTitle>Profile</SectionTitle>
            <Card className="p-4 sm:p-5">
              <form action={updateProfile} className="space-y-5">
                <div className="space-y-2">
                  <FieldLabel htmlFor="name" hint="Shown on your check-ins.">Name</FieldLabel>
                  <Input id="name" name="name" defaultValue={u.name ?? ""} placeholder="Your name" maxLength={80} />
                </div>
                <div className="space-y-2">
                  <FieldLabel htmlFor="tz" hint={`Auto-detected when you open the app. Now: ${cityFromTz(u.tz)}.`}>
                    Time zone
                  </FieldLabel>
                  <Input id="tz" name="tz" defaultValue={u.tz} list="zones" required className="font-mono text-sm" />
                  <datalist id="zones">
                    {zones.map((z) => (
                      <option key={z} value={z} />
                    ))}
                  </datalist>
                </div>
                <Button type="submit" variant="primary" size="lg">
                  Save
                </Button>
              </form>
            </Card>
          </section>

          <section className="space-y-3">
            <SectionTitle>Email</SectionTitle>
            <Card className="p-4 sm:p-5">
              <form action={updateEmailPrefs} className="space-y-4">
                <label className="flex items-start gap-3">
                  <input type="checkbox" name="reminders" defaultChecked={u.emailReminders} className="mt-1 size-4 accent-[oklch(0.78_0.15_60)]" />
                  <span>
                    <span className="block text-sm text-ink">Check-in reminders</span>
                    <span className="block text-xs text-soft">When your team&rsquo;s window opens and you haven&rsquo;t checked in.</span>
                  </span>
                </label>
                <label className="flex items-start gap-3">
                  <input type="checkbox" name="activity" defaultChecked={u.emailActivity} className="mt-1 size-4 accent-[oklch(0.78_0.15_60)]" />
                  <span>
                    <span className="block text-sm text-ink">Activity</span>
                    <span className="block text-xs text-soft">Mentions, replies, help on your blockers, nudges.</span>
                  </span>
                </label>
                <p className="text-xs text-soft">Sign-in links and billing emails always arrive. Everything shows in the app either way.</p>
                <Button type="submit">Save</Button>
              </form>
            </Card>
          </section>

          <section className="space-y-3">
            <SectionTitle count={memberships.length}>Teams</SectionTitle>
            {memberships.length === 0 ? (
              <p className="text-sm text-soft">
                You&rsquo;re not in any team.{" "}
                <Link href="/onboarding" className="text-amber hover:underline underline-offset-4">
                  Create one
                </Link>
                .
              </p>
            ) : (
              <Card as="div" className="divide-y divide-line overflow-hidden">
                {memberships.map((m) => (
                  <Link
                    key={m.memberId}
                    href={`/${m.orgSlug}/${m.teamSlug}`}
                    className="flex items-center gap-3 px-4 sm:px-5 py-4 hover:bg-ink/[0.03] transition"
                  >
                    <span className="flex-1 min-w-0">
                      <span className="block text-[15px] font-medium text-ink truncate">{m.teamName}</span>
                      <span className="block text-xs text-soft truncate">{m.orgName}</span>
                    </span>
                    <Pill tone={m.role === "member" ? "neutral" : "amber"}>{m.role}</Pill>
                    <ArrowRight className="size-4 text-soft" />
                  </Link>
                ))}
              </Card>
            )}
          </section>

          <section className="space-y-3">
            <SectionTitle>Session</SectionTitle>
            <Card className="p-4 sm:p-5 flex flex-wrap items-center gap-3">
              <p className="flex-1 text-sm text-soft">
                Sign out of this browser. Two-factor and your other devices are under{" "}
                <Link href="/account/security" className="text-amber hover:underline underline-offset-4">
                  Security
                </Link>
                .
              </p>
              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/sign-in" });
                }}
              >
                <Button type="submit">Sign out</Button>
              </form>
            </Card>
          </section>

          <section className="space-y-3">
            <SectionTitle className="[&_h2]:text-danger">Delete account</SectionTitle>
            <div className="rounded-2xl border border-danger/30 bg-danger/[0.04] p-4 sm:p-5 space-y-3">
              <p className="text-sm text-ink">
                Removes you from every team and deletes your check-ins, replies and recordings. Organizations you own must be
                deleted from their team&rsquo;s settings first.
              </p>
              <form action={deleteAccount} className="flex flex-col sm:flex-row gap-2">
                <Input
                  name="confirm"
                  required
                  aria-label="Type your email to confirm"
                  placeholder={`Type "${u.email}" to confirm`}
                  className="flex-1 h-11 text-sm"
                />
                <Button type="submit" variant="danger" size="lg" className="h-11">
                  Delete account
                </Button>
              </form>
            </div>
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
}

// ── server actions ──

async function updateProfile(formData: FormData) {
  "use server";
  const user = await requireUser();
  const parsed = z
    .object({
      name: z.string().trim().max(80).optional(),
      tz: z.string().min(1).max(64).refine(isValidTimeZone, "Unknown time zone"),
    })
    .parse({
      name: formData.get("name") || undefined,
      tz: formData.get("tz"),
    });
  await db
    .update(users)
    .set({ name: parsed.name || null, tz: parsed.tz })
    .where(eq(users.id, user.id));
  revalidatePath("/", "layout");
}

async function updateEmailPrefs(formData: FormData) {
  "use server";
  const user = await requireUser();
  await withUser(user.id, (tx) =>
    tx
      .update(users)
      .set({ emailReminders: formData.get("reminders") === "on", emailActivity: formData.get("activity") === "on" })
      .where(eq(users.id, user.id)),
  );
  revalidatePath("/account");
}

async function deleteAccount(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user?.id) return;
  const [u] = await db.select().from(users).where(eq(users.id, session.user.id));
  const confirm = String(formData.get("confirm") ?? "");
  if (!u || confirm !== u.email) throw new Error("Confirmation did not match.");
  if (!(await rateLimit(`account-delete:${u.id}`, 3, 60 * 60 * 1000)).allowed) {
    throw new Error("Too many attempts — try again later.");
  }

  // Deleting would leave an org, or a team with people in it, nobody can run.
  const ownedOrgs = await db
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.ownerUserId, u.id));
  if (ownedOrgs.length) {
    throw new Error(
      `You own ${ownedOrgs.map((o) => o.name).join(", ")}. Transfer or delete the organization first.`,
    );
  }
  const mine = await db
    .select({ teamId: members.teamId, role: members.role, orgId: teams.orgId, teamName: teams.name })
    .from(members)
    .innerJoin(teams, eq(teams.id, members.teamId))
    .where(eq(members.userId, u.id));
  for (const m of mine.filter((r) => r.role === "owner")) {
    const others = await db
      .select({ role: members.role })
      .from(members)
      .where(and(eq(members.teamId, m.teamId), ne(members.userId, u.id)));
    if (others.length && !others.some((o) => o.role === "owner")) {
      throw new Error(`You're the only owner of ${m.teamName}. Make someone else its owner first.`);
    }
  }

  for (const orgId of new Set(mine.map((m) => m.orgId))) {
    await audit({ orgId, actorUserId: u.id, action: "user.delete", resourceType: "user", resourceId: u.id });
  }
  const keys = await recordingKeys(eq(recordings.userId, u.id));
  await db.delete(users).where(eq(users.id, u.id));
  await deleteRecordingObjects(keys);
  await signOut({ redirectTo: "/sign-in" });
}
