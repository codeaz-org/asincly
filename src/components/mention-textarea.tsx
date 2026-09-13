"use client";

import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { loadShortcodeIndex, rememberEmoji, searchShortcodes } from "@/lib/emoji";
import { continueList, indentList, wrapSelection } from "@/lib/md-edit";
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
  id?: string;
  maxLength?: number;
  onBlur?: () => void;
  /** Runs before the built-in key handling; call preventDefault to take over. */
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  "aria-label"?: string;
  "aria-describedby"?: string;
};

export type MentionTextareaHandle = {
  /** Apply an edit produced by an md-edit helper and refocus the textarea. */
  applyEdit: (fn: (value: string, selStart: number, selEnd: number) => {
    value: string;
    selStart: number;
    selEnd: number;
  } | null) => void;
  focus: () => void;
};

type Suggestion =
  | { kind: "mention"; key: string; label: string; detail?: string; candidate: MentionCandidate }
  | { kind: "emoji"; key: string; label: string; emoji: string };

type Trigger = { kind: "mention" | "emoji"; at: number; query: string };

// Textarea with inline autocomplete and Obsidian-style list helpers.
// "@name" suggests teammates; ":code" suggests emoji (Slack shortcodes), and
// typing a full ":tada:" converts it in place. Arrow keys navigate, Enter /
// Tab accepts, Esc closes. Enter continues - / - [ ] / 1. lists; Tab indents;
// Cmd+B/I bold/italic.
export const MentionTextarea = forwardRef<MentionTextareaHandle, Props>(function MentionTextarea(
  {
    value,
    onChange,
    candidates,
    placeholder,
    autoFocus,
    rows = 4,
    className = "",
    id,
    maxLength,
    onBlur,
    onKeyDown,
    "aria-label": ariaLabel,
    "aria-describedby": ariaDescribedBy,
  }: Props,
  handleRef,
) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const [trigger, setTrigger] = useState<Trigger | null>(null);
  const [emojiIndex, setEmojiIndex] = useState<Array<[string, string]> | null>(null);
  const [highlight, setHighlight] = useState(0);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useImperativeHandle(handleRef, () => ({
    applyEdit(fn) {
      const el = ref.current;
      if (!el) return;
      const res = fn(el.value, el.selectionStart ?? 0, el.selectionEnd ?? 0);
      if (!res) return;
      onChange(res.value);
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(res.selStart, res.selEnd);
      });
    },
    focus() {
      ref.current?.focus();
    },
  }));

  const suggestions: Suggestion[] = !trigger
    ? []
    : trigger.kind === "mention"
      ? candidates
          .filter(
            (c) =>
              c.name.toLowerCase().includes(trigger.query.toLowerCase()) ||
              c.email.toLowerCase().includes(trigger.query.toLowerCase()),
          )
          .slice(0, 6)
          .map((c) => ({ kind: "mention", key: c.userId, label: c.name, detail: c.email, candidate: c }))
      : searchShortcodes(emojiIndex ?? [], trigger.query, 8).map((r) => ({
          kind: "emoji",
          key: r.code,
          label: `:${r.code}:`,
          emoji: r.emoji,
        }));
  const open = !!pos && suggestions.length > 0;
  const active = suggestions.length === 0 ? 0 : Math.min(highlight, suggestions.length - 1);

  function close() {
    setTrigger(null);
    setPos(null);
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const el = e.target;
    const caret = el.selectionStart ?? el.value.length;
    const converted = convertTypedShortcode(el.value, caret);
    if (converted) {
      onChange(converted.value);
      close();
      requestAnimationFrame(() => el.setSelectionRange(converted.caret, converted.caret));
      return;
    }
    onChange(el.value);
    updateTrigger(el.value, caret, el);
  }

  // ":tada:" typed in full → 🎉, using the index if it has loaded.
  function convertTypedShortcode(v: string, caret: number): { value: string; caret: number } | null {
    if (!emojiIndex || v[caret - 1] !== ":") return null;
    const m = v.slice(0, caret).match(/(^|\s):([a-z0-9_+-]{2,40}):$/);
    if (!m) return null;
    const hit = emojiIndex.find(([code]) => code === m[2]);
    if (!hit) return null;
    const start = caret - m[2].length - 2;
    rememberEmoji(hit[1]);
    return { value: v.slice(0, start) + hit[1] + v.slice(caret), caret: start + hit[1].length };
  }

  function updateTrigger(v: string, caret: number, el: HTMLTextAreaElement) {
    // Nearest "@" or ":" behind the caret with no whitespace in between.
    let i = caret - 1;
    while (i >= 0 && caret - i <= 40) {
      const ch = v[i];
      if (ch === "@" || ch === ":") break;
      if (/\s/.test(ch)) {
        i = -1;
        break;
      }
      i--;
    }
    if (i < 0 || caret - i > 40) return close();
    const before = i === 0 ? " " : v[i - 1];
    if (!/\s/.test(before)) return close();

    const kind = v[i] === "@" ? "mention" : "emoji";
    const query = v.slice(i + 1, caret);
    if (kind === "emoji") {
      if (query.length < 2 || !/^[a-z0-9_+-]+$/i.test(query)) return close();
      if (!emojiIndex) void loadShortcodeIndex().then(setEmojiIndex);
    }
    setTrigger({ kind, at: i, query });
    setHighlight(0);

    // Position (viewport coords, the menu is position:fixed): under the
    // caret's line, approximated by line count and clamped to the textarea.
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    const lineHeight = parseFloat(style.lineHeight || "20") || 20;
    const rowsBefore = v.slice(0, caret).split("\n").length;
    const paddingTop = parseFloat(style.paddingTop || "0");
    const top = Math.min(rect.top + paddingTop + rowsBefore * lineHeight - el.scrollTop + 6, rect.bottom + 6);
    setPos({ top: Math.min(top, window.innerHeight - 240), left: Math.min(rect.left + 12, window.innerWidth - 260) });
  }

  function accept(s: Suggestion) {
    const el = ref.current;
    if (!el || !trigger) return;
    const before = value.slice(0, trigger.at);
    const after = value.slice(el.selectionStart ?? value.length);
    const insert =
      s.kind === "mention" ? `${formatMention(s.candidate.name ?? s.candidate.email, s.candidate.userId)} ` : `${s.emoji} `;
    if (s.kind === "emoji") rememberEmoji(s.emoji);
    onChange(`${before}${insert}${after}`);
    close();
    requestAnimationFrame(() => {
      el.focus();
      const caret = before.length + insert.length;
      el.setSelectionRange(caret, caret);
    });
  }

  function setValueAndCaret(next: string, caret: number) {
    onChange(next);
    const el = ref.current;
    if (!el) return;
    requestAnimationFrame(() => el.setSelectionRange(caret, caret));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    onKeyDown?.(e);
    if (e.defaultPrevented) return;
    const el = e.currentTarget;

    if (!open) {
      if (e.key === "Enter" && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
        const r = continueList(el.value, el.selectionStart ?? 0);
        if (r) {
          e.preventDefault();
          setValueAndCaret(r.value, r.caret);
        }
        return;
      }
      if (e.key === "Tab") {
        const r = indentList(el.value, el.selectionStart ?? 0, e.shiftKey);
        if (r) {
          e.preventDefault();
          setValueAndCaret(r.value, r.caret);
        }
        return;
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === "b" || e.key === "i")) {
        e.preventDefault();
        const r = wrapSelection(el.value, el.selectionStart ?? 0, el.selectionEnd ?? 0, e.key === "b" ? "**" : "*");
        onChange(r.value);
        requestAnimationFrame(() => {
          el.focus();
          el.setSelectionRange(r.selStart, r.selEnd);
        });
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => (h + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      accept(suggestions[active]);
    } else if (e.key === "Escape") {
      e.stopPropagation();
      close();
    }
  }

  return (
    <>
      <textarea
        ref={ref}
        id={id}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        aria-autocomplete="list"
        data-mention-open={open ? "true" : undefined}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          setTimeout(() => setPos(null), 120);
          onBlur?.();
        }}
        placeholder={placeholder}
        autoFocus={autoFocus}
        rows={rows}
        maxLength={maxLength}
        className={className}
      />
      {open && (
        <div
          style={{ position: "fixed", top: pos.top, left: pos.left }}
          className="z-50 min-w-[240px] rounded-xl border border-line bg-popover/95 backdrop-blur-xl shadow-[0_24px_60px_-20px_oklch(0_0_0/0.7)] overflow-hidden p-1"
        >
          <ul className="text-sm" role="listbox" aria-label={trigger?.kind === "emoji" ? "Emoji" : "Teammates"}>
            {suggestions.map((s, i) => (
              <li
                key={s.key}
                onMouseDown={(e) => {
                  e.preventDefault();
                  accept(s);
                }}
                onMouseEnter={() => setHighlight(i)}
                role="option"
                aria-selected={i === active}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer text-ink ${
                  i === active ? "bg-amber/[0.12]" : ""
                }`}
              >
                {s.kind === "emoji" ? (
                  <>
                    <span className="emoji text-lg leading-none">{s.emoji}</span>
                    <span className="truncate text-soft">{s.label}</span>
                  </>
                ) : (
                  <div className="min-w-0">
                    <div className="font-medium truncate">{s.label}</div>
                    {s.detail && <div className="text-[11px] text-soft truncate">{s.detail}</div>}
                  </div>
                )}
              </li>
            ))}
          </ul>
          <div className="px-3 pt-2 pb-1.5 text-[10px] uppercase tracking-wider text-faint border-t border-line mt-1">
            ↑↓ navigate · ↵ accept · esc close
          </div>
        </div>
      )}
    </>
  );
});
