"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "cn";
import { MarkLoader } from "@/components/brand/loader";
import { Button } from "@/components/ui/button";
import { openBillingPortal, startCheckout } from "@/lib/actions/billing";
import type { BillingInterval } from "@/lib/validation/billing";

export function UpgradeButton({
  teamId,
  seats,
  prices,
}: {
  teamId: string;
  seats: number;
  prices: Record<BillingInterval, string>;
}) {
  const [interval, setBillingInterval] = useState<BillingInterval>("year");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label="Billing period" className="inline-flex rounded-xl border border-line p-0.5 text-sm">
        {(
          [
            ["month", "Monthly"],
            ["year", "Yearly · 2 months free"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={interval === value}
            onClick={() => setBillingInterval(value)}
            className={cn(
              "h-8 rounded-[10px] px-3 transition",
              interval === value ? "bg-ink/[0.08] text-ink" : "text-soft hover:text-ink",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="primary"
          size="lg"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null);
              const res = await startCheckout({ teamId, interval });
              if (res.ok) window.location.assign(res.url);
              else setError(res.error);
            })
          }
        >
          {pending ? <MarkLoader size="xs" label="Opening checkout" className="[&_span]:text-amber-ink" /> : "Upgrade to Pro"}
        </Button>
        <span className="text-sm text-soft">
          {seats} member{seats === 1 ? "" : "s"} × {prices[interval]} / {interval}
        </span>
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export function ManageBillingButton({ teamId, label = "Manage billing" }: { teamId: string; label?: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2">
      <Button
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const res = await openBillingPortal({ teamId });
            if (res.ok) window.location.assign(res.url);
            else setError(res.error);
          })
        }
      >
        {pending ? <MarkLoader size="xs" label="Opening" /> : label}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

// After checkout Stripe redirects here before the webhook may have landed.
// Refresh for a little while until the page shows Pro.
export function ConfirmingPayment() {
  const router = useRouter();
  const [gaveUp, setGaveUp] = useState(false);
  useEffect(() => {
    let n = 0;
    const id = window.setInterval(() => {
      n += 1;
      if (n > 15) {
        window.clearInterval(id);
        setGaveUp(true);
        return;
      }
      router.refresh();
    }, 2000);
    return () => window.clearInterval(id);
  }, [router]);
  return (
    <div role="status" className="flex items-center gap-3 rounded-2xl border border-amber/25 bg-amber/[0.05] px-4 py-3 text-sm text-ink">
      {gaveUp ? (
        <span>Payment received. Your plan updates in a minute or two. Reload this page to check.</span>
      ) : (
        <MarkLoader size="sm" label="Confirming your payment with Stripe…" />
      )}
    </div>
  );
}
