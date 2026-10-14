"use client";

import Link from "next/link";
import { LogoMark } from "@/components/brand/mark";
import { Button, buttonVariants } from "@/components/ui/button";

// Everything outside the team shell (sign-in, onboarding, account, legal).
export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="min-h-dvh grid place-items-center px-6">
      <div className="max-w-sm text-center flex flex-col items-center gap-5">
        <LogoMark size={44} state="missed" className="text-ink" />
        <div className="space-y-2">
          <h1 className="display text-2xl">Something slipped.</h1>
          <p className="text-sm text-soft">That didn&rsquo;t work. Nothing you saved is lost — try again in a moment.</p>
          {error.digest && <p className="font-mono text-[11px] text-faint">ref {error.digest}</p>}
        </div>
        <div className="flex gap-2">
          <Button variant="primary" onClick={reset}>
            Try again
          </Button>
          <Link href="/" className={buttonVariants({ variant: "secondary" })}>
            Home
          </Link>
        </div>
      </div>
    </main>
  );
}
