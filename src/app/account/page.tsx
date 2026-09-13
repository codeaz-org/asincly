import Link from "next/link";
import { eq } from "drizzle-orm";
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
import { users } from "@/db/schema";
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
              <p className="flex-1 text-sm text-soft">Sign out of this browser. Other devices stay signed in.</p>
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

async function deleteAccount(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user?.id) return;
  const [u] = await db.select().from(users).where(eq(users.id, session.user.id));
  const confirm = String(formData.get("confirm") ?? "");
  if (!u || confirm !== u.email) throw new Error("Confirmation did not match.");
  await db.delete(users).where(eq(users.id, u.id));
  await signOut({ redirectTo: "/sign-in" });
}
