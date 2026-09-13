// Guided check-in: step order, navigation and the "can send" rule. Pure so
// the flow component stays a thin view over it.

// Video first: talking replaces typing, AI drafts the text steps, review is
// where most people finish. The text steps stay for writing by hand or edits.
export const STEPS = ["video", "yesterday", "today", "blockers", "review"] as const;
export type Step = (typeof STEPS)[number];

export const STEP_COPY: Record<Step, { label: string; question: string; hint: string }> = {
  yesterday: {
    label: "Yesterday",
    question: "What moved forward?",
    hint: "Wins, merges, conversations. A few bullets is plenty.",
  },
  today: {
    label: "Today",
    question: "What's on today?",
    hint: "One task per line. Type @ to mention a teammate.",
  },
  blockers: {
    label: "Blockers",
    question: "Anything in your way?",
    hint: "Mention who can unblock you — they get a heads-up.",
  },
  video: {
    label: "Record",
    question: "Talk through your day.",
    hint: "What got done, what's next, what's in your way. We'll write it up for you.",
  },
  review: {
    label: "Review",
    question: "This is what your team sees.",
    hint: "Edit any part, then send.",
  },
};

export function parseStep(value: string | null | undefined, fallback: Step = "yesterday"): Step {
  return (STEPS as readonly string[]).includes(value ?? "") ? (value as Step) : fallback;
}

export function stepIndex(step: Step): number {
  return STEPS.indexOf(step);
}

export function nextStep(step: Step): Step | null {
  return STEPS[stepIndex(step) + 1] ?? null;
}

export function prevStep(step: Step): Step | null {
  const i = stepIndex(step);
  return i > 0 ? STEPS[i - 1] : null;
}

// 0 on the first step, 1 on review.
export function stepProgress(step: Step): number {
  return stepIndex(step) / (STEPS.length - 1);
}

export type Draft = {
  yesterday: string;
  today: string;
  blockers: string;
  hasRecording: boolean;
  /** Team rule: a video (or a reason for skipping it) is required. */
  requireVideo?: boolean;
  hasSkipReason?: boolean;
};

// Text with something in it besides empty list markers ("- ", "- [ ] ").
export function hasContent(md: string): boolean {
  return md.replace(/^\s*(?:[-*+]|\d+[.)])?\s*(?:\[[ xX]\])?\s*$/gm, "").trim().length > 0;
}

export function canSend(d: Draft): boolean {
  const something = hasContent(d.yesterday) || hasContent(d.today) || hasContent(d.blockers) || d.hasRecording;
  if (!something) return false;
  return !d.requireVideo || d.hasRecording || !!d.hasSkipReason;
}

// Where to open the flow: sent check-ins and drafts with a video go to review;
// a fresh draft starts by recording; an edited draft without a video resumes
// at the first empty text step.
export function initialStep(d: Draft, status: "draft" | "submitted", edited = true): Step {
  if (status === "submitted" || d.hasRecording) return "review";
  if (!edited) return "video";
  if (!hasContent(d.yesterday)) return "yesterday";
  if (!hasContent(d.today)) return "today";
  return "blockers";
}
