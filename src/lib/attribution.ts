// First-touch signup attribution without cookies or third-party scripts.
// UTM parameters from the link someone arrived on ride along in the URL:
// landing -> /sign-in -> the sign-in redirect (carried through the magic
// link) -> /onboarding -> saved on the organization they create. Only the
// campaign labels are kept, never click ids or anything about the person.

export const ATTRIBUTION_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content"] as const;

export type Attribution = {
  source: string;
  medium?: string;
  campaign?: string;
  content?: string;
};

type Params = Record<string, string | string[] | undefined> | URLSearchParams | FormData;

function read(params: Params, key: string): string | undefined {
  if (params instanceof URLSearchParams || params instanceof FormData) {
    const v = params.get(key);
    return typeof v === "string" ? v : undefined;
  }
  const v = params[key];
  return Array.isArray(v) ? v[0] : v;
}

// Lowercase, a short safe alphabet, 64 chars max: labels like "linkedin" or
// "asincly-w2", not free text.
function clean(v: string | undefined): string | undefined {
  const s = v?.toLowerCase().trim().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64);
  return s || undefined;
}

export function parseAttribution(params: Params): Attribution | null {
  const source = clean(read(params, "utm_source"));
  if (!source) return null;
  const attr: Attribution = { source };
  const medium = clean(read(params, "utm_medium"));
  const campaign = clean(read(params, "utm_campaign"));
  const content = clean(read(params, "utm_content"));
  if (medium) attr.medium = medium;
  if (campaign) attr.campaign = campaign;
  if (content) attr.content = content;
  return attr;
}

export function attributionQuery(attr: Attribution | null): string {
  if (!attr) return "";
  const q = new URLSearchParams({ utm_source: attr.source });
  if (attr.medium) q.set("utm_medium", attr.medium);
  if (attr.campaign) q.set("utm_campaign", attr.campaign);
  if (attr.content) q.set("utm_content", attr.content);
  return `?${q}`;
}
