import { cn } from "cn";

export function Card({
  className,
  as: Tag = "div",
  ...props
}: React.HTMLAttributes<HTMLElement> & { as?: "div" | "section" | "li" | "article" }) {
  return (
    <Tag
      className={cn(
        "rounded-2xl border border-line bg-ground-raised/70 shadow-[0_18px_40px_-24px_oklch(0_0_0/0.6),inset_0_1px_0_oklch(0.94_0.02_75/0.04)]",
        className,
      )}
      {...props}
    />
  );
}

export function SectionTitle({
  children,
  count,
  action,
  className,
}: {
  children: React.ReactNode;
  count?: number;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3", className)}>
      <h2 className="kicker">
        {children}
        {count !== undefined && <span className="ml-2 text-faint tabular-nums">{count}</span>}
      </h2>
      {action}
    </div>
  );
}

export function Pill({
  className,
  tone = "neutral",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: "neutral" | "amber" | "danger" | "cold" }) {
  const tones = {
    neutral: "border-line text-soft bg-ink/[0.03]",
    amber: "border-amber/40 text-amber bg-amber/[0.08]",
    danger: "border-danger/40 text-danger bg-danger/[0.08]",
    cold: "border-cold/30 text-cold bg-cold/[0.06]",
  } as const;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
