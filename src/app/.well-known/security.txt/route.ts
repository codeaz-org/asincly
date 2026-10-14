import { operator } from "@/lib/legal";

// RFC 9116. Expires a year out from each request, so it never goes stale.
export function GET() {
  const op = operator();
  // No contact configured: no file, rather than one pointing nowhere.
  if (!process.env.LEGAL_SECURITY_EMAIL && !process.env.LEGAL_EMAIL) return new Response("Not found", { status: 404 });
  const app = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const body = [
    `Contact: mailto:${op.securityEmail}`,
    `Expires: ${new Date(Date.now() + 365 * 86_400_000).toISOString()}`,
    `Policy: ${app}/legal/security`,
    "Preferred-Languages: en",
    "",
  ].join("\n");
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8" } });
}
