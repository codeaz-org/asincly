// Legal pages read the operator's details from the environment: on the hosted
// cloud that's the company running Asincly Cloud, on a self-hosted instance
// it's whoever runs that instance. Nothing here is invented: a missing value
// renders as a visible placeholder so it can't ship unnoticed.

// Bumped whenever the Terms, Privacy Policy or DPA change materially; the
// version an organization accepted is stored with it.
export const LEGAL_VERSION = "2026-10-14";
export const LEGAL_EFFECTIVE = "14 October 2026";

const env = (key: string) => process.env[key]?.trim() || null;

export type Operator = {
  name: string;
  address: string;
  country: string;
  registration: string | null;
  vatId: string | null;
  email: string;
  securityEmail: string;
  governingLaw: string;
  courts: string;
  supervisoryAuthority: string;
  configured: boolean;
};

export function operator(): Operator {
  const name = env("LEGAL_ENTITY_NAME");
  const address = env("LEGAL_ADDRESS");
  const country = env("LEGAL_COUNTRY");
  const email = env("LEGAL_EMAIL");
  return {
    name: name ?? "[operator name — set LEGAL_ENTITY_NAME]",
    address: address ?? "[registered address — set LEGAL_ADDRESS]",
    country: country ?? "[country — set LEGAL_COUNTRY]",
    registration: env("LEGAL_REGISTRATION"),
    vatId: env("LEGAL_VAT_ID"),
    email: email ?? "[contact email — set LEGAL_EMAIL]",
    securityEmail: env("LEGAL_SECURITY_EMAIL") ?? email ?? "[security email — set LEGAL_SECURITY_EMAIL]",
    governingLaw: env("LEGAL_GOVERNING_LAW") ?? country ?? "[governing law — set LEGAL_GOVERNING_LAW]",
    courts: env("LEGAL_COURTS") ?? "[competent courts — set LEGAL_COURTS]",
    supervisoryAuthority:
      env("LEGAL_SUPERVISORY_AUTHORITY") ?? "the data protection authority of your EU/EEA country of residence or work",
    configured: !!(name && address && country && email),
  };
}

// Who processes personal data for this instance. Purpose and data come from
// what the code sends each provider. Where the data sits is the operator's
// configuration (LEGAL_DATA_REGION), and the transfer safeguard is whatever
// the operator signed with each provider: both must be checked against the
// actual contracts before publishing.
export type Subprocessor = { name: string; purpose: string; data: string; country: string; when?: string };

export const SUBPROCESSORS: Subprocessor[] = [
  {
    name: "Vercel Inc.",
    purpose: "Application hosting, request logs",
    data: "All application data in transit; request metadata (IP address, user agent)",
    country: "United States",
  },
  {
    name: "Neon Inc.",
    purpose: "Database",
    data: "Accounts, teams, check-ins, comments; transcripts and summaries encrypted",
    country: "United States",
  },
  {
    name: "Cloudflare, Inc. (R2)",
    purpose: "Storage of video and audio recordings",
    data: "Recordings",
    country: "United States",
  },
  {
    name: "Groq, Inc.",
    purpose: "Speech-to-text and drafting check-ins from recordings",
    data: "A recording's audio track, the author's notes and previous plan, team member names",
    country: "United States",
    when: "Only for teams with AI drafting on, and members who haven't opted out",
  },
  {
    name: "Resend, Inc.",
    purpose: "Email (sign-in links, reminders, notifications)",
    data: "Email address, email content",
    country: "United States",
  },
  {
    name: "Stripe Payments Europe, Ltd.",
    purpose: "Payments, invoicing, tax",
    data: "Billing contact, company details, VAT ID; card details are held by Stripe",
    country: "Ireland",
    when: "Only for paying organizations",
  },
  {
    name: "Google LLC",
    purpose: "Sign in with Google",
    data: "Email address, name, profile picture URL",
    country: "United States",
    when: "Only if you sign in with Google",
  },
  {
    name: "Slack Technologies, LLC",
    purpose: "Posting digests and reminders to a team's Slack",
    data: "Names, today's plans and blockers in digests; reminder messages",
    country: "United States",
    when: "Only for teams that connect Slack",
  },
];

// Where the database and recordings are hosted, as configured (e.g. "the
// European Union (Frankfurt)").
export const dataRegion = () => env("LEGAL_DATA_REGION") ?? "[hosting region — set LEGAL_DATA_REGION]";
