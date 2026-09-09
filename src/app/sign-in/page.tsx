import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import { Footer } from "@/components/footer";
import { Logo } from "@/components/logo";

export default async function SignInPage() {
  const session = await auth();
  if (session?.user) redirect("/");

  const hasGoogle = !!process.env.AUTH_GOOGLE_ID && !!process.env.AUTH_GOOGLE_SECRET;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-white/[0.06]">
        <div className="mx-auto max-w-5xl px-6 h-14 flex items-center">
          <Logo size={22} className="text-sm" />
        </div>
      </header>
      <main className="flex-1 grid place-items-center px-6">
        <div className="w-full max-w-sm space-y-10">
        <div className="space-y-3">
          <span className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">
            <span className="size-1.5 rounded-full bg-accent shadow-[0_0_12px_theme(colors.emerald.400)]" />
            asincly
          </span>
          <h1 className="text-4xl font-medium tracking-tight leading-none">
            Sign in.
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Async standups without meetings. Enter your work email — we&rsquo;ll
            send a one-time link.
          </p>
        </div>

        <form
          action={async (formData) => {
            "use server";
            await signIn("resend", { email: formData.get("email"), redirectTo: "/" });
          }}
          className="space-y-3"
        >
          <input
            name="email"
            type="email"
            required
            autoFocus
            placeholder="you@company.com"
            className="w-full h-12 rounded-md bg-white/[0.02] border border-white/10 px-4 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:border-white/30 focus:bg-white/[0.04] transition"
          />
          <button
            type="submit"
            className="group w-full h-12 rounded-md bg-foreground text-primary-foreground text-sm font-medium hover:bg-foreground/90 active:scale-[0.99] transition"
          >
            Email me a link →
          </button>
        </form>

        {hasGoogle && (
          <>
            <div className="flex items-center gap-3 text-xs uppercase tracking-widest text-muted-foreground/60">
              <span className="flex-1 h-px bg-border" />
              or
              <span className="flex-1 h-px bg-border" />
            </div>
            <form
              action={async () => {
                "use server";
                await signIn("google", { redirectTo: "/" });
              }}
            >
              <button
                type="submit"
                className="w-full h-12 rounded-md border border-white/10 bg-white/[0.02] text-sm font-medium hover:bg-white/[0.04] transition"
              >
                Continue with Google
              </button>
            </form>
          </>
        )}
          <p className="text-[11px] text-muted-foreground text-center pt-4">
            By continuing you agree to our{" "}
            <Link href="/legal/terms" className="underline hover:text-foreground">
              Terms
            </Link>{" "}
            and{" "}
            <Link href="/legal/privacy" className="underline hover:text-foreground">
              Privacy Policy
            </Link>
            .
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
