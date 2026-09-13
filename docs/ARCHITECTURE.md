# Architecture

A short map of how Asincly works, for contributors and self-hosters.

## Domain

```
Organization ─┬─ Team ─┬─ Member (owner | admin | member)
              │        ├─ Schedule (RRULE + local window) ── Occurrence (one date) ── CheckIn
              │        └─ require_video rule                                         ├─ Recording (video, audio, poster, encrypted transcript/summary/draft)
              │                                                                      ├─ Comment ── Reaction
              │                                                                      ├─ Reaction (any emoji)
              │                                                                      └─ BlockerAction (help | resolved)
              └─ AuditLog
User ── MemberAway (date range) · Notification
```

- **Time:** everything is stored in UTC. "Today" is always computed in each member's IANA
  time zone (`src/lib/time.ts`). The day rail places each person at their own local time
  (`src/lib/day-rail.ts`).
- **Check-in items:** check-ins are markdown. List lines become items: tasks carry forward,
  and blockers get stable keys for "I can help" (`src/lib/note-items.ts`). Mentions are
  markdown links: `[@Name](mention:<userId>)`.

## Video → check-in pipeline

```
Browser                               Server                                   Providers
───────                               ──────                                   ─────────
record video + separate audio track
PUT to bucket (pre-signed URLs) ───▶  registerRecording (Zod, ownership, keys)
                                      after(): processRecording
                                        status: transcribing ─────────────────▶ Groq Whisper (audio track)
                                        status: drafting
                                          previous plan + open blockers
                                          + roster + typed text + notes ──────▶ Groq Llama (JSON)
                                        CheckInDraftSchema validation
                                        encrypt transcript / summary / draft
poll getRecordingDraft ◀────────────  composeDraft: done / carried forward /
                                      new items, autoTag teammates (roster ids only)
review, edit, untag, send ────────▶  submitCheckIn (video rule, mention diff → notifications)
```

- **Providers are pluggable** (`src/lib/ai`): Groq, a noop fallback, and a deterministic fake
  for tests (`AI_FAKE=1`).
- **Untrusted model output:** everything the model returns is parsed with Zod. Anyone it
  names is checked against the team roster before they're tagged.
- **Notes:** talking points jotted before recording go to the drafter but are never stored.

## Security model

- **Row-level security:** FORCE RLS is enabled on every domain table. The app's
  non-superuser role `asincly_app` runs with `app.current_user_id` set per transaction
  (`withUser`). Policies check team membership through SECURITY DEFINER helpers
  (`drizzle/0002`, `0013`, `0015`). Tests are in `src/db/rls.test.ts`.
- **Encryption at rest:** transcripts, summaries and AI drafts use AES-256-GCM with
  `DATA_ENCRYPTION_KEY`, and their contents are never logged.
- **Media:** video never passes through the app server. Browsers upload with pre-signed PUT
  URLs, only for object keys minted for that check-in and allowlisted MIME types, and play
  back through short-lived signed GET URLs.
- **Validation and limits:** every server action and route validates input with Zod.
  Uploads, AI processing, comments, reactions and nudges are rate-limited.
- **Audit:** mutations write to `audit_log`.
- **Headers:** a strict CSP and security headers are set in `next.config.ts`.

## Scheduling

`/api/cron/tick` (Bearer `CRON_SECRET`) does three jobs:
- sends window-open reminders, skipping away members;
- generates digests;
- purges recordings past team retention.

It is called by GitHub Actions, the Docker `scheduler` service or Vercel Cron.

## Code map

| Path | What |
|---|---|
| `src/app/[orgSlug]/[teamSlug]/(shell)` | Today, People, Settings, check-in detail (shared shell) |
| `src/app/[orgSlug]/[teamSlug]/check-in` | Focus-mode, video-first check-in |
| `src/components/brand` | The logo mark as status/progress/loader, sunrise moment |
| `src/components/dashboard` | Day rail, cards, blockers, pending |
| `src/components/check-in` | Flow, comments, skip-video dialog |
| `src/components/emoji` | Emoji picker and reaction bar |
| `src/lib/actions` | Server actions (all Zod-validated) |
| `src/lib/ai` | Provider interface, Groq, fake, noop, draft schema |
| `src/lib/draft.ts` | composeDraft / autoTag / untag (pure, tested) |
| `drizzle/` | SQL migrations, including hand-written RLS |
| `e2e/` | Playwright flows |
