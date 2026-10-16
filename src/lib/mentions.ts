// Mentions are stored as standard markdown links with a `mention:` protocol:
//   [@Alice Nguyen](mention:usr_abc123)
// This keeps the source parseable by any markdown tool; renderers switch on
// href.startsWith('mention:') to show a pill instead of a link.

export const MENTION_HREF_PREFIX = "mention:";

const MENTION_RE = /\[@([^\]]+)\]\(mention:([a-zA-Z0-9_-]+)\)/g;

export type Mention = { name: string; userId: string };

export function extractMentions(md: string): Mention[] {
  const out: Mention[] = [];
  const seen = new Set<string>();
  for (const m of md.matchAll(MENTION_RE)) {
    const userId = m[2];
    if (seen.has(userId)) continue;
    seen.add(userId);
    out.push({ name: m[1], userId });
  }
  return out;
}

export function formatMention(name: string, userId: string): string {
  return `[@${name.replace(/[\[\]()]/g, "")}](${MENTION_HREF_PREFIX}${userId})`;
}

export type MentionCandidate = { userId: string; name: string | null; email: string };

const AT_TOKEN = /(?<![\p{L}\p{N}_.\/@])@([\p{L}\p{N}][\p{L}\p{N}._-]*)/gu;
const LINK = /\[@[^\]]+\]\(mention:[a-zA-Z0-9_-]+\)/g;
const squash = (s: string) => s.toLowerCase().replace(/[\s._-]+/g, "");

// Typed `@anton` becomes a real mention when exactly one teammate answers to
// it: their first name, their full name without spaces, or the part of their
// email before the @, in any case. Ambiguous or unknown handles stay text;
// existing mention links, emails and URLs are left alone.
export function linkAtMentions(md: string, roster: MentionCandidate[]): string {
  if (!md.includes("@") || roster.length === 0) return md;
  const handles = new Map<string, Set<MentionCandidate>>();
  const add = (key: string, c: MentionCandidate) => {
    if (!key) return;
    if (!handles.has(key)) handles.set(key, new Set());
    handles.get(key)!.add(c);
  };
  for (const c of roster) {
    const name = c.name?.trim() ?? "";
    if (name) {
      add(squash(name.split(/\s+/)[0]), c);
      add(squash(name), c);
    }
    add(squash(c.email.split("@")[0] ?? ""), c);
  }
  const resolve = (token: string) => {
    // A sentence can end right after the handle: "@anton."
    const clean = token.replace(/[._-]+$/, "");
    const hit = handles.get(squash(clean));
    if (!hit || hit.size !== 1) return null;
    const c = [...hit][0];
    return { c, rest: token.slice(clean.length) };
  };
  const linkPlain = (text: string) =>
    text.replace(AT_TOKEN, (whole, token: string) => {
      const r = resolve(token);
      return r ? formatMention(r.c.name?.trim() || r.c.email, r.c.userId) + r.rest : whole;
    });

  let out = "";
  let last = 0;
  for (const m of md.matchAll(LINK)) {
    out += linkPlain(md.slice(last, m.index)) + m[0];
    last = (m.index ?? 0) + m[0].length;
  }
  return out + linkPlain(md.slice(last));
}
