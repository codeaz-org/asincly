"use client";

import { useEffect } from "react";
import { LogoMark } from "@/components/brand/mark";
import { Button } from "@/components/ui/button";

export default function TeamError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[team page]", error.digest ?? error.message);
  }, [error]);
  return (
    <div className="min-h-[60dvh] grid place-items-center px-6">
      <div className="max-w-sm text-center flex flex-col items-center gap-5">
        <LogoMark size={44} state="missed" className="text-ink" />
        <div className="space-y-2">
          <h1 className="display text-2xl">Something slipped.</h1>
          <p className="text-sm text-soft">
            We couldn&rsquo;t load this page. Your check-ins are safe — try again in a moment.
          </p>
        </div>
        <Button variant="primary" onClick={reset}>
          Try again
        </Button>
      </div>
    </div>
  );
}
