import Link from "next/link";

// The Asincly mark: a sun half-risen over the ribbon, one teammate dot
// already awake to its right. Same geometry everywhere — favicon, headers,
// footer — only size and wordmark presence vary.

export function LogoMark({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden
      className="shrink-0"
    >
      {/* rising sun (half-disc above the horizon) */}
      <path
        d="M6 19a7 7 0 0 1 14 0Z"
        fill="oklch(0.80 0.14 60)"
      />
      {/* the ribbon / horizon */}
      <line
        x1="3"
        y1="19"
        x2="29"
        y2="19"
        stroke="oklch(0.72 0.16 155)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* the awake teammate */}
      <circle cx="25.5" cy="19" r="3" fill="oklch(0.72 0.16 155)" />
      <circle cx="25.5" cy="19" r="1.2" fill="oklch(0.12 0.01 250)" />
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
          className="font-medium tracking-tight"
          style={{ fontSize: Math.round(size * 0.72) }}
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
