// Content-Security-Policy, built per request in src/proxy.ts with a fresh
// nonce. Next applies the nonce to its own scripts (it reads it from this
// header during SSR), and 'strict-dynamic' lets those load their chunks, so
// no script runs that the server didn't mark — no 'unsafe-inline'.
//
// The browser uploads recordings straight to the bucket via presigned URLs
// (never through our API), so the S3 origin is allowed for fetch (PUT),
// media (signed-GET playback) and images (poster frames). Nothing else
// off-origin: user markdown can't pull in tracking pixels.
export function buildCsp(
  nonce: string,
  env: { dev: boolean; s3Endpoint?: string; s3Bucket?: string; s3PathStyle?: boolean; appUrl?: string },
): string {
  const s3 = bucketOrigin(env.s3Endpoint, env.s3Bucket, env.s3PathStyle);
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

// Where presigned URLs point: the endpoint itself in path style (MinIO), or
// the bucket's subdomain of it in virtual-hosted style (R2, S3), matching how
// src/lib/s3.ts signs them.
function bucketOrigin(endpoint: string | undefined, bucket: string | undefined, pathStyle = true): string {
  try {
    if (!endpoint) return "";
    const u = new URL(endpoint);
    if (!pathStyle && bucket) u.hostname = `${bucket}.${u.hostname}`;
    return u.origin;
  } catch {
    return "";
  }
}
