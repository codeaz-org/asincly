import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { SplitLanding } from "@/components/split-landing";
import { isBillingEnabled } from "@/lib/billing/plans";
import { getMemberships } from "@/lib/session";

export default async function LandingPage() {
  const session = await auth();
  if (session?.user?.id) {
    const memberships = await getMemberships(session.user.id);
    if (memberships.length === 0) redirect("/onboarding");
    const first = memberships[0];
    redirect(`/${first.orgSlug}/${first.teamSlug}`);
  }
  return <SplitLanding showPricing={isBillingEnabled()} />;
}
