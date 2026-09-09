import { redirect } from "next/navigation";
import { getMemberships, requireUser } from "@/lib/session";

export default async function Home() {
  const user = await requireUser();
  const memberships = await getMemberships(user.id);
  if (memberships.length === 0) redirect("/onboarding");
  const first = memberships[0];
  redirect(`/${first.orgSlug}/${first.teamSlug}`);
}
