import { redirect } from "next/navigation";
import { peoplePath } from "@/lib/paths";

// /team was renamed to /people; keep old links (emails, bookmarks) working.
export default async function TeamRedirect({ params }: { params: Promise<{ orgSlug: string; teamSlug: string }> }) {
  const { orgSlug, teamSlug } = await params;
  redirect(peoplePath(orgSlug, teamSlug));
}
