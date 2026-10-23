import Link from "next/link";
import { H2, H3, LegalHeader, P, Table, UL } from "@/components/legal";
import { dataRegion, LEGAL_EFFECTIVE, LEGAL_VERSION, operator } from "@/lib/legal";

export const metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  const op = operator();
  return (
    <>
      <LegalHeader title="Privacy Policy" intro={`Version ${LEGAL_VERSION}, effective ${LEGAL_EFFECTIVE}.`} />

      <P>
        Asincly runs asynchronous standups: people on a team check in with a short written note and, if they want, a
        video, and the team reads them instead of meeting. This policy says what personal data that involves, who is
        responsible for it, and what you can do about it.
      </P>

      <H2 id="who">Who is responsible</H2>
      <P>
        This service is operated by <strong>{op.name}</strong>, {op.address}, {op.country}
        {op.registration && <>, registration {op.registration}</>}
        {op.vatId && <>, VAT {op.vatId}</>}. Contact: <a href={`mailto:${op.email}`}>{op.email}</a>.
      </P>
      <P>We have two roles, and it matters which one applies:</P>
      <UL>
        <li>
          <strong>Your organization is the controller of what your team puts in Asincly</strong> — check-ins,
          recordings, transcripts, summaries, replies, reactions, away periods. We process that content as their
          processor, on their instructions, under our <Link href="/legal/dpa">Data Processing Agreement</Link>. If
          you&rsquo;re here because your employer uses Asincly, they decide why this data is collected and how long it
          is kept, and requests about it go to them first (we help them answer).
        </li>
        <li>
          <strong>We are the controller of the data we need to run the service itself</strong>: accounts and
          sign-in, security logs, billing, and service emails.
        </li>
      </UL>

      <H2 id="what">What we process, why, and on what basis</H2>
      <Table
        head={["Data", "Why", "Legal basis (GDPR Art. 6)"]}
        rows={[
          [
            "Account: email, name, time zone, sign-in method; sessions (device, network prefix, last active); 2FA settings",
            "To sign you in, keep your account secure and show you your teams",
            "Contract (b) with you or your organization; legitimate interest (f) in account security",
          ],
          [
            "Team content: check-ins, recordings, AI transcripts, summaries and drafts, replies, reactions, away periods, mentions",
            "To run your team's standups",
            "Processed for your organization, which determines the basis (often contract or legitimate interest towards its staff)",
          ],
          [
            "Campaign labels of the link you arrived on (utm_source, utm_medium, utm_campaign, utm_content), saved on an organization when it is created; anonymous daily visit counts per campaign label and guide page (no IP address, cookie or identifier); no tracking script is used",
            "To count, in aggregate, which channels bring visitors and new teams",
            "Legitimate interest (f) in knowing which outreach works",
          ],
          [
            "Notifications and email preferences",
            "Reminders when your window opens, mentions, replies",
            "Contract (b); you can turn emails off",
          ],
          [
            "Billing: organization owner's contact, company name, address, VAT ID, invoices (card details stay with Stripe)",
            "To charge for paid plans and keep tax records",
            "Contract (b); legal obligation (c) for tax records",
          ],
          [
            "Security and abuse records: audit log of administrative actions, rate-limit counters, request logs",
            "To protect accounts and the service, and investigate incidents",
            "Legitimate interest (f)",
          ],
        ]}
      />
      <P>
        We don&rsquo;t sell personal data, show ads, or use analytics or tracking cookies (see{" "}
        <Link href="/legal/cookies">Cookies</Link>).
      </P>

      <H2 id="ai">AI processing of recordings</H2>
      <P>
        When a team has AI drafting on and you record a video, the audio track is sent to our AI provider (listed in{" "}
        <Link href="/legal/subprocessors">Subprocessors</Link>) to transcribe it and draft your check-in, together with
        your private notes, your previous plan and your teammates&rsquo; names. You see the draft and edit it before
        anyone else does; check-ins sent from a draft are marked &ldquo;ai-assisted&rdquo;. The recorder tells you this
        before you start. Nothing is decided about you automatically (no Art. 22 decisions).
      </P>
      <P>
        You can opt out under Account → AI: your videos are then kept as they are and never sent for processing.
        Organization admins can also turn AI drafting off for a whole team.
      </P>

      <H2 id="recipients">Who else receives data</H2>
      <P>
        Only the service providers that help us run Asincly, on contract and for the purposes above: hosting, database,
        storage, email, AI, payments, and — if your team uses them — Google sign-in and Slack. The full list, with what
        each receives, is on <Link href="/legal/subprocessors">Subprocessors</Link>. We disclose data to authorities
        only when the law requires it.
      </P>

      <H2 id="transfers">Where data is stored and transfers outside the EU</H2>
      <P>
        The database and recordings are hosted in {dataRegion()}. Several providers are US companies, so data can be
        accessed from or processed in the United States. Those transfers rely on the EU–US Data Privacy Framework
        where the provider is certified, and on the European Commission&rsquo;s Standard Contractual Clauses
        otherwise. You can ask us for a copy of the safeguards.
      </P>

      <H2 id="retention">How long we keep it</H2>
      <Table
        head={["Data", "Kept"]}
        rows={[
          ["Recordings (video and audio)", "Per your team's setting (default 90 days); on the Free plan, videos past its history window are deleted 30 days after leaving Pro"],
          ["Written check-ins, replies, reactions, transcripts and summaries", "Until your organization deletes them, deletes the team or organization, or you delete your account"],
          ["Notifications", "90 days"],
          ["Sessions", "Until you sign out, revoke them, or 30 days without use"],
          ["Sign-in links", "1 hour, single use"],
          ["Audit log", "For the life of the organization"],
          ["Rate-limit counters", "2 days"],
          ["Billing records and invoices", "As long as tax law requires"],
        ]}
      />
      <P>
        Deleting a recording, team, organization or account removes the database records and the files in storage
        right away. Copies in database backups disappear as the backups roll over.
      </P>

      <H2 id="security">How it&rsquo;s protected</H2>
      <UL>
        <li>Every request reads and writes as the signed-in person, under Postgres row-level security keyed on team membership.</li>
        <li>
          Transcripts, summaries, AI drafts, Slack tokens and 2FA secrets are encrypted in the database with AES-256-GCM.
          Written check-ins, replies and notifications are stored without that extra column encryption.
        </li>
        <li>Recordings go from your browser straight to private storage; playback uses links that expire within minutes.</li>
        <li>TLS in transit; strict Content-Security-Policy; optional two-factor authentication and enforced SSO for organizations.</li>
      </UL>
      <P>
        More on the <Link href="/legal/security">Security</Link> page.
      </P>

      <H2 id="rights">Your rights</H2>
      <P>Under the GDPR you can ask to:</P>
      <UL>
        <li><strong>Access</strong> your data and <strong>take it with you</strong> — Account → Your data → Download my data.</li>
        <li><strong>Correct</strong> it — your name and time zone are editable under Account; anything else, ask us.</li>
        <li><strong>Erase</strong> it — Account → Delete account removes you, your check-ins and recordings.</li>
        <li><strong>Restrict</strong> or <strong>object</strong> to processing — including opting out of AI processing under Account → AI.</li>
        <li><strong>Withdraw consent</strong> where we rely on it, without affecting what came before.</li>
      </UL>
      <P>
        For anything not covered in the app, email <a href={`mailto:${op.email}`}>{op.email}</a>. We answer within one
        month. Where your organization is the controller, we pass your request to them and help them respond. You also
        have the right to complain to a supervisory authority: {op.supervisoryAuthority}.
      </P>

      <H3>Children</H3>
      <P>Asincly is a workplace tool and isn&rsquo;t meant for anyone under 16.</P>

      <H3>Changes</H3>
      <P>
        We&rsquo;ll post any change here with a new version and date, and email organization owners before a material
        change takes effect.
      </P>
    </>
  );
}
