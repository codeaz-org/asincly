import { redirect } from "next/navigation";
import { OnboardingWizard } from "@/components/onboarding/wizard";
import { parseAttribution } from "@/lib/attribution";
import { TzDetector } from "@/components/tz-detector";
import { listMyInvitations } from "@/lib/actions/invitations";
import { getMemberships, requireUser } from "@/lib/session";

export const metadata = { title: "Set up your team" };

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ fresh?: string; [key: string]: string | string[] | undefined }>;
}) {
  const user = await requireUser();
  const memberships = await getMemberships(user.id);
  if (memberships.length > 0) {
    const m = memberships[0];
    redirect(`/${m.orgSlug}/${m.teamSlug}`);
  }
  // Invited people join a team rather than set one up.
  const params = await searchParams;
  if (!params.fresh && (await listMyInvitations()).length > 0) redirect("/invites");

  return (
    <>
      <TzDetector currentTz={user.tz} />
      <OnboardingWizard email={user.email} tz={user.tz} attribution={parseAttribution(params)} />
    </>
  );
}
