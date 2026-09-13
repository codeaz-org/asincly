import Link from "next/link";
import { LogoMark } from "@/components/brand/mark";

export { LogoMark };

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
