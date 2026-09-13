import Link from "next/link";

// The Asincly mark: the day mark. One disc split by a thin seam, night on the
// left in currentColor (so it adapts to any ground), morning in amber on the
// right, seam set left of center so the morning side is bigger. One day, split
// across time zones, and the morning wins. Same geometry in src/app/icon.svg.

export function LogoMark({ size = 24 }: { size?: number }) {
  const id = "lm";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className="shrink-0"
    >
      <defs>
        <clipPath id={`${id}-n`}>
          <rect x="0" y="0" width="10" height="24" />
        </clipPath>
        <clipPath id={`${id}-m`}>
          <rect x="12" y="0" width="12" height="24" />
        </clipPath>
      </defs>
      <circle cx="12" cy="12" r="9.75" fill="currentColor" clipPath={`url(#${id}-n)`} />
      <circle cx="12" cy="12" r="9.75" fill="oklch(0.78 0.15 60)" clipPath={`url(#${id}-m)`} />
    </svg>
  );
}

export function Logo({
  size = 20,
  wordmark = true,
  href = "/",
  className = "",
}: {
  size?: number;
  wordmark?: boolean;
  href?: string | null;
  className?: string;
}) {
  const inner = (
    <>
      <LogoMark size={size} />
      {wordmark && (
        <span
          className="font-semibold tracking-tight leading-none"
          style={{ fontSize: Math.round(size * 0.78) }}
        >
          asincly
        </span>
      )}
    </>
  );
  const cls = `inline-flex items-center gap-2 ${className}`;
  if (href === null) return <span className={cls}>{inner}</span>;
  return (
    <Link href={href} className={cls} aria-label="Asincly home">
      {inner}
    </Link>
  );
}
