// Client helpers for emoji: self-hosted dataset location, :shortcode: search
// and the viewer's recently used reactions.

export const EMOJIBASE_URL = "/emoji/17.0.0";

export const QUICK_REACTIONS = ["👍", "🎉", "🙌", "❤️", "👀", "😂", "🙏", "🔥"];

type ShortcodeIndex = Array<[string, string]>;
let indexPromise: Promise<ShortcodeIndex> | null = null;

export function loadShortcodeIndex(): Promise<ShortcodeIndex> {
  indexPromise ??= fetch(`${EMOJIBASE_URL}/en/shortcode-index.json`)
    .then((r) => (r.ok ? (r.json() as Promise<ShortcodeIndex>) : []))
    .catch(() => {
      indexPromise = null;
      return [];
    });
  return indexPromise;
}

// Prefix matches first (":ta" → tada), then substring matches; one row per emoji.
export function searchShortcodes(index: ShortcodeIndex, query: string, limit = 8): Array<{ code: string; emoji: string }> {
  const q = query.toLowerCase();
  if (q.length < 2) return [];
  const seen = new Set<string>();
  const out: Array<{ code: string; emoji: string }> = [];
  const take = (pred: (code: string) => boolean) => {
    for (const [code, emoji] of index) {
      if (out.length >= limit) return;
      if (!seen.has(emoji) && pred(code)) {
        seen.add(emoji);
        out.push({ code, emoji });
      }
    }
  };
  take((c) => c.startsWith(q));
  take((c) => c.includes(q));
  return out;
}

const RECENT_KEY = "asincly:recent-emoji";

export function recentEmoji(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((e): e is string => typeof e === "string").slice(0, 16) : [];
  } catch {
    return [];
  }
}

export function rememberEmoji(emoji: string): void {
  try {
    const next = [emoji, ...recentEmoji().filter((e) => e !== emoji)].slice(0, 16);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Private mode / storage blocked: recents are a convenience only.
  }
}
