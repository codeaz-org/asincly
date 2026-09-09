import type { Metadata } from "next";
import { Fraunces, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Editorial serif for the ribbon landing's peak + section headings.
// Optical size axis pulls in one variable file, no per-weight requests.
const fraunces = Fraunces({
  variable: "--font-serif",
  subsets: ["latin"],
  axes: ["opsz"],
});

const description =
  "Async standups for remote teams. Your team checks in during their own morning. A short screen and camera recording turns into a scannable summary. Nobody waits on anybody.";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  title: {
    default: "Asincly — Standups that respect sleep",
    template: "%s · Asincly",
  },
  description,
  openGraph: {
    title: "Asincly — Standups that respect sleep",
    description,
    siteName: "Asincly",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Asincly — Standups that respect sleep",
    description,
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`dark ${geistSans.variable} ${geistMono.variable} ${fraunces.variable} h-full`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col selection:bg-emerald-400/25 selection:text-emerald-50">
        {children}
      </body>
    </html>
  );
}
