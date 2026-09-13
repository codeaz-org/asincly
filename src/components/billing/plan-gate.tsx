import Link from "next/link";
import { cn } from "cn";
import { LogoMark } from "@/components/brand/mark";
import { buttonVariants } from "@/components/ui/button";

// The one calm card shown wherever a Free plan limit is reached. `href` is the
// Plan & billing page; members who can't change the plan get `canUpgrade=false`
// and a nudge to ask their owner instead.
export function PlanGate({
  title,
  hint,
  href,
  canUpgrade = true,
  compact = false,
  className,
}: {
  title: string;
  hint?: React.ReactNode;
  href: string;
  canUpgrade?: boolean;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      data-testid="plan-gate"
      className={cn(
        "rounded-2xl border border-amber/25 bg-amber/[0.04] flex gap-4",
        compact ? "items-center px-4 py-3" : "flex-col items-center text-center px-6 py-10",
        className,
      )}
    >
      <LogoMark size={compact ? 20 : 36} state="before" className="text-ink shrink-0" />
      <div className={cn("space-y-1", compact && "flex-1 min-w-0")}>
        <p className={cn("font-medium text-ink", compact ? "text-sm" : "text-base")}>{title}</p>
        {hint && <p className={cn("text-soft", compact ? "text-xs" : "text-sm max-w-sm")}>{hint}</p>}
        {!canUpgrade && <p className="text-xs text-faint">Ask your team owner to upgrade.</p>}
      </div>
      {canUpgrade && (
        <Link href={href} className={buttonVariants({ variant: compact ? "secondary" : "primary", size: compact ? "sm" : "md" })}>
          See Pro
        </Link>
      )}
    </div>
  );
}
