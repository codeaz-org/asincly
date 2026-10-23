import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { auth } from "@/auth";
import { SplitLanding } from "@/components/split-landing";
import { attributionQuery, parseAttribution } from "@/lib/attribution";
import { isBillingEnabled } from "@/lib/billing/plans";
import { getMemberships } from "@/lib/session";
import { recordVisit } from "@/lib/visits";

export default async function LandingPage({ searchParams }: PageProps<"/">) {
  const session = await auth();
  if (session?.user?.id) {
    const memberships = await getMemberships(session.user.id);
    if (memberships.length === 0) redirect("/onboarding");
    const first = memberships[0];
    redirect(`/${first.orgSlug}/${first.teamSlug}`);
  }
  const attribution = parseAttribution(await searchParams);
  const userAgent = (await headers()).get("user-agent");
  after(() => recordVisit("/", attribution, userAgent));
  const signInHref = `/sign-in${attributionQuery(attribution)}`;
  return <SplitLanding showPricing={isBillingEnabled()} signInHref={signInHref} />;
}
