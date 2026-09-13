import { z } from "zod";

// Boundary schemas for the social layer. Every server action parses its
// input with one of these before touching the database.

// Exactly one emoji grapheme: a pictographic character (with any skin tone,
// ZWJ sequence or variation selector) or a flag made of regional indicators.
// Validated structurally, so the server needs no emoji dataset.
const PICTO = /\p{Extended_Pictographic}/u;
const FLAG = /^\p{Regional_Indicator}{2}$/u;
const KEYCAP = /^[0-9#*]\uFE0F?\u20E3$/u;

export function isSingleEmoji(value: string): boolean {
  if (!value || value.length > 32) return false;
  const segments = [...new Intl.Segmenter("en", { granularity: "grapheme" }).segment(value)];
  if (segments.length !== 1) return false;
  return PICTO.test(value) || FLAG.test(value) || KEYCAP.test(value);
}

export const Emoji = z.string().max(32).refine(isSingleEmoji, "Pick an emoji");

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

export const ToggleReactionSchema = z.object({
  checkInId: z.string().uuid(),
  commentId: z.string().uuid().optional(),
  emoji: Emoji,
});

export const VIDEO_SKIP_REASONS = ["no_mic", "noisy", "unwell", "privacy", "other"] as const;
export type VideoSkipReason = (typeof VIDEO_SKIP_REASONS)[number];

export const VIDEO_SKIP_LABEL: Record<VideoSkipReason, string> = {
  no_mic: "No camera or mic",
  noisy: "Noisy place",
  unwell: "Not feeling well",
  privacy: "Not a good moment",
  other: "Something else",
};

export const VideoSkipSchema = z.object({
  reason: z.enum(VIDEO_SKIP_REASONS),
  note: z
    .string()
    .max(140)
    .nullish()
    .transform((s) => s?.trim() || null),
});

export const TeamRulesSchema = z.object({
  teamId: z.string().uuid(),
  requireVideo: z.boolean(),
});

export const COMMENT_MAX = 2000;

export const AddCommentSchema = z.object({
  checkInId: z.string().uuid(),
  body: z
    .string()
    .transform((s) => s.trim())
    .pipe(z.string().min(1, "Write something first").max(COMMENT_MAX, "Keep it under 2000 characters")),
});

export const DeleteCommentSchema = z.object({
  commentId: z.string().uuid(),
});

export const BlockerActionSchema = z.object({
  checkInId: z.string().uuid(),
  itemKey: z.string().regex(/^[0-9a-f]{8}$/),
});

export const MAX_AWAY_DAYS = 60;

export const SetAwaySchema = z
  .object({
    teamId: z.string().uuid(),
    startsOn: isoDate,
    endsOn: isoDate,
    note: z
      .string()
      .max(140)
      .optional()
      .transform((s) => s?.trim() || null),
  })
  .refine((v) => v.endsOn >= v.startsOn, { message: "End date must be after start", path: ["endsOn"] })
  .refine(
    (v) =>
      (Date.parse(`${v.endsOn}T00:00:00Z`) - Date.parse(`${v.startsOn}T00:00:00Z`)) / 86_400_000 <
      MAX_AWAY_DAYS,
    { message: `Away periods are limited to ${MAX_AWAY_DAYS} days`, path: ["endsOn"] },
  );

export const ClearAwaySchema = z.object({
  awayId: z.string().uuid(),
});

export const NudgeSchema = z.object({
  teamId: z.string().uuid(),
  userId: z.string().min(1).max(64),
});

export type ActionResult = { ok: true } | { ok: false; error: string };
