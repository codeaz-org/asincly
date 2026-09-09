"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { MentionTextarea, type MentionCandidate } from "@/components/mention-textarea";
import { Recorder } from "@/components/recorder";
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

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <Link
            href={props.backHref}
            className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-muted-foreground hover:text-foreground transition"
          >
            ← back to feed
          </Link>
          <h1 className="text-4xl md:text-5xl font-medium tracking-tight leading-none">
            Check in.
          </h1>
          <p className="text-sm text-muted-foreground font-mono">{props.localDate}</p>
        </div>
        <SaveStatus saving={saving} savedAt={savedAt} status={props.status} />
      </header>

      <form action={submitAction} className="space-y-8">
        <input type="hidden" name="checkInId" value={props.checkInId} />
        <input type="hidden" name="yesterday" value={y} />
        <input type="hidden" name="today" value={t} />
        <input type="hidden" name="blockers" value={b} />

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
        />
        <Field
          label="Blockers"
          hint="What's in your way. Optional."
          value={b}
          onChange={setB}
          placeholder="Waiting on staging env from ops"
          mentionCandidates={props.mentionCandidates}
        />

        <Recorder checkInId={props.checkInId} />

        <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-border">
          <Submit />
          <Link
            href={props.backHref}
            className="h-11 px-4 rounded-md text-sm text-muted-foreground hover:text-foreground inline-flex items-center transition"
          >
            {props.status === "submitted" ? "Done" : "Save & close"}
          </Link>
          <span className="flex-1" />
          {submitState && !submitState.ok && (
            <span className="text-xs text-destructive">{submitState.error}</span>
          )}
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
      className="h-11 px-6 rounded-md bg-foreground text-primary-foreground text-sm font-medium hover:bg-foreground/90 active:scale-[0.99] transition disabled:opacity-50"
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
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mentionCandidates: MentionCandidate[];
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <label className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          {label}
        </label>
        {hint && <span className="text-[11px] text-muted-foreground/70">{hint}</span>}
      </div>
      <MentionTextarea
        value={value}
        onChange={onChange}
        candidates={mentionCandidates}
        placeholder={placeholder}
        rows={4}
        className="w-full min-h-[120px] rounded-md bg-white/[0.02] border border-white/10 px-4 py-3 text-base leading-relaxed placeholder:text-muted-foreground/40 focus:outline-none focus:border-white/30 focus:bg-white/[0.04] transition resize-y font-mono"
      />
    </div>
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
