import type { CheckInDraft, PrevItem, RosterEntry, Sections } from "@/lib/ai/draft-schema";
import { hasContent } from "@/lib/check-in-steps";
import { extractMentions, formatMention } from "@/lib/mentions";
import { itemKey, plainText } from "@/lib/note-items";

// Turns a structured AI draft + what the author already knows into the three
// markdown sections of a check-in. Pure: every rule here is unit-tested.

export type SectionKey = keyof Sections;

export type ComposedDraft = {
  /** What goes into the editor: typed text wins, AI fills the rest. */
  fields: Sections;
  /** The AI's own version of every section, for "Use AI version". */
  ai: Sections;
  /** Sections where the author's typed text was kept over the AI's. */
  keptTyped: SectionKey[];
  /** Everyone tagged automatically (typed or AI), for the undo chips. */
  tagged: string[];
};

export function composeDraft(
  ctx: { previous: PrevItem[]; typed: Sections; hints?: Record<string, "done" | "not_done"> },
  draft: CheckInDraft,
  roster: RosterEntry[],
): ComposedDraft {
  const rosterIds = new Set(roster.map((r) => r.userId));
  const hintIds = draft.mentions.map((m) => m.userId).filter((id) => rosterIds.has(id));
  const statusByKey = new Map(draft.previous.map((p) => [p.key, p.status] as const));

  // Previous plan: the author's taps win, then the model, then what was
  // already ticked; anything not known to be done carries forward.
  const done: string[] = [];
  const carried: string[] = [];
  for (const item of ctx.previous) {
    const status = ctx.hints?.[item.key] ?? statusByKey.get(item.key) ?? (item.checked ? "done" : "not_done");
    if (status === "dropped") continue;
    (status === "done" ? done : carried).push(item.text);
  }

  const seen = new Set<string>();
  const unique = (text: string) => {
    const k = itemKey(plainText(text));
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  };

  const yesterdayLines = [
    ...done.filter(unique).map((t) => `- [x] ${t}`),
    ...carried.map((t) => `- [ ] ${t}`),
    ...draft.yesterday.map((y) => y.text).filter(unique).map((t) => `- ${t}`),
  ];

  const todaySeen = new Set<string>();
  const todayUnique = (text: string) => {
    const k = itemKey(plainText(text));
    if (todaySeen.has(k)) return false;
    todaySeen.add(k);
    return true;
  };
  const todayLines = [...carried, ...draft.today.map((t) => t.text)].filter(todayUnique).map((t) => `- [ ] ${t}`);
  const blockerLines = draft.blockers.map((b) => `- ${b.text}`);

  const tagged = new Set<string>();
  const tag = (md: string) => {
    const r = autoTag(md, roster, hintIds);
    r.tagged.forEach((id) => tagged.add(id));
    return r.md;
  };

  const ai: Sections = {
    yesterday: tag(yesterdayLines.join("\n")),
    today: tag(todayLines.join("\n")),
    blockers: tag(blockerLines.join("\n")),
  };

  const keptTyped: SectionKey[] = [];
  const fields = { ...ai };
  for (const key of ["yesterday", "today", "blockers"] as const) {
    if (hasContent(ctx.typed[key])) {
      fields[key] = tag(ctx.typed[key]);
      if (ctx.typed[key].trim() !== ai[key].trim()) keptTyped.push(key);
    }
  }

  // Only report tags that actually survive in the editor text.
  const inFields = new Set(
    [fields.yesterday, fields.today, fields.blockers].flatMap((md) => extractMentions(md).map((m) => m.userId)),
  );
  return { fields, ai, keptTyped, tagged: [...tagged].filter((id) => inFields.has(id)) };
}

// ────────── Tagging ──────────

const MENTION_LINK = /\[@[^\]]+\]\(mention:[a-zA-Z0-9_-]+\)/g;

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Turn the first plain-text occurrence of a teammate's name into a mention.
// Full names match case-insensitively; a first name only matches with its
// capital letter, and only when it is unique on the team (or the AI named
// that exact person). Existing mention links are never touched.
export function autoTag(
  md: string,
  roster: RosterEntry[],
  hintIds: string[] = [],
): { md: string; tagged: string[] } {
  if (!md.trim() || roster.length === 0) return { md, tagged: [] };

  const firstNameCount = new Map<string, number>();
  for (const r of roster) {
    const first = r.name.trim().split(/\s+/)[0]?.toLowerCase();
    if (first) firstNameCount.set(first, (firstNameCount.get(first) ?? 0) + 1);
  }
  const already = new Set(extractMentions(md).map((m) => m.userId));
  const tagged: string[] = [];
  let out = md;

  // Longer names first so "Sam Miller" wins over another member called "Sam".
  const ordered = [...roster].sort((a, b) => b.name.length - a.name.length);
  for (const member of ordered) {
    if (already.has(member.userId)) continue;
    const name = member.name.trim();
    const parts = name.split(/\s+/);
    const patterns: RegExp[] = [];
    if (parts.length > 1) patterns.push(new RegExp(`(?<![\\p{L}\\p{N}@])${escapeRe(name)}(?![\\p{L}\\p{N}])`, "iu"));
    const first = parts[0];
    const firstUnique = (firstNameCount.get(first.toLowerCase()) ?? 0) === 1;
    if (first.length >= 2 && (firstUnique || hintIds.includes(member.userId))) {
      patterns.push(new RegExp(`(?<![\\p{L}\\p{N}@])${escapeRe(first)}(?![\\p{L}\\p{N}])`, "u"));
    }

    for (const re of patterns) {
      const next = replaceOutsideMentions(out, re, formatMention(name, member.userId));
      if (next !== out) {
        out = next;
        tagged.push(member.userId);
        already.add(member.userId);
        break;
      }
    }
  }
  return { md: out, tagged };
}

function replaceOutsideMentions(md: string, re: RegExp, replacement: string): string {
  let result = "";
  let last = 0;
  let replaced = false;
  for (const m of md.matchAll(MENTION_LINK)) {
    const plain = md.slice(last, m.index);
    if (!replaced && re.test(plain)) {
      result += plain.replace(re, replacement);
      replaced = true;
    } else {
      result += plain;
    }
    result += m[0];
    last = (m.index ?? 0) + m[0].length;
  }
  const tail = md.slice(last);
  result += !replaced && re.test(tail) ? tail.replace(re, replacement) : tail;
  return result;
}

// Undo a tag: the mention link becomes the plain name again.
export function untag(md: string, userId: string): string {
  const re = new RegExp(`\\[@([^\\]]+)\\]\\(mention:${escapeRe(userId)}\\)`, "g");
  return md.replace(re, "$1");
}
