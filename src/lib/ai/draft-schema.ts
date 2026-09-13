import { z } from "zod";

// The contract between any Drafter (LLM or fake) and the app. Model output is
// untrusted: it is parsed with this schema, and ids are re-checked against
// the inputs by composeDraft before anything reaches the user's draft.

const Line = z.string().trim().min(1).max(240);

export const CheckInDraftSchema = z.object({
  previous: z
    .array(z.object({ key: z.string().max(16), status: z.enum(["done", "not_done", "dropped"]) }))
    .max(50)
    .default([]),
  yesterday: z.array(z.object({ text: Line })).max(20).default([]),
  today: z.array(z.object({ text: Line })).max(20).default([]),
  blockers: z
    .array(z.object({ text: Line, continuesKey: z.string().max(16).nullish() }))
    .max(10)
    .default([]),
  mentions: z.array(z.object({ userId: z.string().max(64), heardAs: z.string().max(80).optional() })).max(20).default([]),
  bullets: z.array(z.string().trim().min(1).max(140)).max(6).default([]),
});

export type CheckInDraft = z.infer<typeof CheckInDraftSchema>;

export const EMPTY_DRAFT: CheckInDraft = {
  previous: [],
  yesterday: [],
  today: [],
  blockers: [],
  mentions: [],
  bullets: [],
};

export type PrevItem = { key: string; text: string; checked: boolean };
export type RosterEntry = { userId: string; name: string };
export type Sections = { yesterday: string; today: string; blockers: string };

export type DraftInput = {
  transcript: string;
  typed: Sections;
  previous: PrevItem[];
  openBlockers: PrevItem[];
  roster: RosterEntry[];
  authorTz: string;
  /** Statuses the author tapped while recording; they win over the model. */
  hints: Record<string, "done" | "not_done">;
};
