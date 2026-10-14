import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { verifyUnsubscribe } from "@/lib/email-prefs";

export const dynamic = "force-dynamic";

// POST only: mail clients' one-click unsubscribe (RFC 8058) and the button on
// /unsubscribe. A GET would let link scanners unsubscribe people by
// prefetching the email's links.
export async function POST(req: Request) {
  const q = new URL(req.url).searchParams;
  const userId = q.get("u") ?? "";
  const kind = q.get("k") ?? "";
  if (!verifyUnsubscribe(userId, kind, q.get("s") ?? "")) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  await db
    .update(users)
    .set(kind === "reminders" ? { emailReminders: false } : { emailActivity: false })
    .where(eq(users.id, userId));
  // The page's form wants a page back; a mail client just wants a 200.
  if (req.headers.get("content-type")?.includes("application/x-www-form-urlencoded") && !(await req.text()).includes("List-Unsubscribe=One-Click")) {
    return NextResponse.redirect(new URL(`/unsubscribe?done=${kind}`, req.url), 303);
  }
  return NextResponse.json({ ok: true });
}
