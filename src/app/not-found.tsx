import Link from "next/link";
import { LogoMark } from "@/components/brand/mark";
import { Footer } from "@/components/footer";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col">
      <main className="flex-1 grid place-items-center px-6">
        <div className="max-w-md text-center flex flex-col items-center gap-6">
          <LogoMark size={56} state="asleep" className="text-ink" />
          <div className="space-y-3">
            <p className="kicker">404</p>
            <h1 className="display text-5xl text-ink">Nobody&rsquo;s awake here.</h1>
            <p className="text-soft">This page doesn&rsquo;t exist, or you don&rsquo;t have access to it.</p>
          </div>
          <Link href="/" className={buttonVariants({ variant: "primary", size: "lg" })}>
            Back to your team
          </Link>
        </div>
      </main>
      <Footer />
    </div>
  );
}
