import Link from "next/link";
import { Footer } from "@/components/footer";
import { Logo } from "@/components/logo";

const LINKS = [
  ["/legal/terms", "Terms"],
  ["/legal/privacy", "Privacy"],
  ["/legal/cookies", "Cookies"],
  ["/legal/security", "Security"],
] as const;

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-ground/80 backdrop-blur-xl">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 h-16 flex items-center gap-4">
          <Logo size={22} className="text-ink" />
          <span className="flex-1" />
          <nav aria-label="Legal" className="flex gap-4 text-sm text-soft overflow-x-auto">
            {LINKS.map(([href, label]) => (
              <Link key={href} href={href} className="hover:text-ink transition whitespace-nowrap">
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <article className="mx-auto max-w-2xl px-4 sm:px-6 py-12 md:py-16 space-y-5 [&_a]:text-amber [&_a]:underline-offset-4 [&_a:hover]:underline">
          {children}
        </article>
      </main>

      <Footer />
    </div>
  );
}
