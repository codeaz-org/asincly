import Link from "next/link";
import { redirect } from "next/navigation";
import { MailCheck } from "lucide-react";
import { auth, signIn } from "@/auth";
import { LogoMark } from "@/components/brand/mark";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";

export const metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  Verification: "That link expired or was already used. Send a new one.",
  Configuration: "Sign-in is misconfigured on this server.",
  AccessDenied: "That account can't sign in here.",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const session = await auth();
  if (session?.user) redirect("/");
  const { sent, error } = await searchParams;
  const hasGoogle = !!process.env.AUTH_GOOGLE_ID && !!process.env.AUTH_GOOGLE_SECRET;

  return (
    <div className="min-h-dvh grid lg:grid-cols-[1.1fr_1fr]">
      {/* The two worlds from the landing page: the cold meeting collapses,
          the warm morning takes the screen. */}
      <aside aria-hidden className="relative hidden lg:block overflow-hidden border-r border-line">
        <div
          className="absolute inset-y-0 left-0 w-[18%]"
          style={{ background: "linear-gradient(180deg, oklch(0.94 0.006 240), oklch(0.86 0.01 240))" }}
        >
          <p className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-90 whitespace-nowrap font-mono text-[10px] tracking-[0.3em] uppercase text-[oklch(0.45_0.02_250)]">
            the meeting
          </p>
        </div>
        <div className="absolute inset-y-0 left-[18%] w-0.5 bg-amber shadow-[0_0_24px_oklch(0.78_0.15_60/0.7)]" />
        <div
          className="absolute inset-y-0 left-[18%] right-0"
          style={{
            background:
              "radial-gradient(ellipse 120% 90% at 80% 110%, oklch(0.3 0.06 50 / 0.6), transparent 60%), radial-gradient(ellipse 80% 60% at 90% -10%, oklch(0.26 0.04 70 / 0.6), transparent 55%)",
          }}
        />
        <div className="absolute inset-y-0 left-[18%] right-0 flex flex-col justify-between p-12">
          <Logo size={26} className="text-ink" />
          <div className="space-y-6 max-w-md">
            <p className="kicker text-amber">asincly · async standups</p>
            <p className="display text-6xl text-ink">No meeting.<br />Nothing missed.</p>
            <p className="text-lg text-soft leading-relaxed">
              Two minutes in your own morning. The team reads it in theirs.
            </p>
          </div>
          <p className="text-xs text-faint">open source (AGPL-3.0) · self-hostable · encrypted at rest</p>
        </div>
      </aside>

      <main className="flex flex-col px-5 sm:px-8">
        <header className="h-16 flex items-center lg:hidden">
          <Logo size={24} className="text-ink" />
        </header>
        <div className="flex-1 grid place-items-center py-10">
          <div className="w-full max-w-sm space-y-8">
            {sent ? (
              <div className="space-y-6 animate-rise-in">
                <span className="grid place-items-center size-14 rounded-2xl bg-amber/[0.12] text-amber">
                  <MailCheck className="size-7" />
                </span>
                <div className="space-y-2">
                  <h1 className="display text-4xl text-ink">Check your inbox.</h1>
                  <p className="text-soft leading-relaxed">
                    We sent a sign-in link. It works once and expires in 24 hours — you can close this tab.
                  </p>
                </div>
                <Link href="/sign-in" className="inline-block text-sm text-soft hover:text-ink underline-offset-4 hover:underline">
                  Use a different email
                </Link>
              </div>
            ) : (
              <>
                <div className="space-y-3">
                  <LogoMark size={40} state="open" className="text-ink hidden lg:block" />
                  <h1 className="display text-4xl sm:text-5xl text-ink">Good morning.</h1>
                  <p className="text-soft leading-relaxed">
                    Sign in with your work email. We&rsquo;ll send a one-time link, no password.
                  </p>
                </div>

                {error && (
                  <p role="alert" className="rounded-xl border border-danger/30 bg-danger/[0.06] px-4 py-3 text-sm text-ink">
                    {ERRORS[error] ?? "Something went wrong signing in. Try again."}
                  </p>
                )}

                <form
                  action={async (formData) => {
                    "use server";
                    await signIn("resend", { email: formData.get("email"), redirectTo: "/" });
                  }}
                  className="space-y-3"
                >
                  <label htmlFor="email" className="sr-only">
                    Work email
                  </label>
                  <Input id="email" name="email" type="email" required autoFocus autoComplete="email" placeholder="you@company.com" />
                  <Button type="submit" variant="primary" size="lg" className="w-full">
                    Email me a link
                  </Button>
                </form>

                {hasGoogle && (
                  <>
                    <div className="flex items-center gap-3 kicker text-[10px]">
                      <span className="flex-1 h-px bg-line" />
                      or
                      <span className="flex-1 h-px bg-line" />
                    </div>
                    <form
                      action={async () => {
                        "use server";
                        await signIn("google", { redirectTo: "/" });
                      }}
                    >
                      <Button type="submit" variant="secondary" size="lg" className="w-full">
                        Continue with Google
                      </Button>
                    </form>
                  </>
                )}
              </>
            )}
            <p className="text-xs text-faint">
              By continuing you agree to the{" "}
              <Link href="/legal/terms" className="underline hover:text-ink">
                Terms
              </Link>{" "}
              and{" "}
              <Link href="/legal/privacy" className="underline hover:text-ink">
                Privacy Policy
              </Link>
              .
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
