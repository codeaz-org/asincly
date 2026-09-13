import { cn } from "cn";
import { LogoMark, type MarkState } from "@/components/brand/mark";

export function Empty({
  title,
  hint,
  state = "before",
  action,
  className,
}: {
  title: string;
  hint?: React.ReactNode;
  state?: MarkState;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-dashed border-line px-6 py-12 flex flex-col items-center text-center gap-4",
        className,
      )}
    >
      <LogoMark size={40} state={state} className="text-ink" />
      <div className="space-y-1.5">
        <p className="text-base font-medium text-ink">{title}</p>
        {hint && <p className="text-sm text-soft max-w-sm">{hint}</p>}
      </div>
      {action}
    </div>
  );
}
