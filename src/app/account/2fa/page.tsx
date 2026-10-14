import { redirect } from "next/navigation";
import { signOut } from "@/auth";
import { LogoMark } from "@/components/brand/mark";
import { MfaChallenge } from "@/components/account/mfa-challenge";
import { Button } from "@/components/ui/button";
import { requireUserBeforeMfa } from "@/lib/session";

export const metadata = { title: "Two-factor" };

export default async function MfaPage() {
  const user = await requireUserBeforeMfa();
  if (user.mfaPassed) redirect("/");
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-3">
          <LogoMark size={40} state="open" className="text-ink" />
          <h1 className="display text-4xl text-ink">One more step.</h1>
          <p className="text-soft leading-relaxed">
            Enter the code from your authenticator app for {user.email}, or one of your backup codes.
          </p>
        </div>
        <MfaChallenge />
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/sign-in" });
          }}
        >
          <Button type="submit" variant="ghost" className="w-full">
            Sign out
          </Button>
        </form>
      </div>
    </main>
  );
}
