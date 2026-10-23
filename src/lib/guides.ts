import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

// Guides are Markdown files in content/guides/<slug>.md with a small header:
//
//   ---
//   title: Async standups across time zones
//   description: One line for search results (<= 155 chars)
//   date: 2026-10-27
//   ---
//
// Only "key: value" lines; the body is rendered with react-markdown (no raw HTML).

const DIR = path.join(process.cwd(), "content", "guides");
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type Guide = { slug: string; title: string; description: string; date: string; body: string };

export function parseGuide(slug: string, src: string): Guide | null {
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!m) return null;
  const meta: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([a-z_]+):\s*(.*)$/);
    if (kv) meta[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, "");
  }
  if (!meta.title || !meta.description || !/^\d{4}-\d{2}-\d{2}$/.test(meta.date ?? "")) return null;
  return { slug, title: meta.title, description: meta.description, date: meta.date, body: m[2].trim() };
}

export async function getGuide(slug: string): Promise<Guide | null> {
  if (!SLUG.test(slug)) return null;
  const src = await readFile(path.join(DIR, `${slug}.md`), "utf8").catch(() => null);
  return src === null ? null : parseGuide(slug, src);
}

export async function listGuides(): Promise<Guide[]> {
  const files = await readdir(DIR).catch(() => [] as string[]);
  const guides = await Promise.all(
    files.filter((f) => f.endsWith(".md") && f !== "README.md").map((f) => getGuide(f.slice(0, -3))),
  );
  return guides.filter((g): g is Guide => g !== null).sort((a, b) => b.date.localeCompare(a.date));
}
