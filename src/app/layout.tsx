import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Noto_Color_Emoji } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Fallback for systems without a colour emoji font (most Linux desktops), so
// reactions look the same everywhere. Google splits it by unicode-range, so
// browsers only download the glyphs actually on screen.
const notoEmoji = Noto_Color_Emoji({
  variable: "--font-emoji",
  weight: "400",
  subsets: ["emoji"],
  preload: false,
});

const description =
  "Async standups for remote teams. Your team checks in during their own morning. A short screen and camera recording turns into a scannable summary. Nobody waits on anybody.";

export const viewport: Viewport = {
  themeColor: "#1c1814",
  colorScheme: "dark",
};

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
      className={`dark ${geistSans.variable} ${geistMono.variable} ${notoEmoji.variable} h-full`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        {children}
      </body>
    </html>
  );
}
