"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { Markdown } from "@/components/markdown";
import {
  MentionTextarea,
  type MentionCandidate,
  type MentionTextareaHandle,
} from "@/components/mention-textarea";
import { Recorder } from "@/components/recorder";
import { toggleLinePrefix, wrapSelection } from "@/lib/md-edit";
import { saveCheckInDraft, submitCheckIn, type SubmitResult } from "@/lib/actions/check-in";

type Props = {
  checkInId: string;
  yesterday: string;
  today: string;
  blockers: string;
  status: "draft" | "submitted";
  backHref: string;
  localDate: string;
  mentionCandidates: MentionCandidate[];
};

export function CheckInEditor(props: Props) {
  const [y, setY] = useState(props.yesterday);
  const [t, setT] = useState(props.today);
  const [b, setB] = useState(props.blockers);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [saving, setSaving] = useState(false);
  const [, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipInitial = useRef(true);

  // Debounced autosave (800ms). Fires whenever any of the three fields changes.
  useEffect(() => {
    if (skipInitial.current) {
      skipInitial.current = false;
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    setSaving(true);
    timer.current = setTimeout(() => {
      startTransition(async () => {
        try {
          const res = await saveCheckInDraft({
            checkInId: props.checkInId,
            yesterday: y,
            today: t,
            blockers: b,
          });
          setSavedAt(new Date(res.savedAt));
        } catch (e) {
          console.error("[autosave]", e);
        } finally {
          setSaving(false);
        }
      });
    }, 800);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [y, t, b, props.checkInId]);

  const [submitState, submitAction] = useActionState<SubmitResult | null, FormData>(
    submitCheckIn,
    null,
  );

  // Cmd/Ctrl+Enter submits from anywhere in the form.
  const formRef = useRef<HTMLFormElement | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        formRef.current?.requestSubmit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const carriedOver =
    props.status === "draft" && props.today.trim().startsWith("- [ ]");

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <Link
            href={props.backHref}
            className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-muted-foreground hover:text-foreground transition"
          >
            ← back to feed
          </Link>
          <h1 className="text-4xl font-medium tracking-tight leading-none">
            Check in.
          </h1>
          <p className="text-sm text-muted-foreground font-mono">{props.localDate}</p>
        </div>
        <SaveStatus saving={saving} savedAt={savedAt} status={props.status} />
      </header>

      <form ref={formRef} action={submitAction}>
        <input type="hidden" name="checkInId" value={props.checkInId} />
        <input type="hidden" name="yesterday" value={y} />
        <input type="hidden" name="today" value={t} />
        <input type="hidden" name="blockers" value={b} />

        <div className="grid lg:grid-cols-[1fr_340px] gap-8 items-start">
          {/* Left: the three fields */}
          <div className="space-y-6 min-w-0">
            {carriedOver && (
              <p className="text-[11px] text-emerald-300/90 bg-emerald-400/[0.06] border border-emerald-400/20 rounded-md px-3 py-2">
                Yesterday&rsquo;s unfinished tasks carried over into Today.
              </p>
            )}
            <Field
              label="Yesterday"
              hint="What you moved forward."
              value={y}
              onChange={setY}
              placeholder="- Shipped the feature flag rollout"
              mentionCandidates={props.mentionCandidates}
            />
            <Field
              label="Today"
              hint="`- [ ]` for tasks · @ to mention"
              value={t}
              onChange={setT}
              placeholder="- [ ] Review Sam's PR&#10;- [ ] Draft migration plan"
              mentionCandidates={props.mentionCandidates}
              autoFocus
            />
            <Field
              label="Blockers"
              hint="What's in your way. Optional."
              value={b}
              onChange={setB}
              placeholder="Waiting on staging env from ops"
              mentionCandidates={props.mentionCandidates}
            />
          </div>

          {/* Right rail: video + submit, always visible on desktop */}
          <div className="lg:sticky lg:top-20 space-y-4">
            <Recorder checkInId={props.checkInId} />
            <div className="space-y-2">
              <Submit />
              <Link
                href={props.backHref}
                className="w-full h-10 rounded-md text-sm text-muted-foreground hover:text-foreground inline-flex items-center justify-center transition border border-white/[0.06] hover:border-white/[0.12]"
              >
                {props.status === "submitted" ? "Done" : "Save draft & close"}
              </Link>
              <p className="text-[11px] text-muted-foreground text-center">
                ⌘↵ to submit · autosaves as you type
              </p>
              {submitState && !submitState.ok && (
                <p className="text-xs text-destructive text-center" role="alert">
                  {submitState.error}
                </p>
              )}
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full h-11 px-6 rounded-md bg-foreground text-primary-foreground text-sm font-semibold hover:bg-foreground/90 active:scale-[0.99] transition disabled:opacity-50"
    >
      {pending ? "Submitting…" : "Submit check-in"}
    </button>
  );
}

function Field({
  label,
  hint,
  value,
  onChange,
  placeholder,
  mentionCandidates,
  autoFocus,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mentionCandidates: MentionCandidate[];
  autoFocus?: boolean;
}) {
  const taRef = useRef<MentionTextareaHandle | null>(null);
  const [preview, setPreview] = useState(false);

  // Called from click handlers only — never during render.
  function applyWrap(marker: string) {
    taRef.current?.applyEdit((v, s, e) => wrapSelection(v, s, e, marker));
  }
  function applyPrefix(pfx: string) {
    taRef.current?.applyEdit((v, s) => {
      const r = toggleLinePrefix(v, s, pfx);
      return r ? { value: r.value, selStart: r.caret, selEnd: r.caret } : null;
    });
  }
  function applyMention() {
    taRef.current?.applyEdit((v, s, e) => {
      const needsSpace = s > 0 && !/\s/.test(v[s - 1]);
      const ins = needsSpace ? " @" : "@";
      return {
        value: v.slice(0, s) + ins + v.slice(e),
        selStart: s + ins.length,
        selEnd: s + ins.length,
      };
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <label className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          {label}
        </label>
        <div className="flex items-center gap-1">
          {!preview && (
            <div className="flex items-center gap-0.5 mr-2" role="toolbar" aria-label={`${label} formatting`}>
              <ToolBtn label="Bold (⌘B)" onClick={() => applyWrap("**")}>
                <span className="font-bold">B</span>
              </ToolBtn>
              <ToolBtn label="Italic (⌘I)" onClick={() => applyWrap("*")}>
                <span className="italic font-serif">i</span>
              </ToolBtn>
              <ToolBtn label="Task" onClick={() => applyPrefix("- [ ] ")}>
                ☐
              </ToolBtn>
              <ToolBtn label="Bullet" onClick={() => applyPrefix("- ")}>
                •
              </ToolBtn>
              <ToolBtn label="Mention a teammate" onClick={applyMention}>
                @
              </ToolBtn>
            </div>
          )}
          <div className="flex rounded-md border border-white/10 overflow-hidden text-[11px]">
            <button
              type="button"
              onClick={() => setPreview(false)}
              className={`px-2 py-1 transition ${!preview ? "bg-white/[0.08] text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              Write
            </button>
            <button
              type="button"
              onClick={() => setPreview(true)}
              className={`px-2 py-1 transition ${preview ? "bg-white/[0.08] text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              Preview
            </button>
          </div>
        </div>
      </div>
      {preview ? (
        <div className="w-full min-h-[120px] rounded-md bg-white/[0.01] border border-white/[0.06] px-4 py-3">
          <Markdown>{value}</Markdown>
        </div>
      ) : (
        <MentionTextarea
          ref={taRef}
          value={value}
          onChange={onChange}
          candidates={mentionCandidates}
          placeholder={placeholder}
          autoFocus={autoFocus}
          rows={4}
          className="w-full min-h-[120px] rounded-md bg-white/[0.02] border border-white/10 px-4 py-3 text-base leading-relaxed placeholder:text-muted-foreground/40 focus:outline-none focus:border-white/30 focus:bg-white/[0.04] transition resize-y font-mono"
        />
      )}
      {hint && !preview && (
        <p className="text-[11px] text-muted-foreground/70">{hint}</p>
      )}
    </div>
  );
}

function ToolBtn({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="grid place-items-center size-7 rounded text-[13px] text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition"
    >
      {children}
    </button>
  );
}

function SaveStatus({
  saving,
  savedAt,
  status,
}: {
  saving: boolean;
  savedAt: Date | null;
  status: "draft" | "submitted";
}) {
  if (status === "submitted" && !saving) {
    return (
      <span className="inline-flex items-center gap-2 text-xs text-emerald-400">
        <span className="size-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_theme(colors.emerald.400)]" />
        submitted
      </span>
    );
  }
  if (saving) {
    return (
      <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
        <span className="size-1.5 rounded-full bg-amber-400 animate-pulse" />
        saving
      </span>
    );
  }
  if (savedAt) {
    return (
      <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
        <span className="size-1.5 rounded-full bg-emerald-400/70" />
        saved · {savedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
      <span className="size-1.5 rounded-full bg-muted-foreground/40" />
      draft
    </span>
  );
}
