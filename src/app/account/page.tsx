import Link from "next/link";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth, signOut } from "@/auth";
import { Footer } from "@/components/footer";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getMemberships, requireUser } from "@/lib/session";

export default async function AccountPage() {
  const user = await requireUser();
  const memberships = await getMemberships(user.id);
  const [u] = await db.select().from(users).where(eq(users.id, user.id));

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-background/80 backdrop-blur">
        <div className="mx-auto max-w-3xl px-6 h-14 flex items-center gap-4">
          <Link href="/" className="inline-flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-accent" />
            <span className="text-sm font-medium">asincly</span>
          </Link>
          <span className="text-muted-foreground/40">/</span>
          <span className="text-sm font-medium">Account</span>
        </div>
      </header>

      <main className="flex-1">
        <div className="mx-auto max-w-2xl px-6 py-10 md:py-12 space-y-12">
          <header className="space-y-2">
            <h1 className="text-3xl font-medium tracking-tight">Your account</h1>
            <p className="text-sm text-muted-foreground">
              Signed in as <span className="text-foreground">{u.email}</span>.
            </p>
          </header>

          <section className="space-y-4">
            <SectionTitle>Profile</SectionTitle>
            <form action={updateProfile} className="space-y-4">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <input
                  name="name"
                  defaultValue={u.name ?? ""}
                  placeholder="Your name"
                  className="w-full h-11 rounded-md bg-white/[0.02] border border-white/10 px-3 text-sm focus:outline-none focus:border-white/30 focus:bg-white/[0.04] transition"
                />
                <p className="text-[11px] text-muted-foreground">
                  Shown on your check-ins.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Time zone</Label>
                <input
                  name="tz"
                  defaultValue={u.tz}
                  placeholder="e.g. Europe/Bucharest"
                  className="w-full h-11 rounded-md bg-white/[0.02] border border-white/10 px-3 text-sm font-mono focus:outline-none focus:border-white/30 focus:bg-white/[0.04] transition"
                />
                <p className="text-[11px] text-muted-foreground">
                  IANA tz name. Auto-detected on sign-in; edit if you travel.
                </p>
              </div>
              <button
                type="submit"
                className="h-11 px-5 rounded-md bg-foreground text-primary-foreground text-sm font-medium hover:bg-foreground/90 transition"
              >
                Save
              </button>
            </form>
          </section>

          <section className="space-y-4">
            <SectionTitle>Teams</SectionTitle>
            {memberships.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                You&rsquo;re not in any team.{" "}
                <Link href="/onboarding" className="underline hover:text-foreground">
                  Create one
                </Link>
                .
              </p>
            ) : (
              <ul className="space-y-2">
                {memberships.map((m) => (
                  <li key={m.memberId}>
                    <Link
                      href={`/${m.orgSlug}/${m.teamSlug}`}
                      className="flex items-center justify-between rounded-md border border-white/10 px-4 py-3 hover:bg-white/[0.03] transition"
                    >
                      <span className="text-sm">
                        <span className="text-muted-foreground">{m.orgName}</span>
                        <span className="mx-1.5 text-muted-foreground/40">·</span>
                        <span className="font-medium">{m.teamName}</span>
                      </span>
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground border border-white/10 rounded px-1.5 py-0.5">
                        {m.role}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-4">
            <SectionTitle>Sessions</SectionTitle>
            <p className="text-sm text-muted-foreground">
              Sign out of this browser. Other browsers remain signed in.
            </p>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/sign-in" });
              }}
            >
              <button
                type="submit"
                className="h-11 px-4 rounded-md border border-white/10 text-sm hover:bg-white/[0.04] transition"
              >
                Sign out
              </button>
            </form>
          </section>

          <section className="space-y-4">
            <SectionTitle className="text-destructive/90">Delete account</SectionTitle>
            <div className="rounded-md border border-destructive/30 bg-destructive/[0.04] p-4 space-y-3">
              <p className="text-sm">
                Removes you from every team and deletes your check-ins and recordings. Orgs
                you own must be deleted separately from their team&rsquo;s settings first.
              </p>
              <form action={deleteAccount} className="flex gap-2">
                <input
                  name="confirm"
                  placeholder={`Type "${u.email}" to confirm`}
                  className="flex-1 h-11 rounded-md bg-white/[0.02] border border-white/10 px-3 text-sm focus:outline-none focus:border-destructive/50 transition"
                />
                <button
                  type="submit"
                  className="h-11 px-4 rounded-md bg-destructive text-white text-sm font-medium hover:bg-destructive/90 transition"
                >
                  Delete
                </button>
              </form>
            </div>
          </section>
        </div>
      </main>

      <Footer />
    </div>
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

// ── server actions ──

async function updateProfile(formData: FormData) {
  "use server";
  const user = await requireUser();
  const parsed = z
    .object({
      name: z.string().max(80).optional(),
      tz: z.string().min(1).max(64),
    })
    .parse({
      name: formData.get("name") || undefined,
      tz: formData.get("tz"),
    });
  await db
    .update(users)
    .set({ name: parsed.name ?? null, tz: parsed.tz })
    .where(eq(users.id, user.id));
  revalidatePath("/account");
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
