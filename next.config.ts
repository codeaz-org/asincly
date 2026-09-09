import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// The browser uploads recordings straight to the bucket via presigned URLs
// (never through our API), so the S3 endpoint's origin must be allowed for
// fetch (PUT upload) and media (signed-GET playback). Without this the CSP
// kills every upload with an opaque "Failed to fetch".
const s3Origin = (() => {
  try {
    return process.env.S3_ENDPOINT ? new URL(process.env.S3_ENDPOINT).origin : "";
  } catch {
    return "";
  }
})();

// ponytail: strict-but-pragmatic baseline. Tighten script-src to nonces and add
// third-party origins (Auth.js providers, Deepgram, Slack) as they land.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  `media-src 'self' blob: https:${s3Origin ? ` ${s3Origin}` : ""}`,
  "font-src 'self' data:",
  `connect-src 'self'${s3Origin ? ` ${s3Origin}` : ""}${isDev ? " ws: http://localhost:*" : ""}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  // Only meaningful when serving over https; when self-hosting on plain http
  // it would upgrade the MinIO endpoint to https and break uploads.
  ...(s3Origin.startsWith("http://") ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(self), display-capture=(self), geolocation=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
