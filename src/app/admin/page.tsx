import type { Metadata } from "next";
import { Logo } from "@/components/logo";
import { Card, Pill, SectionTitle } from "@/components/ui/card";
import { setOrgPlan } from "@/lib/actions/admin";
import { adminDaily, adminOrgs, adminTotals, adminUsers, type AdminOrg } from "@/lib/admin-queries";
import { entitlementsFor, isBillingEnabled } from "@/lib/billing/plans";
import { requireSuperAdmin } from "@/lib/session";

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

// The operator's view of the whole install: counts, people and organizations.
// Metadata only; check-in content never appears here.
export default async function AdminPage() {
  const me = await requireSuperAdmin();
  const billing = isBillingEnabled();
  const [totals, days, orgs, users] = await Promise.all([adminTotals(), adminDaily(), adminOrgs(), adminUsers()]);
  const now = new Date();

  const tiles: Array<[string, number, string]> = [
    ["People", totals.users, `+${totals.users_7d} this week`],
    ["Seen this week", totals.seen_7d, "signed-in people with activity"],
    ["Organizations", totals.orgs, `+${totals.orgs_7d} this week`],
    ["Active orgs", totals.active_orgs_7d, "a check-in in the last 7 days"],
    ["Check-ins", totals.check_ins_7d, `last 7 days · by ${totals.checkers_7d} people`],
    ["Recordings", totals.recordings_7d, "last 7 days"],
    ["Replies", totals.comments_7d, "last 7 days"],
  ];

  return (
    <div className="min-h-dvh">
      <header className="border-b border-line">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 h-16 flex items-center gap-4">
          <Logo size={22} className="text-ink" />
          <span className="kicker">admin</span>
          <span className="flex-1" />
          <span className="text-xs text-faint truncate">{me.email}</span>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-10 space-y-12">
        <div className="space-y-2">
          <h1 className="display text-4xl text-ink">Everything, at a glance</h1>
          <p className="text-sm text-soft">
            Counts and dates only; no check-in content is shown here. Days are UTC.{" "}
            {billing ? "Plans are on." : "Billing is off on this install, so every organization has every feature."}
          </p>
        </div>

        <section aria-label="Totals" className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {tiles.map(([label, value, note]) => (
            <Card key={label} className="p-4 space-y-1">
              <p className="text-xs text-soft">{label}</p>
              <p className="display text-3xl text-ink tabular-nums">{value}</p>
              <p className="text-[11px] text-faint leading-snug">{note}</p>
            </Card>
          ))}
        </section>

        <section className="space-y-3" aria-labelledby="days">
          <SectionTitle>
            <span id="days">Last 14 days</span>
          </SectionTitle>
          <Table head={["Day", "Signups", "Check-ins", "Recordings", "Replies"]}>
            {days.map((d) => (
              <tr key={d.day}>
                <Td mono>{d.day}</Td>
                <Num n={d.signups} />
                <Num n={d.check_ins} />
                <Num n={d.recordings} />
                <Num n={d.comments} />
              </tr>
            ))}
          </Table>
        </section>

        <section className="space-y-3" aria-labelledby="orgs">
          <SectionTitle count={totals.orgs}>
            <span id="orgs">Organizations</span>
          </SectionTitle>
          <Table head={["Organization", "Owner", "People", "Teams", ...(billing ? ["Plan"] : []), "Check-ins 7d", "Last check-in", "Created", "Source", ...(billing ? [""] : [])]}>
            {orgs.map((o) => {
              const plan = planLabel(o, now);
              return (
                <tr key={o.id}>
                  <Td>
                    <span className="text-ink">{o.name}</span>
                    <span className="block text-xs text-faint font-mono">{o.slug}</span>
                  </Td>
                  <Td>{o.owner_email ?? "—"}</Td>
                  <Num n={o.people} />
                  <Num n={o.teams} />
                  {billing && (
                    <Td>
                      <Pill tone={plan.pro ? "amber" : "neutral"}>{plan.label}</Pill>
                    </Td>
                  )}
                  <Num n={o.check_ins_7d} />
                  <Td>{ago(o.last_check_in, now)}</Td>
                  <Td>{ago(o.created_at, now)}</Td>
                  <Td>{o.source ?? "—"}</Td>
                  {billing && (
                    <Td>
                      {!o.paying && (
                        <form action={setOrgPlan}>
                          <input type="hidden" name="orgId" value={o.id} />
                          <input type="hidden" name="plan" value={plan.granted ? "free" : "pro"} />
                          <button
                            type="submit"
                            aria-label={plan.granted ? `Move ${o.name} to Free` : `Grant Pro to ${o.name}`}
                            className="text-xs text-amber hover:underline underline-offset-4 whitespace-nowrap"
                          >
                            {plan.granted ? "Move to Free" : "Grant Pro"}
                          </button>
                        </form>
                      )}
                    </Td>
                  )}
                </tr>
              );
            })}
          </Table>
        </section>

        <section className="space-y-3" aria-labelledby="users">
          <SectionTitle count={totals.users}>
            <span id="users">People</span>
          </SectionTitle>
          <Table head={["Person", "Joined", "Last seen", "Organizations", "Check-ins", "Last check-in", "2FA"]}>
            {users.map((u) => (
              <tr key={u.id}>
                <Td>
                  <span className="text-ink">{u.email}</span>
                  {u.name && <span className="block text-xs text-faint">{u.name}</span>}
                </Td>
                <Td>{ago(u.created_at, now)}</Td>
                <Td>{ago(u.last_seen, now)}</Td>
                <Td mono>{u.orgs ?? "—"}</Td>
                <Num n={u.check_ins} />
                <Td>{ago(u.last_check_in, now)}</Td>
                <Td>{u.has_2fa ? "on" : "—"}</Td>
              </tr>
            ))}
          </Table>
          {users.length < totals.users && <p className="text-xs text-faint">Newest {users.length} shown.</p>}
        </section>
      </main>
    </div>
  );
}

// What the org gets right now, from the same rules the app applies.
function planLabel(o: AdminOrg, now: Date): { label: string; pro: boolean; granted: boolean } {
  if (!o.plan || !o.status) return { label: "Free", pro: false, granted: false };
  const e = entitlementsFor(
    { plan: o.plan, status: o.status, trialEndsAt: o.trial_ends_at, pastDueSince: o.past_due_since, currentPeriodEnd: o.current_period_end },
    Math.max(1, o.people),
    now,
    true,
  );
  if (e.plan !== "pro") return { label: "Free", pro: false, granted: false };
  if (e.status === "trialing") return { label: "Trial", pro: true, granted: false };
  if (o.paying) return { label: o.status === "past_due" ? "Pro · past due" : "Pro · paying", pro: true, granted: false };
  return { label: "Pro · granted", pro: true, granted: true };
}

function ago(d: Date | null, now: Date): string {
  if (!d) return "—";
  const mins = Math.round((now.getTime() - new Date(d).getTime()) / 60_000);
  if (mins < 60) return `${Math.max(0, mins)}m ago`;
  if (mins < 48 * 60) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
}

function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-line">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left">
            {head.map((h, i) => (
              <th key={i} scope="col" className="px-3 py-2.5 text-xs font-medium text-soft whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </div>
  );
}

function Td({ children, mono = false }: { children: React.ReactNode; mono?: boolean }) {
  return <td className={`px-3 py-2.5 text-soft align-top ${mono ? "font-mono text-xs whitespace-nowrap" : ""}`}>{children}</td>;
}

function Num({ n }: { n: number }) {
  return <td className={`px-3 py-2.5 align-top tabular-nums ${n ? "text-ink" : "text-faint"}`}>{n}</td>;
}
