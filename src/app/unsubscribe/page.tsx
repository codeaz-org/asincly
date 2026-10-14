import Link from "next/link";
import { LogoMark } from "@/components/brand/mark";
import { Button } from "@/components/ui/button";
import { EMAIL_KIND_LABEL, verifyUnsubscribe } from "@/lib/email-prefs";

export const metadata = { title: "Unsubscribe" };

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ u?: string; k?: string; s?: string; done?: string }>;
}) {
  const { u = "", k = "", s = "", done } = await searchParams;
  const doneKind = done === "reminders" || done === "activity" ? done : null;
  const valid = verifyUnsubscribe(u, k, s);
  return (
    <main className="min-h-dvh grid place-items-center px-6">
      <div className="max-w-sm space-y-5">
        <LogoMark size={40} state={doneKind ? "done" : "open"} className="text-ink" />
        {doneKind ? (
          <>
            <h1 className="display text-3xl text-ink">Done.</h1>
            <p className="text-soft">You won&rsquo;t get {EMAIL_KIND_LABEL[doneKind]} any more. Turn them back on under your account.</p>
          </>
        ) : valid ? (
          <form method="post" action={`/api/email/unsubscribe?${new URLSearchParams({ u, k, s })}`} className="space-y-4">
            <h1 className="display text-3xl text-ink">Stop these emails?</h1>
            <p className="text-soft">You&rsquo;ll stop getting {EMAIL_KIND_LABEL[k as "reminders" | "activity"]}. Notifications still show in the app.</p>
            <Button type="submit" variant="primary" size="lg">
              Unsubscribe
            </Button>
          </form>
        ) : (
          <>
            <h1 className="display text-3xl text-ink">That link doesn&rsquo;t work.</h1>
            <p className="text-soft">
              Change your email settings from{" "}
              <Link href="/account" className="text-amber hover:underline underline-offset-4">
                your account
              </Link>{" "}
              instead.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
