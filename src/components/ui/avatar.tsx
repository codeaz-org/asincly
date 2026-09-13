import { cn } from "cn";
import { LogoMark, MARK_STATE_LABEL, type MarkState } from "@/components/brand/mark";
import { avatarHue, displayName, initials } from "@/lib/display";

// Initials disc tinted by a stable hue, with an optional status mark badge.
export function Avatar({
  name,
  email,
  size = 36,
  status,
  className,
}: {
  name: string | null;
  email: string;
  size?: number;
  status?: MarkState;
  className?: string;
}) {
  const dn = displayName(name, email);
  const hue = avatarHue(dn);
  const badge = Math.max(12, Math.round(size * 0.42));
  return (
    <span className={cn("relative inline-grid shrink-0", className)} style={{ width: size, height: size }}>
      <span
        aria-hidden
        className="grid place-items-center rounded-full font-semibold"
        style={{
          width: size,
          height: size,
          fontSize: Math.max(9, Math.round(size * 0.3)),
          background: `oklch(0.3 0.045 ${hue} / 0.75)`,
          color: `oklch(0.9 0.05 ${hue})`,
          boxShadow: `inset 0 0 0 1px oklch(0.7 0.08 ${hue} / 0.28)`,
        }}
      >
        {initials(name, email)}
      </span>
      {status && status !== "idle" && (
        <span
          className="absolute -right-1 -bottom-1 grid place-items-center rounded-full bg-ground text-ink"
          style={{ width: badge + 4, height: badge + 4 }}
        >
          <LogoMark size={badge} state={status} title={`${dn}: ${MARK_STATE_LABEL[status]}`} />
        </span>
      )}
    </span>
  );
}
