import Link from "next/link";
import { Logo } from "@/components/logo";
import { SOURCE_URL } from "@/lib/source";

export function Footer() {
  return (
    <footer className="border-t border-line mt-16">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-8 flex flex-wrap items-center justify-between gap-4">
        <p className="text-xs text-soft inline-flex items-center gap-2">
          <Logo size={18} className="text-ink text-xs" href="/" />
          <span className="text-faint">·</span>
          Open source ·{" "}
          <a href={SOURCE_URL} target="_blank" rel="noopener noreferrer" className="hover:text-ink transition">
            AGPL-3.0
          </a>
        </p>
        <nav aria-label="Footer" className="flex flex-wrap gap-4 text-xs text-soft">
          <Link href="/legal/terms" className="hover:text-ink transition">
            Terms
          </Link>
          <Link href="/legal/privacy" className="hover:text-ink transition">
            Privacy
          </Link>
          <Link href="/legal/cookies" className="hover:text-ink transition">
            Cookies
          </Link>
          <Link href="/legal/security" className="hover:text-ink transition">
            Security
          </Link>
          <a href={SOURCE_URL} target="_blank" rel="noopener noreferrer" className="hover:text-ink transition">
            Source code
          </a>
        </nav>
      </div>
    </footer>
  );
}
