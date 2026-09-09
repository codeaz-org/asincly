import Link from "next/link";
import { headers } from "next/headers";
import { auth, signOut } from "@/auth";
import { Inbox } from "@/components/inbox";
import { Logo } from "@/components/logo";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { setName } from "@/lib/actions/onboarding";
import { listRecentForUser, unreadCount } from "@/lib/notifications";
import { getMemberships } from "@/lib/session";
import { Footer } from "@/components/footer";

type Props = {
  orgSlug: string;
  teamSlug: string;
  teamName: string;
  orgName: string;
  active: "feed" | "team" | "settings";
  role: "owner" | "admin" | "member";
  userId: string;
  userEmail: string;
  children: React.ReactNode;
};

export async function AppShell(props: Props) {
  // Header lookups are cheap and kept here so every app page gets an
  // identically-populated shell.
  const [inbox, unread, memberships, [me]] = await Promise.all([
    listRecentForUser(props.userId),
    unreadCount(props.userId),
    getMemberships(props.userId),
    db.select({ name: users.name }).from(users).where(eq(users.id, props.userId)),
  ]);
  // Touch `headers()` so Next treats the shell as dynamic (nav + inbox change per request).
  await headers();
  await auth();

  const isOwner = props.role === "owner";
  const teamRoot = `/${props.orgSlug}/${props.teamSlug}`;

  const tabs: Array<{ href: string; label: string; key: Props["active"] }> = [
    { href: teamRoot, label: "Feed", key: "feed" },
    { href: `${teamRoot}/team`, label: "Team", key: "team" },
  ];
  if (isOwner) tabs.push({ href: `${teamRoot}/settings`, label: "Settings", key: "settings" });

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-background/80 backdrop-blur">
        <div className="mx-auto max-w-5xl px-6 h-14 flex items-center gap-4">
          <Logo size={22} className="shrink-0 text-sm" />

          <span className="text-muted-foreground/40">/</span>

          <TeamPicker
            orgSlug={props.orgSlug}
            teamSlug={props.teamSlug}
            orgName={props.orgName}
            teamName={props.teamName}
            memberships={memberships}
          />

          <nav className="ml-4 hidden md:flex items-center gap-1">
            {tabs.map((t) => (
              <Link
                key={t.key}
                href={t.href}
                className={`h-8 px-3 rounded-md text-sm transition inline-flex items-center ${
                  t.key === props.active
                    ? "bg-white/[0.06] text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-white/[0.03]"
                }`}
              >
                {t.label}
              </Link>
            ))}
          </nav>

          <span className="flex-1" />

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

          <UserMenu email={props.userEmail} />
        </div>

        {/* Mobile tabs row */}
        <div className="md:hidden border-t border-white/[0.04]">
          <div className="mx-auto max-w-5xl px-6 flex gap-1 overflow-x-auto py-2">
            {tabs.map((t) => (
              <Link
                key={t.key}
                href={t.href}
                className={`h-8 px-3 rounded-md text-sm shrink-0 transition inline-flex items-center ${
                  t.key === props.active
                    ? "bg-white/[0.06] text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
              </Link>
            ))}
          </div>
        </div>
      </header>

      {!me?.name && (
        <div className="border-b border-amber-400/20 bg-amber-400/[0.05]">
          <form
            action={setName}
            className="mx-auto max-w-5xl px-6 py-2.5 flex flex-wrap items-center gap-3"
          >
            <span className="text-sm text-amber-200/90">
              What should teammates call you?
            </span>
            <input
              name="name"
              required
              placeholder="Your name"
              className="h-9 w-56 rounded-md bg-white/[0.03] border border-white/10 px-3 text-sm focus:outline-none focus:border-amber-400/50 transition"
            />
            <button
              type="submit"
              className="h-9 px-4 rounded-md bg-foreground text-primary-foreground text-sm font-medium hover:bg-foreground/90 transition"
            >
              Save
            </button>
          </form>
        </div>
      )}

      <main className="flex-1">{props.children}</main>

      <Footer />
    </div>
  );
}

function TeamPicker({
  orgName,
  teamName,
  memberships,
  orgSlug,
  teamSlug,
}: {
  orgSlug: string;
  teamSlug: string;
  orgName: string;
  teamName: string;
  memberships: Awaited<ReturnType<typeof getMemberships>>;
}) {
  // Single-team accounts get a static label; multi-team get a small link list
  // under a details/summary (no JS dropdown yet, keeps the shell tiny).
  const others = memberships.filter(
    (m) => !(m.orgSlug === orgSlug && m.teamSlug === teamSlug),
  );
  if (others.length === 0) {
    return (
      <span className="text-sm truncate min-w-0">
        <span className="text-muted-foreground">{orgName}</span>
        <span className="mx-1.5 text-muted-foreground/40">·</span>
        <span className="font-medium">{teamName}</span>
      </span>
    );
  }
  return (
    <details className="relative">
      <summary className="cursor-pointer list-none text-sm truncate inline-flex items-center gap-1 hover:text-foreground text-muted-foreground">
        <span>{orgName}</span>
        <span className="text-muted-foreground/40">·</span>
        <span className="font-medium text-foreground">{teamName}</span>
        <span className="text-muted-foreground ml-0.5">▾</span>
      </summary>
      <div className="absolute left-0 top-9 z-40 w-72 rounded-md border border-white/10 bg-zinc-950/95 backdrop-blur shadow-xl overflow-hidden">
        <p className="px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground border-b border-white/5">
          Switch team
        </p>
        <ul>
          {others.map((m) => (
            <li key={m.memberId}>
              <Link
                href={`/${m.orgSlug}/${m.teamSlug}`}
                className="block px-3 py-2 text-sm hover:bg-white/[0.05] transition"
              >
                <span className="text-muted-foreground">{m.orgName}</span>
                <span className="mx-1.5 text-muted-foreground/40">·</span>
                <span className="font-medium">{m.teamName}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}

function UserMenu({ email }: { email: string }) {
  const initial = (email[0] ?? "?").toUpperCase();
  return (
    <details className="relative">
      <summary className="cursor-pointer list-none inline-flex items-center justify-center size-9 rounded-md border border-white/10 hover:bg-white/[0.04] transition">
        <span className="text-sm font-medium">{initial}</span>
      </summary>
      <div className="absolute right-0 top-11 z-40 w-56 rounded-md border border-white/10 bg-zinc-950/95 backdrop-blur shadow-xl overflow-hidden">
        <div className="px-3 py-2 border-b border-white/5">
          <p className="text-xs text-muted-foreground">Signed in as</p>
          <p className="text-sm font-medium truncate">{email}</p>
        </div>
        <ul className="text-sm">
          <li>
            <Link href="/account" className="block px-3 py-2 hover:bg-white/[0.05] transition">
              Account
            </Link>
          </li>
          <li>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/sign-in" });
              }}
            >
              <button
                type="submit"
                className="w-full text-left px-3 py-2 hover:bg-white/[0.05] transition text-muted-foreground hover:text-destructive"
              >
                Sign out
              </button>
            </form>
          </li>
        </ul>
      </div>
    </details>
  );
}
