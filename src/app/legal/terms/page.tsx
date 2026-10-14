import Link from "next/link";
import { H2, LegalHeader, P, UL } from "@/components/legal";
import { FREE_PURGE_GRACE_DAYS, TRIAL_DAYS } from "@/lib/billing/plans";
import { LEGAL_EFFECTIVE, LEGAL_VERSION, operator } from "@/lib/legal";
import { SOURCE_URL } from "@/lib/source";

export const metadata = { title: "Terms of Service" };

export default function TermsPage() {
  const op = operator();
  return (
    <>
      <LegalHeader title="Terms of Service" intro={`Version ${LEGAL_VERSION}, effective ${LEGAL_EFFECTIVE}.`} />

      <P>
        These terms are a contract between <strong>{op.name}</strong> ({op.address}, {op.country}; &ldquo;we&rdquo;) and
        the organization that uses Asincly (&ldquo;you&rdquo;, the customer). Whoever creates an organization accepts
        them on its behalf and confirms they may do so. People invited to an organization use Asincly under their
        organization&rsquo;s account.
      </P>

      <H2>1. Business use only</H2>
      <P>
        Asincly is for businesses and other organizations, not consumers. By accepting, you confirm you&rsquo;re acting
        for a business or organization. Consumer withdrawal rights therefore don&rsquo;t apply.
      </P>

      <H2>2. The service</H2>
      <P>
        Asincly lets a team check in asynchronously with written notes and optional recordings, which an AI provider can
        transcribe and turn into drafts. We may improve and change the service; we won&rsquo;t remove a core feature of a
        paid plan during a paid period without notice.
      </P>

      <H2>3. Your responsibilities</H2>
      <UL>
        <li>Keep sign-in credentials safe, and tell us at <a href={`mailto:${op.securityEmail}`}>{op.securityEmail}</a> about any unauthorized use.</li>
        <li>
          You are the controller of the personal data your team puts into Asincly. You make sure you may process it,
          including informing your staff and, where your law requires it, involving your works council or employee
          representatives before introducing recorded check-ins. The{" "}
          <Link href="/legal/dpa">Data Processing Agreement</Link> is part of these terms.
        </li>
        <li>
          Don&rsquo;t use Asincly to break the law, to upload content you have no right to share, to harass anyone, to
          monitor people covertly, or to attack, overload, reverse-engineer around limits of, or scrape the service.
        </li>
      </UL>

      <H2>4. AI features</H2>
      <P>
        AI drafts, transcripts and summaries can be wrong or incomplete. They are suggestions for the author to review
        before sending; you remain responsible for what your team sends and for decisions you base on it. Team admins
        can turn AI drafting off, and each person can opt out.
      </P>

      <H2>5. Plans, payment and cancellation</H2>
      <UL>
        <li>
          The Free plan costs nothing. Pro is billed per member who checks in, monthly or yearly in advance, at the prices
          on the <Link href="/pricing">pricing page</Link>. Prices exclude VAT; VAT is added at checkout where it applies,
          and EU businesses with a valid VAT ID are invoiced under the reverse-charge rule.
        </li>
        <li>
          New organizations get a {TRIAL_DAYS}-day Pro trial without a card. If you don&rsquo;t subscribe, you move to
          Free at its end.
        </li>
        <li>Subscriptions renew automatically. Adding or removing members changes the seat count with proration.</li>
        <li>
          You can cancel anytime in the billing portal; Pro continues until the end of the paid period and isn&rsquo;t
          refunded for the rest of it, except where the law requires.
        </li>
        <li>
          If a payment fails, Pro keeps working for a grace period while it&rsquo;s retried; after that you move to Free.
          On Free, videos older than its history window are deleted {FREE_PURGE_GRACE_DAYS} days after leaving Pro.
        </li>
        <li>We may change prices with at least 30 days&rsquo; notice by email, effective from your next renewal.</li>
      </UL>

      <H2>6. Your data</H2>
      <P>
        Your content stays yours. We use it only to provide the service as described in the{" "}
        <Link href="/legal/privacy">Privacy Policy</Link> and the DPA, never to train AI models. You can export it at any
        time and delete it, the team or the whole organization from Settings.
      </P>

      <H2>7. Availability and support</H2>
      <P>
        We work to keep Asincly available and secure but don&rsquo;t guarantee uninterrupted service. Maintenance that
        needs downtime is announced in advance where we can. Support is by email at{" "}
        <a href={`mailto:${op.email}`}>{op.email}</a>.
      </P>

      <H2>8. Suspension and termination</H2>
      <P>
        We may suspend access that puts the service or other customers at risk, or that breaks these terms, and will
        tell you why. You can stop using Asincly at any time by deleting your organization. We may end the contract with
        30 days&rsquo; notice; paid time you&rsquo;ve already paid for is then refunded pro rata.
      </P>

      <H2>9. Liability</H2>
      <P>
        Nothing here limits liability for intent, gross negligence, injury to life, body or health, or anything else
        that can&rsquo;t be limited by law. Otherwise, our total liability for any claims in a year is limited to the fees
        you paid us in the 12 months before the claim, and we are not liable for indirect damages or lost profits. On
        the Free plan the service is provided as is.
      </P>

      <H2>10. Notices about illegal content</H2>
      <P>
        Report content you believe is illegal, and reach us as authorities, at <a href={`mailto:${op.email}`}>{op.email}</a>{" "}
        (our single point of contact under the EU Digital Services Act). Tell us where the content is and why it&rsquo;s
        illegal; we&rsquo;ll review it and let you know what we did.
      </P>

      <H2>11. Changes to these terms</H2>
      <P>
        We&rsquo;ll email organization owners at least 30 days before material changes take effect. If you don&rsquo;t
        agree, you can cancel before then.
      </P>

      <H2>12. Law and courts</H2>
      <P>
        These terms are governed by the laws of {op.governingLaw}, excluding the UN Convention on Contracts for the
        International Sale of Goods. The courts of {op.courts} have jurisdiction.
      </P>

      <H2>13. Open source</H2>
      <P>
        Asincly&rsquo;s code is available under the{" "}
        <a href={SOURCE_URL} target="_blank" rel="noopener noreferrer">
          AGPL-3.0
        </a>
        . The license covers the code; these terms cover the service we run.
      </P>
    </>
  );
}
