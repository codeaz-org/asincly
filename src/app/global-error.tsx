"use client";

import "./globals.css";

// Replaces the root layout when the layout itself fails, so it brings its own
// <html> and <body> and depends on nothing that might be what broke.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-dvh grid place-items-center px-6 bg-ground text-ink">
        <div className="max-w-sm text-center space-y-4">
          <h1 className="text-2xl font-semibold">Asincly is having a moment.</h1>
          <p className="text-sm text-soft">Please try again shortly. Your check-ins are safe.</p>
          {error.digest && <p className="font-mono text-[11px] text-faint">ref {error.digest}</p>}
          <button type="button" onClick={reset} className="rounded-xl bg-amber px-5 py-2.5 text-sm font-semibold text-amber-ink">
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
