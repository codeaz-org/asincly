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
- [ ] Auth.js: Google, Microsoft, magic link. Session → `Member` with IANA tz (detected, editable)
- [ ] Tables + RLS: organization, team, member, schedule, occurrence, audit_log
- [ ] Onboarding: create org → create team → invite by email → set first schedule
- [ ] Schedule editor: presets (daily / MWF / weekly) + custom RRULE, window open/close in local time
- [ ] `lib/time.ts`: "today for member", "current occurrence for team", DST-safe next-window
      calculation — fully unit-tested with fixtures across 4+ time zones and a DST boundary
- [ ] Team page with timezone strip (asleep / window open / done)

## Phase 2 — Text check-ins and the feed
- [ ] `check_in` table + RLS. Draft autosave, submit.
- [ ] Markdown editor with Yesterday / Today / Blockers sections and checkbox items
- [ ] Carry-over: unchecked "Today" items pre-fill the next check-in's "Yesterday/Today"
- [ ] @mentions with team-member autocomplete; stored as structured references
- [ ] Feed grouped by occurrence; per-occurrence "who's in / who's pending"
- [ ] Mobile-first check-in flow; dark mode
- [ ] Playwright: invite → check in → appears in teammate's feed

## Phase 3 — Recording, transcription, AI summaries
- [ ] Browser recorder: camera + screen (getDisplayMedia + MediaRecorder), preview, retake, max length
- [ ] Pre-signed upload to bucket; `recording` table; signed playback URLs
- [ ] Inngest jobs: transcribe → summarize → extract action items / blockers / mentions → save
- [ ] `lib/ai/` provider interface with Anthropic + Deepgram default, OpenAI + local-Whisper adapters
- [ ] Column-level encryption for transcript + summary
- [ ] Feed shows summary above collapsed video; "watch" expands player
- [ ] Per-occurrence team digest generated when window closes or all members submit

## Phase 4 — Notifications and integrations
- [ ] `notification` table + preferences (in-app / email / Slack / push) per type
- [ ] Inngest scheduled: window_open reminders per member local time; digest_ready
- [ ] Event-driven: mentioned, blocker_on_your_item
- [ ] Email via Resend (branded templates)
- [ ] Slack app: OAuth install per team, channel digest, DM reminders, `/standup` text check-in
- [ ] Google Calendar: add standup window to member's calendar (optional)
- [ ] Web push (PWA) for mobile

## Phase 5 — Production hardening and open-source release
- [ ] Rate limiting, audit log coverage review, dependency scanning, Dependabot
- [ ] Team data export (JSON + media) and hard delete; recording retention setting
- [ ] Admin TOTP 2FA; session management; org-level SSO enforcement
- [ ] Self-host guide: single `docker compose up` with app + Postgres + MinIO + Inngest
- [ ] Branding settings (logo, accent colour) per org
- [ ] Threat-model doc, pen-test checklist, `SECURITY.md` disclosure process
- [ ] Public repo, landing page → real sign-up

## Deliberately out of scope for v1
Live/synchronous video, chat/threads beyond comments on a check-in, Gmail API integration,
Jira/Linear sync (later), mobile native apps (PWA first).
