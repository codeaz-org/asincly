import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Footer } from "@/components/footer";
import { getMemberships } from "@/lib/session";

export default async function LandingPage() {
  const session = await auth();
  if (session?.user?.id) {
    const memberships = await getMemberships(session.user.id);
    if (memberships.length === 0) redirect("/onboarding");
    const first = memberships[0];
    redirect(`/${first.orgSlug}/${first.teamSlug}`);
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-background/80 backdrop-blur">
        <div className="mx-auto max-w-5xl px-6 h-14 flex items-center gap-4">
          <span className="inline-flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-accent shadow-[0_0_10px_theme(colors.emerald.400/.7)]" />
            <span className="text-sm font-medium tracking-tight">asincly</span>
          </span>
          <span className="flex-1" />
          <Link
            href="/sign-in"
            className="text-sm text-muted-foreground hover:text-foreground transition"
          >
            Sign in
          </Link>
          <Link
            href="/sign-in"
            className="h-9 px-3 rounded-md bg-foreground text-primary-foreground text-sm font-medium hover:bg-foreground/90 transition inline-flex items-center"
          >
            Get started
          </Link>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto max-w-3xl px-6 pt-24 pb-16 space-y-8">
          <span className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-muted-foreground">
            <span className="size-1.5 rounded-full bg-accent" />
            async standups, honest software
          </span>
          <h1 className="text-5xl md:text-7xl font-medium tracking-tight leading-[0.95]">
            No meeting.
            <br />
            Just the update.
          </h1>
          <p className="text-lg text-muted-foreground max-w-xl leading-relaxed">
            Your team checks in on their own local schedule with a short video and a
            markdown note. AI turns it into a scannable summary. Blockers surface. Time
            zones respected. Nobody waits on anybody.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/sign-in"
              className="h-11 px-6 rounded-md bg-foreground text-primary-foreground text-sm font-medium hover:bg-foreground/90 transition inline-flex items-center gap-2"
            >
              Start free →
            </Link>
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="h-11 px-6 rounded-md border border-white/10 text-sm font-medium hover:bg-white/[0.04] transition inline-flex items-center"
            >
              Self-host on GitHub
            </a>
          </div>
        </section>

        <section className="border-t border-white/[0.06] py-16">
          <div className="mx-auto max-w-5xl px-6 grid md:grid-cols-3 gap-8">
            <Feature title="Local-time windows">
              Every teammate checks in during their own morning. No 3am pings for the
              Sydney office.
            </Feature>
            <Feature title="Two-minute check-in">
              Yesterday, Today, Blockers. Type or record. Autosaves. Submit and you&rsquo;re
              done.
            </Feature>
            <Feature title="AI you can skim">
              Whisper transcribes, Llama summarizes. Bullets, action items, mentions —
              10 seconds to read the whole team.
            </Feature>
            <Feature title="Feed, not inbox">
              One page per team. Today&rsquo;s check-ins on top, recent occurrences below,
              pending pills for who&rsquo;s still out.
            </Feature>
            <Feature title="Encrypted at rest">
              AES-256-GCM on every transcript and summary. Postgres RLS on every table.
              Uploads never proxy through the API.
            </Feature>
            <Feature title="AGPL, self-host">
              Full source on GitHub. Docker Compose for local. Bring your own Postgres,
              R2, and free-tier Groq for AI.
            </Feature>
          </div>
        </section>

        <section className="py-16">
          <div className="mx-auto max-w-3xl px-6 space-y-4 text-center">
            <h2 className="text-3xl md:text-4xl font-medium tracking-tight">
              Start with one team, in a minute.
            </h2>
            <p className="text-muted-foreground">
              Magic link sign-in. No credit card. Kill the meeting today.
            </p>
            <div className="pt-2">
              <Link
                href="/sign-in"
                className="h-11 px-6 rounded-md bg-foreground text-primary-foreground text-sm font-medium hover:bg-foreground/90 transition inline-flex items-center gap-2"
              >
                Sign in with email →
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

function Feature({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-base font-medium">{title}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed">{children}</p>
    </div>
  );
}
