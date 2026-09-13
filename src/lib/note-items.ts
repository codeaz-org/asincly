import { extractMentions, type Mention } from "@/lib/mentions";

// Check-in sections are markdown. The product treats list lines as items:
// blockers become actionable, today's tasks get counted for the digest.

const LIST_LINE = /^\s*(?:[-*+]|\d+[.)])\s+(?:\[( |x|X)\]\s+)?(.*)$/;

export type NoteItem = {
  /** Display text (markdown kept, list/checkbox prefix removed). */
  text: string;
  /** `null` for plain bullets, true/false for task-list items. */
  checked: boolean | null;
};

// List items; when a section has no list at all, each non-empty line counts
// as one item so "Waiting on staging keys" still works as a blocker.
export function noteItems(md: string): NoteItem[] {
  const lines = md.split("\n").map((l) => l.replace(/\s+$/, ""));
  const listItems: NoteItem[] = [];
  for (const line of lines) {
    const m = line.match(LIST_LINE);
    if (!m) continue;
    const text = m[2].trim();
    if (!text) continue;
    listItems.push({ text, checked: m[1] === undefined ? null : m[1] !== " " });
  }
  if (listItems.length > 0) return listItems;
  return lines
    .map((l) => l.trim())
    .filter((l) => l && !/^#{1,6}\s/.test(l))
    .map((text) => ({ text, checked: null }));
}

export type BlockerItem = NoteItem & { key: string; mentions: Mention[] };

// Blocker lines with a stable key. Checked task items count as already
// handled by the author and are skipped.
export function blockerItems(md: string): BlockerItem[] {
  return noteItems(md)
    .filter((i) => i.checked !== true)
    .map((i) => ({ ...i, key: itemKey(i.text), mentions: extractMentions(i.text) }));
}

// FNV-1a over the normalised text: case, whitespace and trailing punctuation
// don't change the key, so small edits keep existing "I can help" actions.
export function itemKey(text: string): string {
  const norm = text.toLowerCase().replace(/\s+/g, " ").replace(/[.!?…\s]+$/, "").trim();
  let h = 0x811c9dc5;
  for (let i = 0; i < norm.length; i++) {
    h ^= norm.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export function taskStats(md: string): { total: number; done: number } {
  const items = noteItems(md);
  const tasks = items.filter((i) => i.checked !== null);
  const pool = tasks.length > 0 ? tasks : items;
  return { total: pool.length, done: tasks.filter((t) => t.checked).length };
}

// Plain-text preview of a markdown line: mentions become "@Name", links and
// emphasis markers are dropped. Used where we render outside <Markdown>.
export function plainText(md: string): string {
  return md
    .replace(/\[@([^\]]+)\]\(mention:[^)]+\)/g, "@$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`~]/g, "")
    .trim();
}

const TASK_LINE = /^(\s*[-*+]\s+)\[( |x|X)\](\s+.*)$/;

// Task-list lines with their line numbers, for check-off UIs.
export function taskLines(md: string): Array<{ line: number; text: string; checked: boolean }> {
  const out: Array<{ line: number; text: string; checked: boolean }> = [];
  md.split("\n").forEach((l, line) => {
    const m = l.match(TASK_LINE);
    if (m && m[3].trim()) out.push({ line, text: m[3].trim(), checked: m[2] !== " " });
  });
  return out;
}

export function setTaskChecked(md: string, line: number, checked: boolean): string {
  const lines = md.split("\n");
  const m = lines[line]?.match(TASK_LINE);
  if (!m) return md;
  lines[line] = `${m[1]}[${checked ? "x" : " "}]${m[3]}`;
  return lines.join("\n");
}
