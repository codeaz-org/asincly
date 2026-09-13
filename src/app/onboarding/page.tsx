import { redirect } from "next/navigation";
import { OnboardingWizard } from "@/components/onboarding/wizard";
import { TzDetector } from "@/components/tz-detector";
import { getMemberships, requireUser } from "@/lib/session";

export const metadata = { title: "Set up your team" };

export default async function OnboardingPage() {
  const user = await requireUser();
  const memberships = await getMemberships(user.id);
  if (memberships.length > 0) {
    const m = memberships[0];
    redirect(`/${m.orgSlug}/${m.teamSlug}`);
  }

  return (
    <>
      <TzDetector currentTz={user.tz} />
      <OnboardingWizard email={user.email} tz={user.tz} />
    </>
  );
}
