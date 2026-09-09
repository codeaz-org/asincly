export const metadata = { title: "Terms of Service · Asincly" };

export default function TermsPage() {
  return (
    <>
      <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Legal</p>
      <h1 className="text-4xl font-medium tracking-tight">Terms of Service</h1>
      <p className="text-sm text-muted-foreground">
        Effective 2026-09-01. Plain-language summary — the source of truth is the
        AGPL-3.0 license and this document.
      </p>

      <h2 className="text-xl font-medium mt-8">What Asincly is</h2>
      <p className="text-sm leading-relaxed">
        Asincly is async-standup software licensed under AGPL-3.0. You may run the
        self-hosted version on your own infrastructure. You may also use the hosted
        service at asincly.com under these terms.
      </p>

      <h2 className="text-xl font-medium mt-8">Your account</h2>
      <p className="text-sm leading-relaxed">
        You are responsible for the emails on your account, the content of your
        check-ins, and any videos you upload. Don&rsquo;t upload anything you don&rsquo;t
        have the right to share.
      </p>

      <h2 className="text-xl font-medium mt-8">Acceptable use</h2>
      <ul className="text-sm space-y-1 list-disc pl-5">
        <li>No harassment, hate, or targeted intimidation of teammates or third parties.</li>
        <li>No uploading of illegal content or content that violates others&rsquo; rights.</li>
        <li>No attempts to break the service, bypass rate limits, or exfiltrate data you
          shouldn&rsquo;t have.</li>
        <li>No automated posting or scraping without written permission.</li>
      </ul>

      <h2 className="text-xl font-medium mt-8">Data ownership</h2>
      <p className="text-sm leading-relaxed">
        You own your data. We store it to make the service work. Team owners can export
        (JSON) or hard-delete their organization at any time — that&rsquo;s permanent.
      </p>

      <h2 className="text-xl font-medium mt-8">Termination</h2>
      <p className="text-sm leading-relaxed">
        You can delete your account at any time from Account settings. We may suspend
        accounts that violate these terms or that abuse the service.
      </p>

      <h2 className="text-xl font-medium mt-8">Warranty & liability</h2>
      <p className="text-sm leading-relaxed">
        The software is provided <em>as-is</em>, with no warranty. Our maximum liability
        to you for the hosted service is capped at what you&rsquo;ve paid us in the last
        12 months (which for a free tier is $0).
      </p>

      <h2 className="text-xl font-medium mt-8">Changes</h2>
      <p className="text-sm leading-relaxed">
        Material changes to these terms will be announced in-app and by email at least
        14 days in advance.
      </p>

      <h2 className="text-xl font-medium mt-8">Contact</h2>
      <p className="text-sm leading-relaxed">
        <a href="mailto:hello@asincly.com" className="underline hover:text-accent">
          hello@asincly.com
        </a>
      </p>
    </>
  );
}
