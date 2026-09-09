import Link from "next/link";

export const metadata = { title: "Privacy Policy · Asincly" };

export default function PrivacyPage() {
  return (
    <>
      <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Legal</p>
      <h1 className="text-4xl font-medium tracking-tight">Privacy Policy</h1>
      <p className="text-sm text-muted-foreground">
        Effective 2026-09-01. GDPR- and CCPA-aligned. Complements the AGPL-3.0 source
        code so nothing behind the curtain is a mystery.
      </p>

      <h2 className="text-xl font-medium mt-8">What we collect</h2>
      <ul className="text-sm space-y-1 list-disc pl-5">
        <li><strong>Account:</strong> email, name (optional), IANA time zone.</li>
        <li><strong>Team activity:</strong> your check-ins (yesterday / today / blockers markdown),
          recordings you upload, and derived AI transcripts + summaries.</li>
        <li><strong>Technical:</strong> auth session cookie, request logs (IP, user-agent, path)
          retained 30 days for abuse investigation and debugging.</li>
      </ul>

      <h2 className="text-xl font-medium mt-8">Why we collect it</h2>
      <p className="text-sm leading-relaxed">
        To make async standups work: showing your check-ins to your team, running AI on
        recordings you attach, sending reminders in your local morning, and preventing
        abuse.
      </p>

      <h2 className="text-xl font-medium mt-8">How it&rsquo;s protected</h2>
      <ul className="text-sm space-y-1 list-disc pl-5">
        <li>Postgres row-level security is FORCE-enabled on every domain table.</li>
        <li>Transcripts and summaries are AES-256-GCM encrypted at rest.</li>
        <li>Uploads use pre-signed URLs directly to object storage — the API never
          proxies media.</li>
        <li>TLS in transit. Strict CSP, HSTS, and X-Frame-Options: DENY on every response.</li>
      </ul>

      <h2 className="text-xl font-medium mt-8">Sub-processors we use</h2>
      <ul className="text-sm space-y-1 list-disc pl-5">
        <li><strong>Groq</strong> — transcribes recordings and generates summaries. Audio and
          transcripts are sent for processing; Groq&rsquo;s API terms apply.</li>
        <li><strong>Resend</strong> — sends notification emails.</li>
        <li><strong>Cloudflare R2 / MinIO (self-host)</strong> — stores recordings.</li>
        <li><strong>Neon / your Postgres</strong> — application database.</li>
      </ul>
      <p className="text-sm leading-relaxed">
        Self-hosters can swap or remove any of these by editing environment variables.
      </p>

      <h2 className="text-xl font-medium mt-8">Your rights</h2>
      <p className="text-sm leading-relaxed">
        You can export your team&rsquo;s data as JSON (Settings → Export) or delete your
        account entirely (Account → Delete account). Org owners can hard-delete the whole
        organization from team Settings. Deletion is immediate and permanent.
      </p>

      <h2 className="text-xl font-medium mt-8">Data retention</h2>
      <p className="text-sm leading-relaxed">
        Recordings are retained per team setting (default: 90 days; 0 = forever).
        Notifications: last 90 days. Auth sessions: 30 days of inactivity.
      </p>

      <h2 className="text-xl font-medium mt-8">Children</h2>
      <p className="text-sm leading-relaxed">Not intended for anyone under 16.</p>

      <h2 className="text-xl font-medium mt-8">Contact</h2>
      <p className="text-sm leading-relaxed">
        Privacy questions: <a href="mailto:privacy@asincly.com" className="underline hover:text-accent">privacy@asincly.com</a>.
        Security disclosures: see the <Link href="/legal/security" className="underline hover:text-accent">Security</Link> page.
      </p>
    </>
  );
}
