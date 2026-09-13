import { LogoMark } from "@/components/brand/mark";

// The day turning: the mark rotates around its seam. Used for every
// "something is happening" state (saving, uploading, summarizing, routing).

const SIZES = { xs: 12, sm: 16, md: 28, lg: 48 } as const;

export function MarkLoader({
  size = "sm",
  label,
  className = "",
}: {
  size?: keyof typeof SIZES;
  label?: string;
  className?: string;
}) {
  const px = SIZES[size];
  const stacked = size === "md" || size === "lg";
  return (
    <span
      role="status"
      aria-live="polite"
      className={`inline-flex items-center text-ink ${stacked ? "flex-col gap-3" : "gap-2"} ${className}`}
    >
      <LogoMark size={px} className="animate-mark-sweep" />
      {label ? (
        <span className={stacked ? "kicker" : "text-xs text-soft"}>{label}</span>
      ) : (
        <span className="sr-only">Loading</span>
      )}
    </span>
  );
}
