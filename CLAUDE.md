# Asincly

Async standups for remote teams. Members check in on their own local schedule with a short
camera + screen recording and a markdown note; AI turns recordings into bullet summaries,
extracts action items and mentions; the team reads a per-occurrence digest instead of meeting.

Landing page: https://asincly.vercel.app — this repo is the product behind it.
Goal: production-grade, security-first, open-source (AGPL-3.0), self-hostable via Docker Compose,
with a hosted cloud version.

## Stack (do not swap without asking)

- Next.js (App Router, TypeScript strict), deployed on Vercel
- Tailwind + shadcn/ui as the component base (restyled, see Design)
- Postgres (Supabase locally via Docker, Neon/Supabase in prod), Drizzle ORM, SQL migrations checked in
- Auth: Auth.js — Google + Microsoft SSO, magic link; optional TOTP 2FA for admins
- Storage: S3-compatible (Cloudflare R2 in cloud, MinIO in self-host) via pre-signed URLs
- Background jobs: Inngest (transcription, summaries, scheduled reminders, digests)
- AI: pluggable provider interface (`lib/ai/`). Default: Anthropic for summaries, Deepgram for
  transcription. Must be swappable to OpenAI / local Whisper for self-hosters.
- Email: Resend. Slack: official Slack app (OAuth, `chat:write`, slash command, interactive).
- Tests: Vitest (unit), Playwright (e2e). Lint: ESLint + Prettier. `pnpm` only.

## Domain model (core nouns — keep names consistent everywhere)

- `Organization` → `Team` → `Member` (role: owner | admin | member)
- `Schedule` — belongs to Team. RRULE string + a "window" (open/close time in each member's
  local tz). Presets: daily, mon/wed/fri, weekly, custom.
- `Occurrence` — one instance of a Schedule (e.g. "Wed 9 Sep"). Owns a collection of check-ins.
- `CheckIn` — Member × Occurrence. Has `note` (markdown), optional `Recording`, `status`
  (draft | submitted), `submittedAt` (UTC) and `localDate`.
- `Recording` — object key, duration, `Transcript`, `Summary` (bullets, actionItems, blockers,
  mentions).
- `Notification` — typed (window_open, mentioned, blocker_on_your_item, digest_ready).

Timezone rule: every member has an IANA tz. Everything stored in UTC; "today" is always
computed in the member's tz. Occurrences group check-ins by the *schedule date*, not by UTC
wall-clock. Use `date-fns-tz`/`Temporal` helpers in `lib/time.ts` — never hand-roll offsets.
Reminders must survive DST changes (schedule next-run from the member's local time each day).

## Security rules (non-negotiable)

- Row-level security on every table keyed on team membership. Enable RLS in migrations, not later.
- Never proxy video/audio through the API. Browser → pre-signed PUT → bucket. Playback via
  short-lived signed GET URLs. Buckets private, SSE enabled.
- Transcripts and summaries are the most sensitive text we hold: encrypt at rest (column-level,
  key from env/KMS), never log their contents.
- Zod-validate every input at the boundary (route handlers, server actions, job payloads).
- Rate-limit auth, upload-URL and AI endpoints. CSP + security headers in `next.config`.
- `audit_log` table: who did what to which resource, when. Write to it from mutations.
- Per-team data export and hard delete (GDPR). Recording retention policy is a team setting.
- Secrets only via env; `.env.example` is always up to date; `.env*` gitignored.
- No `any`, no `eslint-disable` without a comment explaining why.

## Design

Direction: calm, feed-first, minimal chrome, dark mode first-class, generous type, motion only
on state change. One primary action per screen ("Check in"). Summaries are the default view;
video is tap-to-expand. Mobile check-in flow is designed first. A timezone strip shows who is
asleep / in their window / done. Avoid generic SaaS purple-gradient look.

## Working conventions

- Small PR-sized commits with conventional messages (`feat:`, `fix:`, `chore:`).
- Write the migration and the Zod schema before the UI for any new entity.
- Every feature ships with at least one Vitest test for the pure logic and, for user flows,
  a Playwright test.
- Before adding a dependency, say why and check bundle size.
- When unsure about a product decision, check `docs/PLAN.md`; if still unsure, ask rather than guess.
- Update `docs/PLAN.md` checkboxes as work lands.

## Commands

- `pnpm dev` — start app · `pnpm db:up` — local Postgres + MinIO via Docker Compose
- `pnpm db:migrate` / `pnpm db:studio` · `pnpm test` · `pnpm e2e` · `pnpm lint`
- 