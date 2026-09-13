import {
  boolean,
  date,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { AdapterAccountType } from "next-auth/adapters";

// ────────── Auth.js tables (Drizzle adapter shape) ──────────

export const users = pgTable("user", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("emailVerified", { mode: "date", withTimezone: true }),
  image: text("image"),
  tz: text("tz").notNull().default("UTC"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const accounts = pgTable(
  "account",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

export const sessions = pgTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date", withTimezone: true }).notNull(),
});

export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date", withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

// ────────── Domain tables ──────────

export const memberRole = pgEnum("member_role", ["owner", "admin", "member"]);

export const organizations = pgTable("organization", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const teams = pgTable(
  "team",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    // Recording auto-purge horizon (days). 0 = never purge.
    recordingRetentionDays: integer("recording_retention_days").notNull().default(90),
    // Owners/admins can make a video mandatory; members may still skip with a reason.
    requireVideo: boolean("require_video").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("team_org_slug_uq").on(t.orgId, t.slug)],
);

// Team-scoped membership (per CLAUDE.md). A user in N teams has N rows.
export const members = pgTable(
  "member",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: memberRole("role").notNull().default("member"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("member_team_user_uq").on(t.teamId, t.userId)],
);

export const schedules = pgTable("schedule", {
  id: uuid("id").primaryKey().defaultRandom(),
  teamId: uuid("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  rrule: text("rrule").notNull(),
  windowOpenLocal: time("window_open_local").notNull(),
  windowCloseLocal: time("window_close_local").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const occurrences = pgTable(
  "occurrence",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scheduleId: uuid("schedule_id")
      .notNull()
      .references(() => schedules.id, { onDelete: "cascade" }),
    scheduleDate: date("schedule_date").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("occurrence_schedule_date_uq").on(t.scheduleId, t.scheduleDate)],
);

export const checkInStatus = pgEnum("check_in_status", ["draft", "submitted"]);
export const notificationType = pgEnum("notification_type", [
  "mentioned",
  "blocker_on_your_item",
  "window_open",
  "digest_ready",
  "commented",
  "help_offered",
  "blocker_resolved",
  "nudged",
]);

export const notifications = pgTable("notification", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  teamId: uuid("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  type: notificationType("type").notNull(),
  title: text("title").notNull(),
  body: text("body"),
  linkPath: text("link_path"),
  data: jsonb("data").$type<Record<string, unknown>>(),
  readAt: timestamp("read_at", { withTimezone: true }),
  emailSentAt: timestamp("email_sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const recordingStatus = pgEnum("recording_status", [
  "uploaded",
  "processing",
  "transcribing",
  "drafting",
  "ready",
  "failed",
]);

// A single video/audio blob attached to a check-in. Payload lives in S3;
// this row holds the pointer + AI-derived text (encrypted at rest).
export const recordings = pgTable("recording", {
  id: uuid("id").primaryKey().defaultRandom(),
  checkInId: uuid("check_in_id")
    .notNull()
    .references(() => checkIns.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  objectKey: text("object_key").notNull(),
  posterKey: text("poster_key"),
  // Audio-only track uploaded next to the video; small enough to transcribe.
  audioKey: text("audio_key"),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes"),
  durationMs: integer("duration_ms"),
  status: recordingStatus("status").notNull().default("uploaded"),
  // Encrypted (AES-256-GCM). Zero-length string when absent.
  transcriptCipher: text("transcript_cipher").notNull().default(""),
  summaryCipher: text("summary_cipher").notNull().default(""),
  // Encrypted AI draft of yesterday/today/blockers. Only ever returned to the author.
  draftCipher: text("draft_cipher").notNull().default(""),
  processingError: text("processing_error"),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const checkIns = pgTable(
  "check_in",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    occurrenceId: uuid("occurrence_id")
      .notNull()
      .references(() => occurrences.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: checkInStatus("status").notNull().default("draft"),
    yesterday: text("yesterday").notNull().default(""),
    today: text("today").notNull().default(""),
    blockers: text("blockers").notNull().default(""),
    localDate: date("local_date").notNull(),
    // Set when the team requires video and the author couldn't record.
    videoSkipReason: text("video_skip_reason"),
    videoSkipNote: text("video_skip_note"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("check_in_occurrence_user_uq").on(t.occurrenceId, t.userId)],
);

// ────────── Social layer on a check-in ──────────

// One row per (check-in, person, kind). Toggling deletes the row.
export const checkInReactions = pgTable(
  "check_in_reaction",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    checkInId: uuid("check_in_id")
      .notNull()
      .references(() => checkIns.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Any single emoji. `comment_id` set = a reaction on a reply to this check-in.
    emoji: text("emoji").notNull(),
    commentId: uuid("comment_id").references(() => checkInComments.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("check_in_reaction_emoji_uq")
      .on(t.checkInId, t.userId, t.emoji)
      .where(sql`${t.commentId} IS NULL`),
    uniqueIndex("comment_reaction_emoji_uq")
      .on(t.commentId, t.userId, t.emoji)
      .where(sql`${t.commentId} IS NOT NULL`),
  ],
);

// Short plain-text replies under a check-in. Soft-deleted so the thread keeps
// its shape ("comment removed") without holding the text.
export const checkInComments = pgTable("check_in_comment", {
  id: uuid("id").primaryKey().defaultRandom(),
  checkInId: uuid("check_in_id")
    .notNull()
    .references(() => checkIns.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  editedAt: timestamp("edited_at", { withTimezone: true }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const blockerActionKind = pgEnum("blocker_action_kind", ["help", "resolved"]);

// Actions on a single blocker line. Blockers live as markdown in
// check_in.blockers; `item_key` is a stable hash of the normalised line
// (see src/lib/blockers.ts), so edits to other lines don't orphan actions.
export const blockerActions = pgTable(
  "blocker_action",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    checkInId: uuid("check_in_id")
      .notNull()
      .references(() => checkIns.id, { onDelete: "cascade" }),
    itemKey: text("item_key").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: blockerActionKind("kind").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("blocker_action_uq").on(t.checkInId, t.itemKey, t.userId, t.kind)],
);

// A member marks themselves away for a date range (inclusive, in their own
// local calendar). Away members are skipped by reminders and "not in yet".
export const memberAway = pgTable("member_away", {
  id: uuid("id").primaryKey().defaultRandom(),
  teamId: uuid("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  startsOn: date("starts_on").notNull(),
  endsOn: date("ends_on").notNull(),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const auditLogs = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  actorUserId: text("actor_user_id").references(() => users.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  resourceType: text("resource_type").notNull(),
  resourceId: text("resource_id"),
  meta: jsonb("meta").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
