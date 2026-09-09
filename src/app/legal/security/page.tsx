export const metadata = { title: "Security · Asincly" };

export default function SecurityPage() {
  return (
    <>
      <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Legal</p>
      <h1 className="text-4xl font-medium tracking-tight">Security</h1>

      <h2 className="text-xl font-medium mt-8">Reporting a vulnerability</h2>
      <p className="text-sm leading-relaxed">
        Please don&rsquo;t open public GitHub issues for security problems. Email{" "}
        <a href="mailto:security@asincly.com" className="underline hover:text-accent">
          security@asincly.com
        </a>
        with a description of the issue, steps to reproduce, and the affected version.
        We&rsquo;ll acknowledge within 2 business days and aim to ship a fix within 30
        days for high-severity issues. Coordinated disclosure appreciated.
      </p>

      <h2 className="text-xl font-medium mt-8">Scope</h2>
      <ul className="text-sm space-y-1 list-disc pl-5">
        <li>Anything that lets one team read, modify, or delete another team&rsquo;s data</li>
        <li>Recording, transcript, or summary exposure via unsigned URLs or leaked keys</li>
        <li>Auth bypass, session fixation, magic-link replay</li>
        <li>SSRF, RCE, SQL injection, template injection</li>
        <li>Secrets leaking to logs, error reports, or client bundles</li>
      </ul>

      <h2 className="text-xl font-medium mt-8">Out of scope</h2>
      <ul className="text-sm space-y-1 list-disc pl-5">
        <li>Rate limiting on public marketing pages</li>
        <li>Denial-of-service via traffic volume</li>
        <li>Social engineering</li>
        <li>Physical attacks</li>
      </ul>

      <h2 className="text-xl font-medium mt-8">What we do</h2>
      <ul className="text-sm space-y-1 list-disc pl-5">
        <li>Postgres row-level security is FORCE-enabled on every domain table.</li>
        <li>Transcripts and summaries are AES-256-GCM encrypted at rest.</li>
        <li>Uploads go browser → pre-signed PUT → bucket, never through the API.</li>
        <li>Rate limiting on onboarding, invite, and upload-URL endpoints.</li>
        <li>Audit log on every mutation.</li>
        <li>Strict CSP + HSTS + <code>X-Frame-Options: DENY</code>.</li>
      </ul>
    </>
  );
}
