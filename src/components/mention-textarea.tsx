"use client";

import { useRef, useState } from "react";
import { formatMention } from "@/lib/mentions";

export type MentionCandidate = {
  userId: string;
  name: string;
  email: string;
};

type Props = {
  value: string;
  onChange: (v: string) => void;
  candidates: MentionCandidate[];
  placeholder?: string;
  autoFocus?: boolean;
  rows?: number;
  className?: string;
};

// Textarea + inline @-mention autocomplete.
// Trigger: user types "@" (at start or after whitespace) → dropdown appears
// under the caret. Arrow keys navigate; Enter / Tab accepts; Esc closes.
export function MentionTextarea({
  value,
  onChange,
  candidates,
  placeholder,
  autoFocus,
  rows = 4,
  className = "",
}: Props) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const [query, setQuery] = useState<string | null>(null);
  const [triggerAt, setTriggerAt] = useState<number>(0);
  const [highlight, setHighlight] = useState(0);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const filtered = query === null
    ? []
    : candidates
        .filter(
          (c) =>
            (c.name ?? "").toLowerCase().includes(query.toLowerCase()) ||
            c.email.toLowerCase().includes(query.toLowerCase()),
        )
        .slice(0, 6);
  const activeHighlight =
    filtered.length === 0 ? 0 : Math.min(highlight, filtered.length - 1);

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const v = e.target.value;
    onChange(v);
    updateTrigger(v, e.target.selectionStart ?? v.length, e.target);
  }

  function updateTrigger(v: string, caret: number, el: HTMLTextAreaElement) {
    // Find the nearest "@" behind caret with no whitespace between it and the caret.
    let i = caret - 1;
    while (i >= 0) {
      const ch = v[i];
      if (ch === "@") break;
      if (/\s/.test(ch) || i < caret - 40) {
        i = -1;
        break;
      }
      i--;
    }
    if (i < 0) {
      setQuery(null);
      setPos(null);
      return;
    }
    const before = i === 0 ? " " : v[i - 1];
    if (before !== " " && before !== "\n" && before !== "\t") {
      setQuery(null);
      setPos(null);
      return;
    }
    const q = v.slice(i + 1, caret);
    setQuery(q);
    setTriggerAt(i);
    // Position: below the textarea, offset by caret coordinates. Approximate.
    const { selectionEnd } = el;
    const rect = el.getBoundingClientRect();
    const lineHeight = parseFloat(getComputedStyle(el).lineHeight || "20");
    const rowsBefore = v.slice(0, selectionEnd).split("\n").length;
    setPos({
      top: rect.top + rowsBefore * lineHeight + 8 + window.scrollY,
      left: rect.left + 12,
    });
  }

  function accept(c: MentionCandidate) {
    const el = ref.current;
    if (!el) return;
    const before = value.slice(0, triggerAt);
    const afterCaret = value.slice(el.selectionStart ?? value.length);
    const mention = formatMention(c.name ?? c.email, c.userId);
    const next = `${before}${mention} ${afterCaret}`;
    onChange(next);
    setQuery(null);
    setPos(null);
    // Return focus + place caret after the inserted mention.
    requestAnimationFrame(() => {
      el.focus();
      const caret = before.length + mention.length + 1;
      el.setSelectionRange(caret, caret);
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (query === null || filtered.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => (h + 1) % filtered.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => (h - 1 + filtered.length) % filtered.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      accept(filtered[activeHighlight]);
    } else if (e.key === "Escape") {
      setQuery(null);
      setPos(null);
    }
  }

  return (
    <>
      <textarea
        ref={ref}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={() => setTimeout(() => setPos(null), 120)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        rows={rows}
        className={className}
      />
      {pos && filtered.length > 0 && (
        <div
          style={{ position: "fixed", top: pos.top, left: pos.left }}
          className="z-50 min-w-[220px] rounded-md border border-white/10 bg-zinc-950/95 backdrop-blur shadow-xl overflow-hidden"
        >
          <ul className="text-sm">
            {filtered.map((c, i) => (
              <li
                key={c.userId}
                onMouseDown={(e) => {
                  e.preventDefault();
                  accept(c);
                }}
                onMouseEnter={() => setHighlight(i)}
                className={`px-3 py-2 cursor-pointer ${
                  i === activeHighlight ? "bg-white/[0.08]" : ""
                }`}
              >
                <div className="font-medium truncate">{c.name ?? c.email}</div>
                {c.name && (
                  <div className="text-[11px] text-muted-foreground font-mono truncate">
                    {c.email}
                  </div>
                )}
              </li>
            ))}
          </ul>
          <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground border-t border-white/5">
            ↑↓ navigate · ↵ accept · esc close
          </div>
        </div>
      )}
    </>
  );
}
