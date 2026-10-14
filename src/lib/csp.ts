// Content-Security-Policy, built per request in src/proxy.ts with a fresh
// nonce. Next applies the nonce to its own scripts (it reads it from this
// header during SSR), and 'strict-dynamic' lets those load their chunks, so
// no script runs that the server didn't mark — no 'unsafe-inline'.
//
// The browser uploads recordings straight to the bucket via presigned URLs
// (never through our API), so the S3 origin is allowed for fetch (PUT),
// media (signed-GET playback) and images (poster frames). Nothing else
// off-origin: user markdown can't pull in tracking pixels.
export function buildCsp(nonce: string, env: { dev: boolean; s3Endpoint?: string; appUrl?: string }): string {
  const s3 = originOf(env.s3Endpoint);
  const extra = s3 ? ` ${s3}` : "";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${env.dev ? " 'unsafe-eval'" : ""}`,
    // Inline styles stay allowed: style attributes are everywhere (Tailwind
    // arbitrary values, the emoji picker), and they can't execute code.
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob:${extra}`,
    `media-src 'self' blob:${extra}`,
    "font-src 'self' data:",
    `connect-src 'self'${extra}${env.dev ? " ws: http://localhost:*" : ""}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    // Keyed on how the app itself is served: over https, upgrade everything.
    // A plain-http self-host (MinIO on http) would break with it.
    ...(env.appUrl?.startsWith("https://") ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

function originOf(url: string | undefined): string {
  try {
    return url ? new URL(url).origin : "";
  } catch {
    return "";
  }
}
