import Link from "next/link";
import { Footer } from "@/components/footer";
import { Logo } from "@/components/logo";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-background/80 backdrop-blur">
        <div className="mx-auto max-w-3xl px-6 h-14 flex items-center gap-4">
          <Logo size={22} className="text-sm" />
          <span className="text-muted-foreground/40">/</span>
          <span className="text-sm">Legal</span>
          <span className="flex-1" />
          <nav className="hidden md:flex gap-3 text-xs text-muted-foreground">
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
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <article className="mx-auto max-w-3xl px-6 py-12 md:py-16 space-y-6 prose-tight">
          {children}
        </article>
      </main>

      <Footer />
    </div>
  );
}
