import Link from "next/link";
import { eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { db } from "@/db";
import { userTotp } from "@/db/schema";
import { SessionList } from "@/components/account/session-list";
import { TotpSetup } from "@/components/account/totp-setup";
import { Logo } from "@/components/logo";
import { Card, SectionTitle } from "@/components/ui/card";
import { listMySessions } from "@/lib/actions/account-security";
import { requireUserBeforeMfa } from "@/lib/session";

export const metadata = { title: "Security" };

export default async function SecurityPage({ searchParams }: { searchParams: Promise<{ required?: string }> }) {
  const user = await requireUserBeforeMfa();
  const [row] = await db.select({ confirmedAt: userTotp.confirmedAt }).from(userTotp).where(eq(userTotp.userId, user.id));
  const enabled = !!row?.confirmedAt;
  const { required } = await searchParams;
  const sessions = await listMySessions();

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-ground/80 backdrop-blur-xl">
        <div className="mx-auto max-w-2xl px-4 sm:px-6 h-16 flex items-center gap-4">
          <Link href="/account" className="inline-flex items-center gap-1.5 text-sm text-soft hover:text-ink transition">
            <ArrowLeft className="size-4" /> Account
          </Link>
          <span className="flex-1" />
          <Logo size={22} className="text-ink" wordmark={false} href="/" />
        </div>
      </header>
      <main className="flex-1">
        <div className="mx-auto max-w-2xl px-4 sm:px-6 pt-8 md:pt-12 pb-16 space-y-10">
          <header className="space-y-2">
            <p className="kicker">{user.email}</p>
            <h1 className="display text-4xl sm:text-5xl text-ink">Security</h1>
          </header>

          {required && !enabled && (
            <p role="alert" className="rounded-xl border border-amber/40 bg-amber/[0.08] px-4 py-3 text-sm text-ink">
              Your organization requires two-factor for owners and admins. Set it up to continue.
            </p>
          )}

          <section className="space-y-3">
            <SectionTitle>Two-factor authentication</SectionTitle>
            <Card className="p-4 sm:p-5">
              <TotpSetup enabled={enabled} />
            </Card>
          </section>

          {sessions.length > 0 && (
            <section className="space-y-3">
              <SectionTitle count={sessions.length}>Where you&rsquo;re signed in</SectionTitle>
              <Card as="div" className="overflow-hidden">
                <SessionList sessions={sessions} />
              </Card>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
