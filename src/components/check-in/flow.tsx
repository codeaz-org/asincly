"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, AtSign, Check, ListTodo, List, Pencil, Sparkles, Video, X } from "lucide-react";
import { cn } from "cn";
import { MarkLoader } from "@/components/brand/loader";
import { LogoMark } from "@/components/brand/mark";
import { Sunrise } from "@/components/brand/sunrise";
import { CheckInCard } from "@/components/dashboard/check-in-card";
import { MentionTextarea, type MentionCandidate, type MentionTextareaHandle } from "@/components/mention-textarea";
import { SkipVideoDialog, type VideoSkip } from "@/components/check-in/skip-video-dialog";
import { Recorder, type RecorderContext } from "@/components/recorder";
import { Button } from "@/components/ui/button";
import { saveCheckInDraft, submitCheckIn } from "@/lib/actions/check-in";
import { getRecordingDraft } from "@/lib/actions/recording";
import { autoTag, untag, type SectionKey } from "@/lib/draft";
import {
  STEPS,
  STEP_COPY,
  canSend,
  hasContent,
  initialStep,
  nextStep,
  parseStep,
  prevStep,
  stepIndex,
  stepProgress,
  type Step,
} from "@/lib/check-in-steps";
import { toggleLinePrefix } from "@/lib/md-edit";
import { blockerItems, setTaskChecked, taskLines } from "@/lib/note-items";
import type { FeedEntry } from "@/lib/queries";
import { VIDEO_SKIP_LABEL } from "@/lib/validation/social";

type Props = {
  checkInId: string;
  yesterday: string;
  today: string;
  blockers: string;
  status: "draft" | "submitted";
  localDate: string;
  dayLabel: string;
  teamName: string;
  backHref: string;
  viewer: { userId: string; name: string | null; email: string; tz: string };
  mentionCandidates: MentionCandidate[];
  existingRecordings: number;
  /** False while the draft only holds the carry-over seed. */
  edited: boolean;
  schedules: Array<{ id: string; name: string; href: string; active: boolean }>;
  requireVideo: boolean;
  /** Longest video the plan allows. */
  maxVideoSeconds: number;
  /** Plan & billing page on the hosted cloud; null when self-hosted. */
  billingHref: string | null;
  videoSkip: VideoSkip | null;
  context: RecorderContext;
  /** A recording still being transcribed/drafted when the page loaded. */
  pendingRecordingId: string | null;
};

type AiInfo = { ai: Fields; keptTyped: SectionKey[] };

const STAGE_LABEL: Record<string, string> = {
  uploaded: "Getting your video ready",
  processing: "Getting your video ready",
  transcribing: "Listening to what you said",
  drafting: "Writing your check-in",
};

type Fields = { yesterday: string; today: string; blockers: string };

export function CheckInFlow(props: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  const [fields, setFields] = useState<Fields>({
    yesterday: props.yesterday,
    today: props.today,
    blockers: props.blockers,
  });
  const [hasRecording, setHasRecording] = useState(props.existingRecordings > 0);
  // "Saving" is derived: the fields differ from what the server last stored.
  const fieldsKey = JSON.stringify(fields);
  const [savedKey, setSavedKey] = useState(fieldsKey);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ href: string } | null>(null);
  const [sending, startSending] = useTransition();
  const isSubmitted = props.status === "submitted";
  const [processing, setProcessing] = useState<string | null>(props.pendingRecordingId);
  const [stage, setStage] = useState("uploaded");
  const [aiInfo, setAiInfo] = useState<AiInfo | null>(null);
  const [tagged, setTagged] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [quotaHit, setQuotaHit] = useState(false);
  const [skip, setSkip] = useState<VideoSkip | null>(props.videoSkip);
  const [skipOpen, setSkipOpen] = useState(false);
  // People the author un-tagged: never auto-tag them again in this session.
  const [untagged, setUntagged] = useState<string[]>([]);
  const taggable = props.mentionCandidates.filter((c) => !untagged.includes(c.userId));
  const fieldsRef = useRef(fields);
  useEffect(() => {
    fieldsRef.current = fields;
  }, [fields]);

  // Where to land when the URL has no ?step= — fixed from the initial draft.
  const [fallback] = useState(() =>
    initialStep(
      { yesterday: props.yesterday, today: props.today, blockers: props.blockers, hasRecording: props.existingRecordings > 0 },
      props.status,
      props.edited,
    ),
  );
  const step = parseStep(search.get("step"), fallback);

  const go = useCallback(
    (to: Step) => {
      const params = new URLSearchParams(search.toString());
      params.set("step", to);
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
      window.scrollTo({ top: 0 });
    },
    [pathname, router, search],
  );

  // Debounced autosave for drafts. A sent check-in only changes when the
  // author presses "Update", so teammates never see half-edited text.
  const saving = !isSubmitted && fieldsKey !== savedKey;
  useEffect(() => {
    if (isSubmitted || fieldsKey === savedKey) return;
    const t = setTimeout(async () => {
      try {
        const res = await saveCheckInDraft({ checkInId: props.checkInId, ...(JSON.parse(fieldsKey) as Fields) });
        setSavedKey(fieldsKey);
        setSavedAt(new Date(res.savedAt));
      } catch {
        // Keep the local copy; the next edit retries.
      }
    }, 700);
    return () => clearTimeout(t);
  }, [fieldsKey, savedKey, isSubmitted, props.checkInId]);

  // Poll the pipeline after a recording is attached, then land on review
  // with the AI draft merged into whatever was already typed.
  useEffect(() => {
    if (!processing) return;
    let stopped = false;
    const tick = async () => {
      // Only what the author actually wrote counts as typed; the carry-over
      // seed the page started with shouldn't block the AI's version.
      const f = fieldsRef.current;
      const typed = {
        yesterday: f.yesterday !== props.yesterday ? f.yesterday : "",
        today: f.today !== props.today ? f.today : "",
        blockers: f.blockers !== props.blockers ? f.blockers : "",
      };
      const res = await getRecordingDraft({ recordingId: processing, typed });
      if (stopped) return;
      if (!res.ok) {
        setProcessing(null);
        setNotice("Couldn't draft from the video — it's attached. Write your check-in instead.");
        return;
      }
      if (res.status === "ready") {
        setProcessing(null);
        if (res.draft) {
          setFields(res.draft.fields);
          setAiInfo({ ai: res.draft.ai, keptTyped: res.draft.keptTyped });
          setTagged(res.draft.tagged);
          go("review");
        } else {
          setNotice(
            res.aiConfigured
              ? "We couldn't hear enough to draft from. Your video is attached — add a few lines below."
              : "AI drafting isn't set up on this server. Your video is attached — write a few lines below.",
          );
          go("yesterday");
        }
        return;
      }
      if (res.status === "failed") {
        setProcessing(null);
        setQuotaHit(res.reason === "quota_exceeded");
        setNotice(
          res.reason === "quota_exceeded"
            ? "Your team has used this month's AI minutes. Your video is attached — write a few lines below, or upgrade for more."
            : "Couldn't draft from the video — it's attached. Write your check-in instead.",
        );
        go("yesterday");
        return;
      }
      setStage(res.status);
      timer = setTimeout(tick, 1500);
    };
    let timer = setTimeout(tick, 800);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [processing, go, props.yesterday, props.today, props.blockers]);

  const send = useCallback(() => {
    setSendError(null);
    startSending(async () => {
      const res = await submitCheckIn({ checkInId: props.checkInId, ...fields, videoSkip: skip ?? undefined });
      if (!res.ok) {
        setSendError(res.error);
        return;
      }
      setSent({ href: `/${res.orgSlug}/${res.teamSlug}?focus=${res.checkInId}#ci-${res.checkInId}` });
    });
  }, [fields, props.checkInId, skip]);

  const ready = canSend({ ...fields, hasRecording, requireVideo: props.requireVideo, hasSkipReason: !!skip });
  const next = nextStep(step);
  const prev = prevStep(step);

  // ⌘↵ advances / sends. Esc closes unless you're typing.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        if (step === "review") {
          if (ready && !sending) send();
        } else if (next) go(next);
      } else if (e.key === "Escape") {
        const target = e.target as HTMLElement | null;
        if (target?.closest("textarea, input, [role=dialog]")) return;
        router.push(props.backHref);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, next, props.backHref, ready, router, send, sending, step]);

  const set = (key: keyof Fields) => (v: string) => setFields((f) => ({ ...f, [key]: v }));
  const addTagged = (ids: string[]) => setTagged((t) => [...new Set([...t, ...ids])]);
  const removeTag = (userId: string) => {
    setFields((f) => ({ yesterday: untag(f.yesterday, userId), today: untag(f.today, userId), blockers: untag(f.blockers, userId) }));
    setTagged((t) => t.filter((id) => id !== userId));
    setUntagged((u) => [...u, userId]);
  };
  const copy = STEP_COPY[step];

  return (
    <div className="min-h-dvh flex flex-col">
      <SkipVideoDialog
        open={skipOpen}
        onOpenChange={setSkipOpen}
        initial={skip}
        onConfirm={(value) => {
          setSkip(value);
          if (step === "video") go("yesterday");
        }}
      />
      {sent && (
        <Sunrise
          title={isSubmitted ? "Updated." : "You're in."}
          subtitle="Your team will read it in their own morning."
          onDone={() => router.push(sent.href)}
        />
      )}

      {/* Top bar */}
      <header className="sticky top-0 z-30 bg-ground/85 backdrop-blur-xl border-b border-line">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 h-16 flex items-center gap-3">
          <Link
            href={props.backHref}
            aria-label="Close check-in"
            className="grid place-items-center size-9 -ml-2 rounded-lg text-soft hover:text-ink hover:bg-ink/[0.05] transition"
          >
            <X className="size-5" />
          </Link>
          <div className="flex-1 min-w-0">
            <p className="kicker text-[10px] truncate">
              {props.teamName} · {props.dayLabel}
            </p>
            <p className="text-sm font-medium text-ink">
              {copy.label}
              <span className="text-soft font-normal"> · {stepIndex(step) + 1} of {STEPS.length}</span>
            </p>
          </div>
          <SaveState saving={saving} savedAt={savedAt} submitted={isSubmitted} />
          <LogoMark size={28} progress={stepProgress(step)} className="text-ink" title={`Step ${stepIndex(step) + 1} of ${STEPS.length}`} />
        </div>
        {/* Progress rail, echoing the landing page divider */}
        <div className="h-0.5 bg-line">
          <div
            className="h-full bg-amber shadow-[0_0_10px_oklch(0.78_0.15_60/0.7)] transition-[width] duration-500 ease-out"
            style={{ width: `${((stepIndex(step) + 1) / STEPS.length) * 100}%` }}
          />
        </div>
      </header>

      {props.schedules.length > 1 && (
        <nav aria-label="Check-in schedule" className="mx-auto max-w-5xl w-full px-4 sm:px-6 pt-4 flex gap-2 overflow-x-auto">
          {props.schedules.map((s) => (
            <Link
              key={s.id}
              href={s.href}
              className={cn(
                "h-8 px-3 rounded-full text-xs inline-flex items-center border whitespace-nowrap transition",
                s.active ? "border-amber/50 bg-amber/[0.1] text-ink" : "border-line text-soft hover:text-ink",
              )}
            >
              {s.name}
            </Link>
          ))}
        </nav>
      )}

      <div className="flex-1 mx-auto max-w-5xl w-full px-4 sm:px-6 py-8 md:py-12 grid md:grid-cols-[200px_1fr] gap-10">
        {/* Step rail (desktop) */}
        <nav aria-label="Steps" className="hidden md:block">
          <ol className="sticky top-28 space-y-1">
            {STEPS.map((s, i) => {
              const done = stepIndex(step) > i;
              const active = s === step;
              return (
                <li key={s}>
                  <button
                    type="button"
                    onClick={() => go(s)}
                    aria-current={active ? "step" : undefined}
                    className={cn(
                      "w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-left transition",
                      active ? "bg-ink/[0.06] text-ink" : "text-soft hover:text-ink hover:bg-ink/[0.03]",
                    )}
                  >
                    <span
                      className={cn(
                        "grid place-items-center size-6 rounded-full text-[11px] font-mono border",
                        active ? "border-amber text-amber" : done ? "border-transparent bg-amber/[0.15] text-amber" : "border-line text-faint",
                      )}
                    >
                      {done ? <Check className="size-3.5" /> : i + 1}
                    </span>
                    {STEP_COPY[s].label}
                    {s === "blockers" && blockerItems(fields.blockers).length > 0 && (
                      <span className="ml-auto size-1.5 rounded-full bg-danger" />
                    )}
                    {s === "video" && hasRecording && <span className="ml-auto size-1.5 rounded-full bg-amber" />}
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        <main key={step} className="min-w-0 max-w-2xl animate-rise-in">
          <div className="space-y-2 mb-8">
            <h1 className="display text-3xl sm:text-[2.6rem] text-ink">{copy.question}</h1>
            <p className="text-soft">{copy.hint}</p>
          </div>

          {notice && step !== "video" && step !== "review" && (
            <p role="status" className="mb-6 rounded-xl border border-line bg-ink/[0.04] px-4 py-3 text-sm text-ink">
              {notice}
              {quotaHit && props.billingHref && (
                <>
                  {" "}
                  <Link href={props.billingHref} className="text-amber hover:underline underline-offset-4">
                    See plans →
                  </Link>
                </>
              )}
            </p>
          )}

          {step === "yesterday" && (
            <YesterdayStep value={fields.yesterday} onChange={set("yesterday")} candidates={props.mentionCandidates} taggable={taggable} onTagged={addTagged} />
          )}
          {step === "today" && (
            <Writer
              id="today"
              label="Today"
              value={fields.today}
              onChange={set("today")}
              candidates={props.mentionCandidates}
              placeholder={"- [ ] Review Sam's PR\n- [ ] Draft the migration plan"}
              defaultPrefix="- [ ] "
              onTagged={addTagged}
              taggable={taggable}
            />
          )}
          {step === "blockers" && (
            <BlockersStep
              value={fields.blockers}
              onChange={set("blockers")}
              candidates={props.mentionCandidates}
              onTagged={addTagged}
              taggable={taggable}
              onNothing={() => {
                set("blockers")("");
                go("review");
              }}
            />
          )}
          {step === "video" &&
            (processing ? (
              <ProcessingPanel stage={stage} />
            ) : (
              <div className="space-y-5">
                <Recorder
                  checkInId={props.checkInId}
                  existingCount={hasRecording ? 1 : 0}
                  maxSeconds={props.maxVideoSeconds}
                  context={props.context}
                  onUploaded={(id) => {
                    setHasRecording(true);
                    setSkip(null);
                    setNotice(null);
                    setStage("uploaded");
                    setProcessing(id);
                  }}
                />
                {skip && props.requireVideo && !hasRecording && (
                  <p className="text-sm text-soft">
                    Skipping video today: <span className="text-ink">{VIDEO_SKIP_LABEL[skip.reason]}</span>
                    {skip.note && ` · ${skip.note}`}
                  </p>
                )}
              </div>
            ))}
          {step === "review" && (
            <ReviewStep
              fields={fields}
              props={props}
              hasRecording={hasRecording}
              onEdit={go}
              aiInfo={aiInfo}
              onUseAi={(key) => {
                if (!aiInfo) return;
                set(key)(aiInfo.ai[key]);
                setAiInfo({ ...aiInfo, keptTyped: aiInfo.keptTyped.filter((k) => k !== key) });
              }}
              tagged={tagged}
              onUntag={removeTag}
              notice={notice}
              skip={skip}
              onRecord={() => go("video")}
              onSkip={() => setSkipOpen(true)}
            />
          )}

          {sendError && (
            <p role="alert" className="mt-6 text-sm text-danger">
              {sendError}
            </p>
          )}

          {/* Step actions */}
          <div className="mt-10 flex items-center gap-3 pb-[env(safe-area-inset-bottom)]">
            {prev && step !== "review" ? (
              <Button type="button" variant="ghost" size="lg" onClick={() => go(prev)}>
                <ArrowLeft /> Back
              </Button>
            ) : step === "review" && !hasRecording ? (
              <Button type="button" variant="ghost" size="lg" onClick={() => go("blockers")}>
                <ArrowLeft /> Back
              </Button>
            ) : (
              <span />
            )}
            <span className="flex-1" />
            {step === "video" ? (
              processing ? null : hasRecording ? (
                <Button type="button" variant="primary" size="lg" onClick={() => go("review")}>
                  Review your check-in <ArrowRight />
                </Button>
              ) : props.requireVideo ? (
                <Button type="button" variant="secondary" size="lg" onClick={() => setSkipOpen(true)}>
                  Can&rsquo;t record today
                </Button>
              ) : (
                <Button type="button" variant="secondary" size="lg" onClick={() => go("yesterday")}>
                  <Pencil /> Write it instead
                </Button>
              )
            ) : step === "review" ? (
              <Button type="button" variant="primary" size="lg" onClick={send} disabled={!ready || sending}>
                {sending ? <MarkLoader size="xs" /> : <Check />}
                {isSubmitted ? "Update check-in" : "Send check-in"}
              </Button>
            ) : (
              next && (
                <Button type="button" variant="primary" size="lg" onClick={() => go(next)}>
                  {`Next: ${STEP_COPY[next].label}`}
                  <ArrowRight />
                </Button>
              )
            )}
          </div>
          {step === "review" && !ready && (
            <p className="mt-3 text-right text-xs text-soft">
              {props.requireVideo && !hasRecording && !skip
                ? "Your team asks for a video — record one or tell them why you can't."
                : "Add at least one line or a video before sending."}
            </p>
          )}
          <p className="mt-6 hidden md:block text-right text-[11px] text-faint">⌘↵ {step === "review" ? "send" : "next"} · esc close</p>
        </main>
      </div>
    </div>
  );
}

function SaveState({ saving, savedAt, submitted }: { saving: boolean; savedAt: Date | null; submitted: boolean }) {
  if (saving) return <MarkLoader size="xs" label="saving" className="hidden sm:inline-flex" />;
  if (submitted) return <span className="hidden sm:inline text-xs text-soft">sent · edits apply on update</span>;
  if (savedAt)
    return (
      <span className="hidden sm:inline text-xs text-soft">
        saved {savedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </span>
    );
  return <span className="hidden sm:inline text-xs text-faint">draft</span>;
}

// ── Steps ──

function Writer({
  id,
  label,
  value,
  onChange,
  candidates,
  placeholder,
  defaultPrefix,
  onTagged,
  taggable,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  candidates: MentionCandidate[];
  placeholder: string;
  defaultPrefix: "- " | "- [ ] ";
  onTagged: (userIds: string[]) => void;
  /** Who may be auto-tagged (everyone except people the author un-tagged). */
  taggable?: MentionCandidate[];
}) {
  const ref = useRef<MentionTextareaHandle | null>(null);
  const [justTagged, setJustTagged] = useState<string[]>([]);

  // Leaving the field tags teammates named in plain text ("ask Lena").
  function tagNames() {
    const r = autoTag(value, (taggable ?? candidates).map((c) => ({ userId: c.userId, name: c.name })));
    if (r.tagged.length === 0) return;
    onChange(r.md);
    onTagged(r.tagged);
    setJustTagged(r.tagged);
  }

  // First character typed into an empty field starts a list, so Enter keeps
  // adding items. Pastes and existing text are left alone.
  function handleChange(next: string) {
    if (!value && next.length === 1 && !/[-*+\d\s#>]/.test(next)) {
      onChange(`${defaultPrefix}${next}`);
      return;
    }
    onChange(next);
  }

  function prefix(p: string) {
    ref.current?.applyEdit((v, s) => {
      const r = toggleLinePrefix(v, s, p);
      return r ? { value: r.value, selStart: r.caret, selEnd: r.caret } : null;
    });
  }
  function mention() {
    ref.current?.applyEdit((v, s, e) => {
      const ins = s > 0 && !/\s/.test(v[s - 1]) ? " @" : "@";
      return { value: v.slice(0, s) + ins + v.slice(e), selStart: s + ins.length, selEnd: s + ins.length };
    });
  }

  return (
    <div className="space-y-3">
      <div>
        <MentionTextarea
          ref={ref}
          id={id}
          aria-label={label}
          value={value}
          onChange={handleChange}
          onBlur={tagNames}
          candidates={candidates}
          placeholder={placeholder}
          autoFocus
          rows={7}
          className="w-full min-h-[220px] rounded-2xl bg-ink/[0.03] border border-line px-5 py-4 text-[17px] leading-[1.75] text-ink placeholder:text-faint focus:outline-none focus:border-amber/50 focus:bg-ink/[0.045] focus:ring-4 focus:ring-amber/10 transition resize-y"
        />
      </div>
      <div className="flex flex-wrap items-center gap-1.5" role="toolbar" aria-label={`${label} formatting`}>
        <Chip onClick={() => prefix("- [ ] ")} icon={<ListTodo />}>Task</Chip>
        <Chip onClick={() => prefix("- ")} icon={<List />}>Bullet</Chip>
        {candidates.length > 0 && (
          <Chip onClick={mention} icon={<AtSign />}>Mention</Chip>
        )}
        <span className="ml-auto text-xs text-faint hidden sm:inline">↵ new line · ⇥ indent · :emoji:</span>
      </div>
      {justTagged.length > 0 && (
        <p role="status" className="text-xs text-amber animate-rise-in">
          Tagged {justTagged.map((id) => candidates.find((c) => c.userId === id)?.name ?? "someone").join(", ")} — they&rsquo;ll get a
          heads-up when you send.
        </p>
      )}
    </div>
  );
}

function ProcessingPanel({ stage }: { stage: string }) {
  const stages = ["uploaded", "transcribing", "drafting"];
  const current = Math.max(0, stages.indexOf(stage === "processing" ? "uploaded" : stage));
  return (
    <div className="rounded-2xl border border-line bg-ground-raised/60 px-6 py-12 flex flex-col items-center gap-6 text-center">
      <MarkLoader size="lg" />
      <div className="space-y-1.5">
        <p className="text-lg font-medium text-ink">{STAGE_LABEL[stage] ?? "Working on it"}…</p>
        <p className="text-sm text-soft">Usually under half a minute. You can keep this tab in the background.</p>
      </div>
      <ol className="flex items-center gap-2" aria-label="Progress">
        {stages.map((s, i) => (
          <li
            key={s}
            className={cn(
              "h-1.5 w-10 rounded-full transition-colors",
              i < current ? "bg-amber" : i === current ? "bg-amber/60 animate-mark-breathe" : "bg-line-strong",
            )}
          />
        ))}
      </ol>
    </div>
  );
}

function Chip({ onClick, icon, children }: { onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="inline-flex items-center gap-1.5 h-8 rounded-full border border-line px-3 text-xs text-soft hover:text-ink hover:border-line-strong transition [&_svg]:size-3.5"
    >
      {icon}
      {children}
    </button>
  );
}

function YesterdayStep({
  value,
  onChange,
  candidates,
  onTagged,
  taggable,
}: {
  value: string;
  onChange: (v: string) => void;
  candidates: MentionCandidate[];
  onTagged: (userIds: string[]) => void;
  taggable: MentionCandidate[];
}) {
  // Carried over from last time: the plan you wrote. Tick what got done.
  const tasks = taskLines(value);
  return (
    <div className="space-y-6">
      {tasks.length > 0 && (
        <div className="rounded-2xl border border-line bg-ground-raised/60 p-2">
          <p className="kicker text-[10px] px-3 pt-2 pb-2">From your last check-in · tap what got done</p>
          <ul>
            {tasks.map((t) => (
              <li key={t.line}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={t.checked}
                  onClick={() => onChange(setTaskChecked(value, t.line, !t.checked))}
                  className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-ink/[0.04] transition"
                >
                  <span
                    className={cn(
                      "grid place-items-center size-5 rounded-md border transition",
                      t.checked ? "bg-amber border-amber text-amber-ink" : "border-line-strong",
                    )}
                  >
                    {t.checked && <Check className="size-3.5" strokeWidth={3} />}
                  </span>
                  <span className={cn("text-[15px]", t.checked ? "text-soft line-through decoration-soft/40" : "text-ink")}>
                    {t.text.replace(/\[@([^\]]+)\]\(mention:[^)]+\)/g, "@$1")}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <Writer
        id="yesterday"
        label="Yesterday"
        value={value}
        onChange={onChange}
        candidates={candidates}
        placeholder={"- Shipped the feature flag rollout\n- Paired with Jia on the ingest queue"}
        defaultPrefix="- "
        onTagged={onTagged}
        taggable={taggable}
      />
    </div>
  );
}

function BlockersStep({
  value,
  onChange,
  candidates,
  onNothing,
  onTagged,
  taggable,
}: {
  value: string;
  onChange: (v: string) => void;
  candidates: MentionCandidate[];
  onNothing: () => void;
  onTagged: (userIds: string[]) => void;
  taggable: MentionCandidate[];
}) {
  return (
    <div className="space-y-6">
      {!hasContent(value) && (
        <button
          type="button"
          onClick={onNothing}
          className="w-full flex items-center gap-4 rounded-2xl border border-line bg-ground-raised/60 px-5 py-4 text-left hover:border-amber/40 hover:bg-amber/[0.04] transition"
        >
          <LogoMark size={28} state="done" className="text-ink" />
          <span className="flex-1">
            <span className="block text-base font-medium text-ink">Nothing blocking me</span>
            <span className="block text-sm text-soft">Skip ahead</span>
          </span>
          <ArrowRight className="size-5 text-soft" />
        </button>
      )}
      <Writer
        id="blockers"
        label="Blockers"
        value={value}
        onChange={onChange}
        candidates={candidates}
        placeholder={"- Waiting on staging keys from @…"}
        defaultPrefix="- "
        onTagged={onTagged}
        taggable={taggable}
      />
    </div>
  );
}

function ReviewStep({
  fields,
  props,
  hasRecording,
  onEdit,
  aiInfo,
  onUseAi,
  tagged,
  onUntag,
  notice,
  skip,
  onRecord,
  onSkip,
}: {
  fields: Fields;
  props: Props;
  hasRecording: boolean;
  onEdit: (s: Step) => void;
  aiInfo: AiInfo | null;
  onUseAi: (key: SectionKey) => void;
  tagged: string[];
  onUntag: (userId: string) => void;
  notice: string | null;
  skip: VideoSkip | null;
  onRecord: () => void;
  onSkip: () => void;
}) {
  const preview: FeedEntry = {
    checkInId: props.checkInId,
    userId: props.viewer.userId,
    userName: props.viewer.name,
    userEmail: props.viewer.email,
    userTz: props.viewer.tz,
    yesterday: fields.yesterday,
    today: fields.today,
    blockers: fields.blockers,
    submittedAt: new Date(),
    status: "submitted",
    recordings: [],
    reactions: [],
    commentCount: 0,
    blockerItems: blockerItems(fields.blockers).map((b) => ({ ...b, helperIds: [], resolved: false })),
    videoSkipReason: skip?.reason ?? null,
    videoSkipNote: skip?.note ?? null,
  };
  const sections: Array<[Step, string, boolean]> = [
    ["yesterday", "Yesterday", hasContent(fields.yesterday)],
    ["today", "Today", hasContent(fields.today)],
    ["blockers", "Blockers", hasContent(fields.blockers)],
    ["video", "Video", hasRecording],
  ];
  const names = new Map(props.mentionCandidates.map((c) => [c.userId, c.name]));
  const visibleTags = tagged.filter((id) =>
    [fields.yesterday, fields.today, fields.blockers].some((md) => md.includes(`(mention:${id})`)),
  );
  const sectionLabel: Record<SectionKey, string> = { yesterday: "Yesterday", today: "Today", blockers: "Blockers" };

  return (
    <div className="space-y-5">
      {aiInfo && (
        <div className="flex items-start gap-3 rounded-xl border border-amber/30 bg-amber/[0.06] px-4 py-3">
          <Sparkles className="size-4 mt-0.5 text-amber shrink-0" />
          <div className="text-sm text-ink space-y-2 flex-1">
            <p>Drafted from your video. Check it, fix anything, then send.</p>
            {aiInfo.keptTyped.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {aiInfo.keptTyped.map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => onUseAi(key)}
                    className="h-7 rounded-full border border-amber/40 px-3 text-xs text-ink hover:bg-amber/[0.1] transition"
                  >
                    Kept your {sectionLabel[key]} · use AI version
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      {notice && !aiInfo && (
        <p role="status" className="rounded-xl border border-line bg-ink/[0.04] px-4 py-3 text-sm text-ink">
          {notice}
        </p>
      )}

      {props.requireVideo && !hasRecording && !skip && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-ink/[0.04] px-4 py-3">
          <Video className="size-4 text-soft" />
          <p className="flex-1 text-sm text-ink">Your team asks for a video with every check-in.</p>
          <Button variant="primary" size="sm" onClick={onRecord}>
            Record
          </Button>
          <Button variant="ghost" size="sm" onClick={onSkip}>
            Can&rsquo;t today
          </Button>
        </div>
      )}

      {visibleTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="kicker text-[10px]">Tagged</span>
          {visibleTags.map((id) => (
            <span key={id} className="inline-flex items-center gap-1 h-7 rounded-full bg-amber/[0.12] pl-2.5 pr-1 text-xs text-amber">
              @{names.get(id) ?? "teammate"}
              <button
                type="button"
                onClick={() => onUntag(id)}
                aria-label={`Remove tag for ${names.get(id) ?? "teammate"}`}
                className="grid place-items-center size-5 rounded-full hover:bg-amber/[0.2]"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {sections.map(([s, label, filled]) => (
          <button
            key={s}
            type="button"
            onClick={() => onEdit(s)}
            className={cn(
              "inline-flex items-center gap-1.5 h-8 rounded-full border px-3 text-xs transition",
              filled ? "border-line text-ink hover:border-line-strong" : "border-dashed border-line text-soft hover:text-ink",
            )}
          >
            {filled ? <Pencil className="size-3" /> : <span aria-hidden>+</span>}
            {label}
          </button>
        ))}
      </div>
      <CheckInCard entry={preview} viewerId={props.viewer.userId} names={new Map()} expanded interactive={false} />
      {hasRecording && <p className="text-xs text-soft">Your video is attached and will appear on the card.</p>}
      {skip && !hasRecording && (
        <p className="text-xs text-soft">
          No video today: {VIDEO_SKIP_LABEL[skip.reason]}
          {skip.note && ` · ${skip.note}`}. Visible to your team&rsquo;s admins.
        </p>
      )}
    </div>
  );
}
