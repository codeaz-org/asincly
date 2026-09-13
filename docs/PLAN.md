# Asincly — Build Plan

Each phase ends in something runnable and tested. Don't start a phase until the previous one
is green. Tick boxes as work lands.

## Phase 0 — Repo foundation
- [x] `create-next-app` (TS, App Router, Tailwind, ESLint, `src/`, pnpm), shadcn/ui init
- [x] Docker Compose: Postgres + MinIO; `.env.example`; `pnpm db:up`
- [x] Drizzle setup, first migration, `db:migrate`, `db:studio`
- [x] Vitest + Playwright wired; CI (GitHub Actions: lint, typecheck, test, build)
- [x] `LICENSE` (AGPL-3.0), `README`, `SECURITY.md`, `CONTRIBUTING.md`
- [x] Security headers + CSP baseline

## Phase 1 — Auth, orgs, teams, schedules (timezone-correct core)
- [x] Auth.js: Google, magic link. Session → `Member` with IANA tz (detected, editable). Microsoft SSO deferred.
- [x] Tables + RLS: organization, team, member, schedule, occurrence, audit_log
- [x] Onboarding: create org → create team → invite by email → set first schedule
- [x] Schedule editor: presets (daily / MWF / weekly) + custom RRULE, window open/close in local time
- [x] `lib/time.ts`: "today for member", "current occurrence for team", DST-safe next-window
      calculation — fully unit-tested with fixtures across 4+ time zones and a DST boundary
- [x] Team page with timezone strip (asleep / window open / done — "done" lands in Phase 2)

## Phase 2 — Text check-ins and the feed
- [x] `check_in` table + RLS. Draft autosave, submit.
- [x] Markdown editor with Yesterday / Today / Blockers sections and checkbox items
- [x] Carry-over: unchecked "Today" items pre-fill the next check-in's "Yesterday/Today"
- [x] @mentions with team-member autocomplete; stored as structured references
- [x] Feed grouped by occurrence; per-occurrence "who's in / who's pending"
- [x] Mobile-first check-in flow; dark mode
- [x] Playwright: invite → check in → appears in teammate's feed

## Phase 3 — Recording, transcription, AI summaries
- [x] Browser recorder: camera + screen (getDisplayMedia + MediaRecorder), preview, retake, max length
- [x] Pre-signed upload to bucket; `recording` table; signed playback URLs
- [~] Inngest jobs: transcribe → summarize → extract action items / blockers / mentions → save
      (pipeline runs synchronously today; moves to Inngest steps in Phase 4)
- [x] `lib/ai/` provider interface with Anthropic + Deepgram default, OpenAI + local-Whisper adapters
      (interface + noop fallback; Deepgram/Anthropic/Whisper adapters slot in when their env keys land)
- [x] Column-level encryption for transcript + summary
- [x] Feed shows summary above collapsed video; "watch" expands player
- [ ] Per-occurrence team digest generated when window closes or all members submit (Phase 4 with the scheduler)

## Phase 4 — Notifications and integrations
- [x] `notification` table (in-app + email). Per-channel preferences UI deferred.
- [x] Cron-triggered: window_open reminders per member local time; digest_ready.
      (Uses `/api/cron/tick` guarded by CRON_SECRET; same handlers move to Inngest steps unchanged.)
- [x] Event-driven: mentioned, blocker_on_your_item
- [x] Email via Resend (plain-text; branded HTML templates deferred)
- [ ] Slack app: OAuth install per team, channel digest, DM reminders, `/standup` text check-in
- [ ] Google Calendar: add standup window to member's calendar (optional)
- [ ] Web push (PWA) for mobile

## Phase 5 — Production hardening and open-source release
- [x] Rate limiting (in-memory per-user on hot mutations), audit log helper wired into org.create /
      member.invite / team.set_retention / team.export / org.delete. Dependabot config for npm +
      Actions + Docker.
- [x] Team data export (JSON, decrypted transcripts + summaries) and hard delete;
      recording retention setting (per-team, purged nightly by cron).
- [ ] Admin TOTP 2FA; session management; org-level SSO enforcement
- [x] Self-host guide: docker compose (Postgres + MinIO) + `pnpm build && pnpm start` +
      cron hitting `/api/cron/tick`. Full app-in-container Dockerfile deferred.
- [ ] Branding settings (logo, accent colour) per org
- [ ] Threat-model doc, pen-test checklist. `SECURITY.md` disclosure process is in place.
- [ ] Public repo, landing page → real sign-up

### Explicitly deferred, needs its own sprint
- Slack app, Google Calendar, Web push — each is a proper integration with OAuth setup,
  template design, and a separate settings surface.
- TOTP 2FA and org-level SSO enforcement — needs a security-focused pass with recovery flows.
- Per-org branding — theme tokens + upload flow + preview per org.
- Threat-model doc and pen-test — real security work, not code.
- Real cloud landing-page + sign-up funnel — product decision + marketing site.

## Design revamp — "the async morning"
- [x] Landing palette as app tokens (warm ground, cream ink, single amber accent); emerald retired
- [x] Logo mark as the status/progress/loading glyph (`components/brand/`): states, progress fill, MarkLoader, Sunrise
- [x] Route groups: shared `(shell)` layout, `/people` (old `/team` redirects), `/c/[checkInId]` detail, focus-mode check-in
- [x] Mobile bottom nav with the viewer's mark as the check-in button
- [x] Today: day rail (`lib/day-rail.ts`, tested), your card, needs attention, per-day switcher, not-in-yet
- [x] Guided check-in (`lib/check-in-steps.ts`, tested): yesterday tick-off → today → blockers → video → review → send
- [x] Recorder camera-only mode (phones) + mp4 (Safari); server mime allowlist + object-key ownership check
- [x] Sign-in, onboarding wizard, account, settings, legal, 404 on the new system

## Social layer
- [x] Reactions (seen / nice / thanks / can help) — `check_in_reaction` + RLS
- [x] Comments with soft delete + `commented` notification — `check_in_comment` + RLS
- [x] Blocker actions: "I can help" / resolved (author only, enforced in RLS) — `blocker_action`
- [x] Away periods: skipped by reminders and "not in yet" — `member_away`
- [x] Nudge a teammate whose window is open (1 per pair per day)
- [x] Export includes comments, reactions, blocker actions, away periods

## Video-first check-in
- [x] Record first; AI drafts yesterday / today / blockers (`lib/ai` Drafter: Groq, noop, AI_FAKE for e2e)
- [x] Previous plan + open blockers shown while recording; taps sent as hints; not-done items carry forward (`lib/draft.ts`, `lib/check-in-context.ts`)
- [x] Audio-only track uploaded for transcription; processing runs after the response (`after()`), client polls
- [x] Auto-tag teammates heard in the video or typed by name, removable before sending; new mentions on update notify
- [x] Team rule "Require a video" (owners + admins) with "Can't record today" reasons visible to admins, enforced server-side
- [x] Slack-style emoji: any-emoji reactions on check-ins and replies (frimousse, self-hosted emojibase data), `:shortcode:` autocomplete, Noto Color Emoji fallback

## Deliberately out of scope for v1
Live/synchronous video, chat/threads beyond comments on a check-in, Gmail API integration,
Jira/Linear sync (later), mobile native apps (PWA first).
