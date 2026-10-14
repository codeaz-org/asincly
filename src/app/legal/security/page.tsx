import { H2, LegalHeader, P, UL } from "@/components/legal";
import { operator } from "@/lib/legal";

export const metadata = { title: "Security" };

export default function SecurityPage() {
  const op = operator();
  return (
    <>
      <LegalHeader title="Security" />

      <H2>Reporting a vulnerability</H2>
      <P>
        Please don&rsquo;t open public GitHub issues for security problems. Email{" "}
        <a href={`mailto:${op.securityEmail}`}>{op.securityEmail}</a> with what you found, how to reproduce it, and the
        version or URL affected. We acknowledge within 2 business days and aim to fix high-severity issues within 30
        days. Coordinated disclosure appreciated; we credit reporters who want it. Machine-readable contact:{" "}
        <a href="/.well-known/security.txt">/.well-known/security.txt</a>.
      </P>

      <H2>In scope</H2>
      <UL>
        <li>Anything that lets one team or organization read, change or delete another&rsquo;s data</li>
        <li>Getting a recording, transcript or summary without access to its team</li>
        <li>Authentication bypass, session fixation, sign-in link replay, two-factor bypass</li>
        <li>SSRF, RCE, SQL or template injection, XSS that runs under our Content-Security-Policy</li>
        <li>Secrets or personal data leaking into logs, error pages or client bundles</li>
      </UL>

      <H2>Out of scope</H2>
      <UL>
        <li>Denial of service by traffic volume; social engineering; physical attacks</li>
        <li>Findings that need a compromised device or browser</li>
      </UL>

      <H2>How Asincly protects data</H2>
      <UL>
        <li>Every request runs as the signed-in person under Postgres row-level security keyed on team membership; code that bypasses it is limited to a reviewed list.</li>
        <li>Transcripts, summaries, AI drafts, Slack tokens and 2FA secrets are encrypted with AES-256-GCM, bound to their record, with a rotatable key.</li>
        <li>Recordings upload from the browser straight to private storage, with the size fixed in the signature; playback links expire within minutes.</li>
        <li>Optional TOTP two-factor (required per organization for owners and admins), session management, and enforced Google SSO per domain.</li>
        <li>Rate limits on sign-in, uploads, AI processing and exports, shared across all instances.</li>
        <li>A nonce-based Content-Security-Policy, HSTS, and framing denied.</li>
        <li>An audit log of administrative actions: role and ownership changes, exports, deletions, security settings.</li>
        <li>Personal data kept out of logs; dependency advisories checked in CI.</li>
      </UL>
    </>
  );
}
