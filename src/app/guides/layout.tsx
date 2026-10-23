import Link from "next/link";
import { notFound } from "next/navigation";
import { Footer } from "@/components/footer";
import { Logo } from "@/components/logo";
import { isBillingEnabled } from "@/lib/billing/plans";

// Hosted cloud only, like /pricing: a self-hosted install has no marketing pages.
export default function GuidesLayout({ children }: LayoutProps<"/guides">) {
  if (!isBillingEnabled()) notFound();
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-ground/80 backdrop-blur-xl">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 h-16 flex items-center gap-4">
          <Logo size={22} className="text-ink" />
          <span className="flex-1" />
          <Link href="/guides" className="text-sm text-soft hover:text-ink transition">
            Guides
          </Link>
          <Link href="/sign-in?utm_source=guide&utm_medium=organic" className="text-sm text-soft hover:text-ink transition">
            Start free
          </Link>
        </div>
      </header>
      <main className="flex-1">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 py-12 md:py-16">{children}</div>
      </main>
      <Footer />
    </div>
  );
}
