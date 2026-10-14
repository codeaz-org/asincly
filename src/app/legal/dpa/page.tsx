import Link from "next/link";
import { H2, H3, LegalHeader, P, Table, UL } from "@/components/legal";
import { dataRegion, LEGAL_EFFECTIVE, LEGAL_VERSION, operator } from "@/lib/legal";
import { SOURCE_URL } from "@/lib/source";

export const metadata = { title: "Data Processing Agreement" };

export default function DpaPage() {
  const op = operator();
  return (
    <>
      <LegalHeader
        title="Data Processing Agreement"
        intro={`Version ${LEGAL_VERSION}, effective ${LEGAL_EFFECTIVE}. Part of the Terms of Service; accepted when an organization is created.`}
      />

      <P>
        This agreement (&ldquo;DPA&rdquo;) sets out how <strong>{op.name}</strong> (&ldquo;Processor&rdquo;) processes
        personal data for the organization using Asincly (&ldquo;Controller&rdquo;), as required by Article 28 of the
        GDPR. It applies to the team content described in Annex 1; data we process as a controller is covered by the{" "}
        <Link href="/legal/privacy">Privacy Policy</Link>. If this DPA and the Terms conflict on data protection, this
        DPA wins.
      </P>

      <H2>1. Instructions</H2>
      <P>
        We process the personal data only on the Controller&rsquo;s documented instructions: these terms, the
        Controller&rsquo;s configuration of Asincly (teams, retention, AI drafting, integrations), and any other written
        instruction we agree. We tell the Controller if we think an instruction breaks data protection law. We never use
        the data for our own purposes, to train AI models, or for advertising.
      </P>

      <H2>2. Confidentiality</H2>
      <P>Everyone we authorize to access the data is bound by confidentiality and accesses it only as needed to run and support the service.</P>

      <H2>3. Security</H2>
      <P>We maintain the technical and organizational measures in Annex 2 and keep them up to date with the state of the art.</P>

      <H2>4. Subprocessors</H2>
      <P>
        The Controller authorizes the subprocessors on the <Link href="/legal/subprocessors">Subprocessors</Link> page.
        We email organization owners at least 30 days before adding or replacing one; the Controller may object on
        reasonable data-protection grounds within that time, and if we can&rsquo;t resolve the objection, may end the
        affected service with a pro-rata refund. We impose the same data-protection obligations on each subprocessor and
        remain responsible for them.
      </P>

      <H2>5. International transfers</H2>
      <P>
        Where subprocessors process data outside the EU/EEA, transfers rely on an adequacy decision (including the
        EU–US Data Privacy Framework for certified recipients) or the Standard Contractual Clauses (Commission
        Decision 2021/914, module 3 between us and the subprocessor), with supplementary measures where needed.
      </P>

      <H2>6. Helping the Controller</H2>
      <UL>
        <li>
          <strong>Data subject requests:</strong> the product handles export, correction, deletion and AI opt-out; for
          anything else we help within a reasonable time and forward requests we receive directly.
        </li>
        <li>
          <strong>Impact assessments:</strong> we provide the information the Controller needs for a DPIA and prior
          consultation, including our <a href={`${SOURCE_URL}/blob/main/docs/legal/DPIA.md`}>DPIA template</a>.
        </li>
        <li>
          <strong>Personal data breaches:</strong> we notify the Controller without undue delay and at the latest within
          48 hours of becoming aware, with what we know and update it as we learn more.
        </li>
      </UL>

      <H2>7. End of the service</H2>
      <P>
        The Controller can export its data at any time. When an organization is deleted, its data is deleted from the
        database and storage straight away and from backups as they roll over, unless the law requires us to keep it.
      </P>

      <H2>8. Audits</H2>
      <P>
        We make available the information needed to show compliance with this DPA and Article 28, and allow audits by
        the Controller or an auditor it mandates, with reasonable notice, at most once a year unless a breach or a
        supervisory authority requires otherwise, and under confidentiality.
      </P>

      <H2>Annex 1 — Processing details</H2>
      <Table
        head={["", ""]}
        rows={[
          ["Subject matter and purpose", "Running asynchronous standups for the Controller's teams: collecting, showing, transcribing and summarizing check-ins, reminders and notifications"],
          ["Duration", "For as long as the Controller uses Asincly, then until deletion as in section 7"],
          ["Data subjects", "The Controller's staff and other people it invites (members, admins, guests)"],
          [
            "Personal data",
            "Names, work email addresses, time zones; check-in text; video and audio recordings (image and voice); transcripts, AI summaries and drafts; replies, reactions, mentions; availability (away periods); activity timestamps",
          ],
          ["Special categories", "None intended. Recordings show a person's image and voice; the Controller should tell staff not to include sensitive data"],
          ["Location", `Hosted in ${dataRegion()}; subprocessors as listed`],
        ]}
      />

      <H2>Annex 2 — Technical and organizational measures</H2>
      <H3>Access control</H3>
      <UL>
        <li>Postgres row-level security keyed on team membership on the request path; the owner connection is limited to reviewed code paths.</li>
        <li>Roles per team (owner, admin, member, guest); organization owner for billing and deletion.</li>
        <li>Optional TOTP two-factor authentication, which organizations can require for owners and admins; enforced Google SSO per domain.</li>
        <li>Session list with remote sign-out; sign-in links expire after one hour and work once.</li>
      </UL>
      <H3>Encryption</H3>
      <UL>
        <li>TLS for all traffic.</li>
        <li>Transcripts, summaries, AI drafts, Slack tokens and 2FA secrets encrypted with AES-256-GCM, bound to their record, with key rotation.</li>
        <li>Recordings in private storage, uploaded directly from the browser and played back through links that expire within minutes; uploads are size-limited by signature.</li>
      </UL>
      <H3>Integrity, availability, resilience</H3>
      <UL>
        <li>Rate limits on sign-in, uploads, AI processing and exports; strict Content-Security-Policy and security headers.</li>
        <li>Daily database backups; health monitoring; dependency vulnerability scanning.</li>
        <li>Audit log of administrative actions (role changes, exports, deletions, settings).</li>
      </UL>
      <H3>Data minimization and deletion</H3>
      <UL>
        <li>Per-team recording retention; nightly purge of expired recordings and orphaned files; notifications kept 90 days.</li>
        <li>Personal data is kept out of application logs.</li>
        <li>AI processing can be switched off per team and per person.</li>
      </UL>

      <H2>Annex 3 — Subprocessors</H2>
      <P>
        As listed on <Link href="/legal/subprocessors">Subprocessors</Link>, as amended under section 4.
      </P>
    </>
  );
}
