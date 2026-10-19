"use client";

import { forwardRef, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Avatar } from "@/components/ui/avatar";
import { loadShortcodeIndex, rememberEmoji, searchShortcodes } from "@/lib/emoji";
import { continueList, indentList, wrapSelection } from "@/lib/md-edit";
import { extractMentions, mentionSpans, toDisplay, toMarkup } from "@/lib/mentions";

export type MentionCandidate = {
  userId: string;
  name: string;
  email: string;
  /** The person typing: listed last, and never notified. */
  you?: boolean;
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
// "@" opens a teammate menu at the caret (Linear-style): names starting with
// what you type first, avatars, ↑↓ / ↵ / Tab / Esc. A picked teammate shows as
// an "@Name" pill; Backspace right after a pill removes it whole. The value
// in and out is markdown with [@Name](mention:id) links; the textarea itself
// only ever shows "@Name" (see toDisplay / toMarkup).
// ":code" suggests emoji (Slack shortcodes), and a full ":tada:" converts in
// place. Enter continues - / - [ ] / 1. lists; Tab indents; Cmd+B/I.
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
  const backdropRef = useRef<HTMLDivElement | null>(null);
  const [trigger, setTrigger] = useState<Trigger | null>(null);

  // Everyone a pill can stand for: people already mentioned (ids kept as
  // they are) and the teammates on offer.
  const known = useMemo(
    () => [...extractMentions(value).map((m) => ({ userId: m.userId, name: m.name })), ...candidates],
    [value, candidates],
  );
  const display = toDisplay(value);
  const spans = mentionSpans(display, known);
  // Without pills the textarea draws its own text; the layer stays empty and
  // only provides the box for measuring the caret.
  const pills = spans.length > 0;
  const emit = (next: string) => onChange(toMarkup(next, known));

  // A programmatic edit (pick, list helper, Backspace on a pill) moves the
  // caret in the same commit that applies the text, so a key typed right after
  // lands where it should.
  const pendingCaret = useRef<{ start: number; end: number } | null>(null);
  const editTo = (next: string, start: number, end = start) => {
    pendingCaret.current = { start, end };
    emit(next);
  };
  useLayoutEffect(() => {
    const el = ref.current;
    const c = pendingCaret.current;
    if (!el || !c || el.value !== display) return;
    pendingCaret.current = null;
    el.focus();
    el.setSelectionRange(c.start, c.end);
    // The toolbar's @ button opens the menu just like typing "@" does.
    if (c.start === c.end) updateTrigger(el.value, c.start, el);
  });

  // The pill layer sits exactly under the textarea's (transparent) text:
  // same box, font and wrapping, scrolled with it.
  useLayoutEffect(() => {
    const el = ref.current;
    const bd = backdropRef.current;
    if (!el || !bd) return;
    const sync = () => {
      const cs = getComputedStyle(el);
      for (const k of MIRROR_PROPS) bd.style.setProperty(k, cs.getPropertyValue(k));
      bd.style.width = `${el.offsetWidth}px`;
      bd.style.height = `${el.offsetHeight}px`;
      bd.style.top = `${el.offsetTop}px`;
      bd.style.left = `${el.offsetLeft}px`;
      // A scrollbar narrows the textarea's text box; narrow the layer to match.
      const bar = el.offsetWidth - el.clientWidth - parseFloat(cs.borderLeftWidth) - parseFloat(cs.borderRightWidth);
      bd.style.paddingRight = `${parseFloat(cs.paddingRight) + Math.max(0, bar)}px`;
      bd.scrollTop = el.scrollTop;
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  });
  const [emojiIndex, setEmojiIndex] = useState<Array<[string, string]> | null>(null);
  const [highlight, setHighlight] = useState(0);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useImperativeHandle(handleRef, () => ({
    applyEdit(fn) {
      const el = ref.current;
      if (!el) return;
      const res = fn(el.value, el.selectionStart ?? 0, el.selectionEnd ?? 0);
      if (!res) return;
      editTo(res.value, res.selStart, res.selEnd);
    },
    focus() {
      ref.current?.focus();
    },
  }));

  const suggestions: Suggestion[] = !trigger
    ? []
    : trigger.kind === "mention"
      ? rankCandidates(candidates, trigger.query)
          .slice(0, 6)
          .map((c) => ({ kind: "mention", key: c.userId, label: c.name, detail: c.you ? `You · ${c.email}` : c.email, candidate: c }))
      : searchShortcodes(emojiIndex ?? [], trigger.query, 8).map((r) => ({
          kind: "emoji",
          key: r.code,
          label: `:${r.code}:`,
          emoji: r.emoji,
        }));
  const open = !!pos && suggestions.length > 0;
  // "@" with nothing to offer still answers, instead of the menu not opening.
  const noMatch = !!pos && trigger?.kind === "mention" && suggestions.length === 0;
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
      close();
      editTo(converted.value, converted.caret);
      return;
    }
    emit(el.value);
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

    // Position (viewport coords, the menu is position:fixed): just under the
    // "@", wherever it sits, kept on screen.
    const at = caretPoint(backdropRef.current, el, i);
    setPos({ top: Math.min(at.bottom + 6, window.innerHeight - 260), left: Math.max(8, Math.min(at.left - 8, window.innerWidth - 288)) });
  }

  function accept(s: Suggestion) {
    const el = ref.current;
    if (!el || !trigger) return;
    const before = el.value.slice(0, trigger.at);
    const after = el.value.slice(el.selectionStart ?? el.value.length);
    const insert = s.kind === "mention" ? `@${s.candidate.name.replace(/[\[\]()]/g, "")} ` : `${s.emoji} `;
    if (s.kind === "emoji") rememberEmoji(s.emoji);
    close();
    editTo(`${before}${insert}${after}`, before.length + insert.length);
  }

  function setValueAndCaret(next: string, caret: number) {
    editTo(next, caret);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    onKeyDown?.(e);
    if (e.defaultPrevented) return;
    const el = e.currentTarget;

    if (!open) {
      // Backspace right after a pill takes the whole mention, like Linear.
      if (e.key === "Backspace" && el.selectionStart === el.selectionEnd) {
        const caret = el.selectionStart ?? 0;
        const pill = spans.find((p) => p.end === caret);
        if (pill) {
          e.preventDefault();
          setValueAndCaret(el.value.slice(0, pill.start) + el.value.slice(caret), pill.start);
          return;
        }
      }
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
        editTo(r.value, r.selStart, r.selEnd);
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
    <div className="relative">
      <div ref={backdropRef} aria-hidden className="pointer-events-none absolute overflow-hidden whitespace-pre-wrap break-words text-ink border-transparent">
        {pills && pieces(display, spans)}
      </div>
      <textarea
        ref={ref}
        id={id}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        aria-autocomplete="list"
        data-mention-open={open ? "true" : undefined}
        value={display}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onScroll={(e) => {
          if (backdropRef.current) backdropRef.current.scrollTop = e.currentTarget.scrollTop;
        }}
        // The text is drawn by the pill layer underneath; the textarea keeps
        // the caret, selection and input.
        style={pills ? { color: "transparent", caretColor: "var(--ink)" } : undefined}
        onBlur={() => {
          setTimeout(() => setPos(null), 120);
          onBlur?.();
        }}
        placeholder={placeholder}
        autoFocus={autoFocus}
        rows={rows}
        maxLength={maxLength}
        className={`relative ${className}`}
      />
      {/* On <body>: a transformed ancestor (the step's entrance animation)
          would otherwise turn position:fixed into position:absolute. */}
      {noMatch && createPortal(
        <div
          role="status"
          style={{ position: "fixed", top: pos.top, left: pos.left }}
          className="z-50 w-[280px] rounded-xl border border-line bg-popover/95 backdrop-blur-xl shadow-[0_24px_60px_-20px_oklch(0_0_0/0.7)] px-3 py-2.5 text-sm text-soft"
        >
          {candidates.some((c) => !c.you)
            ? `No teammate matches “${trigger.query}”`
            : "No teammates on this team yet. Invite them from People."}
        </div>,
        document.body,
      )}
      {open && createPortal(
        <div
          style={{ position: "fixed", top: pos.top, left: pos.left }}
          className="z-50 w-[280px] rounded-xl border border-line bg-popover/95 backdrop-blur-xl shadow-[0_24px_60px_-20px_oklch(0_0_0/0.7)] overflow-hidden p-1"
        >
          <ul className="text-sm" role="listbox" aria-label={trigger?.kind === "emoji" ? "Emoji" : "Teammates"}>
            {suggestions.map((s, i) => (
              <li
                key={s.key}
                onMouseDown={(e) => {
                  e.preventDefault();
                  accept(s);
                }}
                // Move, not enter: a list re-filtering under a resting pointer
                // mustn't steal the highlight from the keyboard.
                onMouseMove={() => i !== active && setHighlight(i)}
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
                  <>
                    <Avatar name={s.candidate.name} email={s.candidate.email} size={24} />
                    <div className="min-w-0">
                      <div className="font-medium truncate">{s.label}</div>
                      {s.detail && <div className="text-[11px] text-soft truncate">{s.detail}</div>}
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
          <div className="px-3 pt-2 pb-1.5 text-[10px] uppercase tracking-wider text-faint border-t border-line mt-1">
            ↑↓ navigate · ↵ accept · esc close
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
});

// What the pill layer needs to match the textarea's text box.
const MIRROR_PROPS = [
  "box-sizing", "font-family", "font-size", "font-weight", "font-style", "line-height", "letter-spacing",
  "word-spacing", "text-indent", "text-transform", "tab-size", "padding-top", "padding-bottom",
  "padding-left", "border-top-width", "border-right-width", "border-bottom-width", "border-left-width",
  "border-style", "border-radius",
];

function pieces(text: string, spans: { start: number; end: number; userId: string }[]) {
  const out: React.ReactNode[] = [];
  let last = 0;
  for (const s of spans) {
    out.push(text.slice(last, s.start));
    out.push(
      <span key={`${s.userId}-${s.start}`} className="rounded-[5px] bg-amber/15 text-amber shadow-[0_0_0_2px_color-mix(in_oklch,var(--amber)_15%,transparent)]">
        {text.slice(s.start, s.end)}
      </span>,
    );
    last = s.end;
  }
  // A trailing newline needs a character after it to take up its line.
  out.push(text.slice(last) + (text.endsWith("\n") ? " " : ""));
  return out;
}

// Names starting with the query first (any word of the name, or the email),
// then names that merely contain it.
function rankCandidates(candidates: MentionCandidate[], query: string): MentionCandidate[] {
  const q = query.toLowerCase();
  // Teammates first, yourself last.
  const byName = (a: MentionCandidate, b: MentionCandidate) => Number(!!a.you) - Number(!!b.you) || a.name.localeCompare(b.name);
  if (!q) return [...candidates].sort(byName);
  const starts = (c: MentionCandidate) =>
    c.name.toLowerCase().split(/\s+/).some((w) => w.startsWith(q)) || c.email.toLowerCase().startsWith(q);
  const contains = (c: MentionCandidate) => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q);
  return [...candidates.filter(starts).sort(byName), ...candidates.filter((c) => !starts(c) && contains(c)).sort(byName)];
}

// Viewport position of character `index`, measured on a throwaway copy of
// the pill layer (same box, font and wrapping as the textarea).
function caretPoint(layer: HTMLElement | null, el: HTMLTextAreaElement, index: number): { left: number; bottom: number } {
  const box = el.getBoundingClientRect();
  if (!layer?.parentElement) return { left: box.left + 12, bottom: box.top + 24 };
  const copy = layer.cloneNode(false) as HTMLElement;
  copy.style.visibility = "hidden";
  const text = document.createTextNode(el.value + " ");
  copy.appendChild(text);
  layer.parentElement.appendChild(copy);
  copy.scrollTop = el.scrollTop;
  const range = document.createRange();
  range.setStart(text, index);
  range.setEnd(text, index + 1);
  const r = range.getBoundingClientRect();
  copy.remove();
  return { left: r.left, bottom: r.bottom };
}
