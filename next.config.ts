import type { NextConfig } from "next";

// The Content-Security-Policy is set per request in src/proxy.ts: it carries
// a nonce, which a static header can't.
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(self), display-capture=(self), geolocation=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

// Next blocks dev resources (HMR, chunks) for any host other than localhost, so
// opening the dev server from a phone via the LAN IP serves HTML that never
// hydrates. Opt-in per machine; never applies to production builds.
const allowedDevOrigins = (process.env.DEV_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  // Self-contained server for the Docker image; ignored on Vercel.
  output: "standalone",
  poweredByHeader: false,
  allowedDevOrigins,
  // Browsers ask for /favicon.ico regardless of <link rel="icon">.
  async redirects() {
    return [{ source: "/favicon.ico", destination: "/icon.svg", permanent: true }];
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
