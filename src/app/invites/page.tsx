import Link from "next/link";
import { LogoMark } from "@/components/brand/mark";
import { Button } from "@/components/ui/button";
import { acceptInvitation, declineInvitation, listMyInvitations } from "@/lib/actions/invitations";
import { getMemberships, requireUser } from "@/lib/session";

export const metadata = { title: "Invites" };

export default async function InvitesPage({ searchParams }: { searchParams: Promise<{ gone?: string; full?: string }> }) {
  const user = await requireUser();
  const [invites, memberships, sp] = await Promise.all([listMyInvitations(), getMemberships(user.id), searchParams]);
  const home = memberships[0] ? `/${memberships[0].orgSlug}/${memberships[0].teamSlug}` : "/onboarding?fresh=1";

  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="space-y-3">
          <LogoMark size={40} state="open" className="text-ink" />
          <h1 className="display text-4xl text-ink">{invites.length ? "You're invited." : "No open invites."}</h1>
          <p className="text-soft leading-relaxed">
            {invites.length
              ? `Invites for ${user.email}. Joining shows your check-ins to that team.`
              : `Nothing is waiting for ${user.email}. An invite may have expired, or been sent to another address.`}
          </p>
          {sp.gone && <p className="text-sm text-danger" role="alert">That invite isn&apos;t open any more.</p>}
          {sp.full && (
            <p className="text-sm text-ink" role="alert">
              That team&apos;s plan is full. Ask whoever invited you to make room, then try again.
            </p>
          )}
        </div>
        {invites.length > 0 && (
          <ul className="space-y-3">
            {invites.map((i) => (
              <li key={i.id} className="rounded-2xl border border-line bg-ground-raised p-4 space-y-3">
                <div>
                  <p className="text-ink font-medium">{i.team}</p>
                  <p className="text-xs text-soft">
                    {i.org} · as {i.role === "guest" ? "a guest (read-only)" : "a member"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <form action={acceptInvitation}>
                    <input type="hidden" name="id" value={i.id} />
                    <Button type="submit" variant="primary">Join {i.team}</Button>
                  </form>
                  <form action={declineInvitation}>
                    <input type="hidden" name="id" value={i.id} />
                    <Button type="submit" variant="ghost">Decline</Button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
        <Link href={home} className="block text-sm text-soft hover:text-ink">
          {memberships.length ? "Back to your team →" : "Set up your own team instead →"}
        </Link>
      </div>
    </main>
  );
}
