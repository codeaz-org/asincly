import { cn } from "cn";

// Text inputs share one quiet surface: raised ground, hairline, amber focus.
export const fieldClass =
  "w-full rounded-xl bg-ink/[0.03] border border-line px-4 text-[15px] text-ink placeholder:text-faint transition focus:outline-none focus:border-amber/60 focus:bg-ink/[0.05] focus:ring-2 focus:ring-amber/15 disabled:opacity-50";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return <input className={cn(fieldClass, "h-12", className)} {...props} />;
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea className={cn(fieldClass, "py-3 leading-relaxed resize-y", className)} {...props} />;
}

export function FieldLabel({
  children,
  hint,
  htmlFor,
  className,
}: {
  children: React.ReactNode;
  hint?: React.ReactNode;
  htmlFor?: string;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1", className)}>
      <label htmlFor={htmlFor} className="kicker block">
        {children}
      </label>
      {hint && <p className="text-[13px] text-soft">{hint}</p>}
    </div>
  );
}
