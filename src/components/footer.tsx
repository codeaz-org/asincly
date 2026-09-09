import Link from "next/link";
import { Logo } from "@/components/logo";

export function Footer() {
  return (
    <footer className="border-t border-white/[0.06] mt-16">
      <div className="mx-auto max-w-5xl px-6 py-8 flex flex-wrap items-center justify-between gap-4">
        <p className="text-xs text-muted-foreground inline-flex items-center gap-2">
          <Logo size={18} className="text-foreground text-xs" href="/" />
          <span className="text-muted-foreground/40">·</span>
          AGPL-3.0 · self-hostable
        </p>
        <nav className="flex flex-wrap gap-4 text-xs text-muted-foreground">
          <Link href="/legal/terms" className="hover:text-foreground transition">
            Terms
          </Link>
          <Link href="/legal/privacy" className="hover:text-foreground transition">
            Privacy
          </Link>
          <Link href="/legal/cookies" className="hover:text-foreground transition">
            Cookies
          </Link>
          <Link href="/legal/security" className="hover:text-foreground transition">
            Security
          </Link>
          <a
            href="https://github.com/anthropics"
            className="hover:text-foreground transition"
            target="_blank"
            rel="noopener noreferrer"
          >
            Source
          </a>
        </nav>
      </div>
    </footer>
  );
}
