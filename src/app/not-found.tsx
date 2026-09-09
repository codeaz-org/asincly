import Link from "next/link";
import { Footer } from "@/components/footer";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col">
      <main className="flex-1 grid place-items-center px-6">
        <div className="max-w-md text-center space-y-4">
          <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
            404
          </p>
          <h1 className="text-5xl font-medium tracking-tight">Not here.</h1>
          <p className="text-sm text-muted-foreground">
            Either the page doesn&rsquo;t exist, or you don&rsquo;t have access to it.
          </p>
          <div className="pt-4">
            <Link
              href="/"
              className="h-11 px-5 rounded-md bg-foreground text-primary-foreground text-sm font-medium hover:bg-foreground/90 transition inline-flex items-center"
            >
              Back home
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
