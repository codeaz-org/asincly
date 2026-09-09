import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-white/[0.06] mt-16">
      <div className="mx-auto max-w-5xl px-6 py-8 flex flex-wrap items-center justify-between gap-4">
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Asincly</span>
          <span className="mx-2 text-muted-foreground/40">·</span>
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
