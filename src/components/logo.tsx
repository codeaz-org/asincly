import Link from "next/link";

// The Asincly mark: sunrise on the timeline. Three bold shapes sized to
// survive 16px: an amber half-disc rising over an emerald baseline with one
// awake teammate dot. Same geometry in the favicon (src/app/icon.svg).

export function LogoMark({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className="shrink-0"
    >
      <path d="M3.5 15.5a6.5 6.5 0 0 1 13 0Z" fill="oklch(0.80 0.14 60)" />
      <line
        x1="2.25"
        y1="15.5"
        x2="21.75"
        y2="15.5"
        stroke="oklch(0.72 0.16 155)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <circle cx="19.25" cy="15.5" r="3.1" fill="oklch(0.72 0.16 155)" />
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
