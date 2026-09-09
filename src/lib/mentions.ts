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
