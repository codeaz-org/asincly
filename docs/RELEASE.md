# Asincly — release plan (OSS v0.1.0 + hosted launch)

> Live release checklist. Tick items as they land.

## Context

`main` is feature-complete through Phase 4 and the repo is already public under AGPL-3.0. The
decisions taken for this release: ship the OSS `v0.1.0` tag and the hosted paid product
together, complete all of the old Phase 5 security work before real users are let in, **merge
every open PR and work directly on `main` from here — no new PRs**.

**CI on `main` is red.** The last push to `main` failed at `pnpm/action-setup@v4`:

> Error: Multiple versions of pnpm specified … ERR_PNPM_BAD_PM_VERSION

`ci.yml` pins `version: 12` while `package.json:76` sets `packageManager: pnpm@12.1.0`, and the
action refuses both. All four Dependabot PRs fail the `quality` job for this same reason — one
root cause, not five. PR #5 already fixes it (drops the `version:` input) plus a second fix
(`typecheck` → `next typegen && tsc --noEmit`, so Next's generated route types exist before
`tsc` runs). That is why #5 is the only green PR, and why it merges first.

A three-way audit of `main` turned up four things that shape the rest of the work:

1. **Schedule recurrence is not implemented.** `nextOccurrenceDate` (`src/lib/time.ts:65`) is
   written and unit-tested but has **zero production callers**. The cron query
   (`src/app/api/cron/tick/route.ts:74`) does not even `select` `schedules.rrule`, and
   `getOrCreateTodayContext` (`src/lib/actions/check-in.ts:39`) upserts an occurrence for
   "today" unconditionally. A team that picks Mon/Wed/Fri or Weekly in Settings gets
   occurrences and `window_open` reminders **every single day**. The presets are decorative.
2. **Nothing has ever been deployed.** `cron.yml` has run every 5 minutes for days, hit its
   `APP_URL`/`CRON_SECRET` guard, logged "secret missing — skipping" and exited 0 — a green
   check over a no-op. No reminder, digest, or retention purge has ever fired.
3. **RLS is written, migrated, tested — and not on the request path.** `src/db/index.ts:7` says
   *"Never use this for feature queries"* about the superuser `db` client; only
   `src/lib/actions/social.ts` and one write in `schedule.ts:59` honour it. The whole read
   surface (`src/lib/queries.ts`) plus `check-in.ts`, `recording.ts`, `team-admin.ts`,
   `onboarding.ts` and both API routes run as superuser.
4. **PR #5 (`feat/cloud-billing`, +11,748/−133)** — Stripe plans, entitlements, guests, Slack —
   is MERGEABLE with both CI checks passing and **no review**. Everything downstream sits on it,
   including the CI fix.

Two audit findings turned out to be false and are *not* in this plan: `.env.example` is in sync
with the code (26 documented, 21 used, nothing missing), and the codebase has zero `any`, zero
`@ts-ignore`, and exactly one `eslint-disable` — which is justified inline.

---

## Phase 1 — Clear the board: merge everything, fix CI

Order matters, because #5 carries the fix the other four need.

- [ ] **Review PR #5** against the project's own rules — RLS on `org_billing`, `stripe_event`,
      `ai_usage`, `slack_install`; Zod at each new boundary; webhook signature verification and
      idempotency; audit rows on plan changes. `/code-review 5` covers the sweep; read
      `src/lib/billing/webhook.ts` and `entitlements.ts` by hand regardless. It is the largest
      unreviewed change in the repo and everything downstream sits on it.
- [ ] **Merge #5 into `main`.** CI should go green on the merge commit — verify that before
      going further; the whole point of this phase is to stop flying blind.
- [ ] **Land the four Dependabot bumps.** All four are red only because of the pnpm conflict #5
      just fixed:
      #1 `pnpm/action-setup` 4 → 6, #2 `actions/checkout` 4 → 7, #3 `actions/setup-node` 4 → 7
      (these three also clear the *"Node.js 20 is deprecated"* runner warning), #4 Docker base
      `node:22-alpine` → `node:26-alpine`.
      #1 touches the exact lines #5 rewrote, so expect a conflict — given "no new PRs", apply
      the bumps directly on `main` and close the Dependabot PRs as superseded. #4 is the only
      one with real risk (runtime two majors up): confirm the `docker` job builds *and* that the
      image boots.
- [ ] **Branch protection on `main`** requiring `quality` and `docker`. With no PR gate, a red
      `main` is the only signal left — and it just sat red unnoticed.
- [ ] `pnpm db:migrate` on a scratch database: all 21 migrations apply from empty.

From here on: commit straight to `main`, small conventional commits, keep `main` green.

---

## Phase 2 — Correctness blockers

### 2.1 Make schedules actually recur, on a due-work scheduler

This subsumes the "can we stop querying every 5 minutes?" question, because both problems have
the same fix.

**Why the current tick can't just be patched:** it is O(all teams × all members) per run, and
`route.ts:139` and `:201` load *every* `window_open` / `digest_ready` notification row with no
date or occurrence filter, then filter in JS — on a 5-minute loop, against a 5-minute Actions
timeout and a serverless function ceiling.

**The shape to move to:** a `scheduled_job` table (`run_at timestamptz`, `kind`, `team_id`,
`member_id`, `occurrence_id`, unique on the natural key) with an index on `run_at`. The tick
becomes `SELECT … WHERE run_at <= now() FOR UPDATE SKIP LOCKED LIMIT n` — O(due work), not
O(everything), safe to run concurrently, and it retries by simply not clearing the row.

Jobs get enqueued when the schedule is created or edited, and each run enqueues its own
successor from the member's *local* time — which is exactly what keeps it DST-safe, and exactly
where `nextOccurrenceDate` finally gets its production caller. Recurrence stops being
decorative as a side effect: an off day enqueues nothing.

A heartbeat still triggers the drain, and that's fine — keep `cron.yml` (or Vercel Cron) as a
dumb "drain the queue" call. What changes is that the work is scheduled rather than discovered
by scanning.

**Recommended over the alternatives:** Inngest is named in `CLAUDE.md`'s stack and would give
durable steps and retries for free, but it is another service self-hosters must run, against
the "self-hostable via one Docker Compose" goal. Postgres is already on every request path and
`FOR UPDATE SKIP LOCKED` is the boring, correct primitive. If the job volume ever justifies
Inngest, this table is what you'd port.

Also fix, while here:
- [ ] `check-in.ts:39` — guard the occurrence upsert on the RRULE too, so opening the app on an
      off day says "no check-in scheduled today" instead of creating a draft.
- [ ] Tests: MWF schedule producing nothing on Tue/Thu, across a DST boundary and in a zone
      ahead of UTC, using the existing fixtures in `src/lib/time.test.ts`.

### 2.2 Delete-flow bugs that make documented promises false

- [ ] **No object is ever deleted from the bucket.** `src/lib/s3.ts` exports no delete at all.
      `recording.ts:218`, `team-admin.ts:373` and `cron/tick/route.ts:43` each delete database
      rows and leave the video and audio behind, each with a comment deferring to a sweeper or
      lifecycle rule that exists nowhere — not in `deploy/`, not in either compose file. So GDPR
      hard delete, team delete, and the per-team retention setting do not delete recordings,
      while `src/app/legal/privacy/page.tsx:54` and `src/app/account/page.tsx:121` promise they
      do. Add `deleteObjects` to `s3.ts` and call it on all four paths.
- [ ] **`deleteAccount`** (`src/app/account/page.tsx:167`) is a bare `db.delete(users)` —
      cascades through members, check-ins and recordings with no audit row, no rate limit, no
      object cleanup.
- [ ] **The export route is the un-audited one.** `api/teams/[teamId]/export/route.ts:28` calls
      `buildExportBundle` directly and emits every decrypted transcript. The audited wrapper
      `exportTeam` (`team-admin.ts:279`, which writes `team.export`) has **no callers** — the
      settings UI links to the route. Audit and rate-limit the route.
- [ ] Other unaudited mutations: `registerRecording`, `deleteRecording`, `updateSchedule`, and
      `reopenCheckIn` (silently un-submits a published check-in).

### 2.3 Log leaks

`process-recording.ts` and `check-in.ts` are disciplined about logging `e.message` only. Three
places are not:

- [ ] `src/lib/email.ts:12` — logs the full email body and recipient whenever `RESEND_API_KEY`
      is unset. That is the *default* self-host production path, not just dev.
- [ ] `src/lib/audit.ts:26` — spreads `args.meta` into `console.error`. Callers pass user free
      text: `check-in.ts:212` the "Can't record today" reason, `onboarding.ts:185` invitee email
      lists.
- [ ] `src/lib/notifications.ts:61` — logs the raw error object; a Resend SDK error can carry
      the serialized request including the email text. Also `onboarding.ts:168` logs invitee
      emails on the happy path.

---

## Phase 3 — Security (the old Phase 5)

### 3.1 Put RLS on the request path

Today this is *not* an open door — `getTeamPageContext` (`src/lib/team-context.ts:13`) resolves
the team through `getTeamBySlug(user.id, …)`, so membership is checked in TypeScript before a
`teamId` reaches any query. The problem is that it is the only check, and `src/db/rls.test.ts`
passes by calling `withUser` directly, so the tests assert a layer production never exercises.
One missed membership check in a future page is a silent cross-tenant read with no backstop.

- [ ] Convert `src/lib/queries.ts` to take a `tx` from `withUser()` instead of importing `db`.
      Callers already hold `user.id` from `getTeamPageContext`, so this is a signature change.
- [ ] Convert `check-in.ts`, `recording.ts`, `team-admin.ts`, `onboarding.ts` the same way.
- [ ] Leave `db` for exactly three things, stated in the comment: migrations, the Auth.js
      adapter, and the job drain (no user in scope).
- [ ] CI grep or lint rule failing on `db` imports outside that allowlist — otherwise this
      regresses within a month.
- [ ] Extend `rls.test.ts` with cross-org denial per table; it never touches `recording`,
      `notification`, `audit_log` or `occurrence`.
- [ ] Fix `drizzle/0002_rls.sql:159`: the `… OR actor_user_id = current_user_id()` clause lets
      any authenticated user forge an `audit_log` row into any `org_id`.

### 3.2 Rate limiting that survives more than one instance

`src/lib/rate-limit.ts` is a per-process `Map`. On Vercel each lambda gets its own counter, so
the limits README and `docs/ARCHITECTURE.md` advertise are far weaker than they read — and they
are what defends the paid AI endpoints.

- [ ] Back it with Postgres (a `rate_limit` table, one `INSERT … ON CONFLICT` per hit). No new
      dependency; Postgres is already on every request path.
- [ ] **Auth has no limiter at all.** `src/app/sign-in/page.tsx:99` calls `signIn("resend", …)`
      unbounded — magic-link spam, user enumeration, a direct Resend bill. There is no
      `middleware.ts` in the repo; add one in front of `/api/auth/*`.
- [ ] Also uncovered: `getRecordingDraft` (`recording.ts:169`, client-polled, AES-decrypts per
      call) and the export route.
- [ ] `/api/cron/tick:35` compares the secret with `!==` — use `crypto.timingSafeEqual`, and
      drop the `?secret=` query-string form, which lands in CDN and proxy access logs.

### 3.3 Admin TOTP 2FA

Auth.js runs `session: { strategy: "database" }` against a real `session` table
(`src/db/schema.ts:52`), which makes this tractable without touching the JWT story.

- [ ] Migration: `user_totp` (secret encrypted with the existing `src/lib/crypto.ts`, backup
      codes hashed, `confirmed_at`); `session.mfa_at timestamptz`;
      `organization.require_2fa_for_admins`.
- [ ] Implement TOTP with `node:crypto` HMAC-SHA1 — RFC 6238 is ~30 lines, no dependency. Add
      `qrcode` (server-side SVG) for enrolment; manual-key-only entry is a real tax on a flow
      people already resent.
- [ ] Enforce in `requireUser()` (`src/lib/session.ts`): owner/admin of an org with the flag on
      and a session lacking `mfa_at` redirects to `/account/2fa/verify`.
- [ ] Recovery: 10 single-use backup codes shown once; an owner can reset another admin's 2FA,
      audited.

### 3.4 Session management

- [ ] `/account/sessions` listing rows from `session` with created/expires/last-seen, plus
      "revoke" and "revoke all others"; store user-agent and coarse IP at session create.
- [ ] Revoke all sessions on 2FA enrol or disable.

### 3.5 Org-level SSO enforcement

- [ ] `organization.sso_domain` + `require_sso`. In the Auth.js `signIn` callback, refuse the
      Resend magic-link provider for an email whose domain matches an org with `require_sso`.
- [ ] Guard against lockout: refuse to enable unless an owner already has a linked Google
      account.

### 3.6 CSP

`next.config.ts:21` ships `script-src 'self' 'unsafe-inline'` in production; the file's own
comment (`:17`) admits nonces are a TODO. With Next's inline hydration payload that is close to
no XSS defence at all.

- [ ] Nonce-based `script-src` via the new `middleware.ts`.
- [ ] Tighten `img-src`/`media-src` (`:23-24`) — they allow any `https:` origin, defeating the
      `s3Origin` pin.
- [ ] `:33` drops `upgrade-insecure-requests` whenever `S3_ENDPOINT` is `http://`, silently
      weakening the policy for self-hosters. Gate it on the app URL scheme instead.
- [ ] `src/lib/security-headers.test.ts` asserts header *presence* only — it would pass with
      `script-src *`. Assert the values.

### 3.7 Storage hardening

- [ ] `presignedGetUrl` (`s3.ts:88`) defaults to **1 hour**, and `queries.ts:144` mints one for
      every recording in the rendered feed whether or not the viewer expands it. A leaked page
      payload is an hour of access to every teammate's video. Drop to ~5 minutes and mint on
      expand.
- [ ] `ensureBucket` (`s3.ts:48`) creates the bucket bare — no SSE, no public-access block, no
      lifecycle rule, against CLAUDE.md's "buckets private, SSE enabled". Set both at creation
      and document the R2/B2 equivalents in `docs/DEPLOYMENT.md`.

### 3.8 Threat model and pen-test checklist

- [ ] `docs/THREAT-MODEL.md`: trust boundaries (browser ↔ app ↔ Postgres ↔ bucket ↔ Groq ↔
      Stripe), an asset inventory keyed to what is encrypted vs plaintext, a STRIDE pass per
      boundary, the accepted-risk list.
- [ ] `docs/PENTEST.md`: the checklist someone actually runs before launch — cross-tenant reads
      per table, presigned-URL replay, webhook replay, CSP bypass, magic-link reuse, rate-limit
      fan-out.

---

## Phase 4 — Test and CI gaps that gate a paid launch

The suites that exist are good (`time`, `day-rail`, `draft`, `crypto`, `rls` are genuinely
strong). The gaps are concentrated in exactly the destructive and revenue paths:

- [ ] **Zero tests on the tick/drain** (236 LOC, including a destructive retention delete) — not
      the 401 path, not `window_open` idempotency, not digest fan-out.
- [ ] **Zero tests on export and hard delete** — the highest-risk surface in the product
      (destructive + decrypts every transcript).
- [ ] **Zero tests on `recording.ts`** (MIME allowlist, 500 MB cap, ownership check) and the AI
      pipeline — nothing asserts malformed model output is rejected by `CheckInDraftSchema`, nor
      that `AI_FAKE` is ignored when `NODE_ENV=production`.
- [ ] **CI never runs Playwright.** `e2e/video.spec.ts` — the only coverage of upload →
      transcribe → draft → playback — is `test.skip` unless `AI_FAKE=1` and runs nowhere. Add an
      e2e job with a MinIO service and `AI_FAKE=1`.
- [ ] Migration-drift check (`src/db/schema.ts` vs `drizzle/meta/*_snapshot.json`); boot the
      image in the `docker` job instead of only building it; add a `concurrency:` group.
- [ ] Delete `src/lib/smoke.test.ts` (`expect(true)`).
- [ ] `CONTRIBUTING.md` promises "every feature ships with Vitest tests … and a Playwright
      test". Either close the gaps above or soften the claim before publishing.

---

## Phase 5 — Repo hygiene before the tag

- [ ] **`scrollcraft/` is 13 MB / 160 tracked files of design-lab output** — PNG scroll-frame
      dumps, `BRIEF.md`, `PLAN.md`, `FINGERPRINTS.md`. In `.dockerignore` but not `.gitignore`.
      Coupling trap: `e2e/video.spec.ts` and `e2e/screens.spec.ts` write screenshots into
      `scrollcraft/lab/asincly/` — repoint them to a gitignored path *before* removing it. Added
      across ≥5 commits, so `git rm` at HEAD won't shrink clones; `git filter-repo` only if repo
      size justifies rewriting public history.
- [ ] `git rm --cached test-results/.last-run.json` (tracked despite the ignore rule).
- [ ] Delete the empty `lab/` dir and the unused create-next-app SVGs in `public/`
      (`next.svg`, `vercel.svg`, `file.svg`, `globe.svg`, `window.svg`).
- [ ] `docs/PLAN.md` is an internal build plan linked from README as the public roadmap, and it
      is stale: it claims Inngest and an "Anthropic + Deepgram default" with OpenAI/Whisper
      adapters, when `src/lib/ai/` contains only `groq`, `fake` and `noop`. Correct the same
      claim in `CLAUDE.md`'s stack section, then convert to a public `ROADMAP.md`.
- [ ] Add `CODE_OF_CONDUCT.md`, `.github/ISSUE_TEMPLATE/`, `.github/PULL_REQUEST_TEMPLATE.md`,
      `CHANGELOG.md`. Set the repo description, homepage and topics (all empty today).
- [ ] Verify the `good first issue` label and the `security@asincly.com` inbox actually exist —
      README and `SECURITY.md` both promise them.
- [ ] Note `shadcn` (a CLI) sits in `dependencies` and is never imported, and `src/lib/utils.ts`
      re-exports the `cn@0.2.6` micro-package rather than `clsx` + `tailwind-merge` — worth a
      supply-chain look before the repo gets attention.

---

## Phase 6 — Deploy and launch

- [ ] **Add `/api/health`** — none exists. The Dockerfile's `HEALTHCHECK` wgets `/sign-in`, a
      full React render. Needed for Docker, uptime monitors and load balancers.
- [ ] **Vercel has no migration step.** `docs/DEPLOYMENT.md` A2 tells the operator to run
      `pnpm db:migrate` from their laptop. On every future deploy, new code runs against the old
      schema unless someone remembers. Add a build-time or CI migrate step. (Self-host is fine —
      the compose `migrate` service gates `app` on `service_completed_successfully`.)
- [ ] `vercel.json` is an empty stub. Add `crons`, `regions`, and per-function `maxDuration` —
      `processRecording` runs in `after()` and a Whisper call can outlast the default ceiling.
- [ ] **Document the build-time baking trap**: `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SOURCE_URL`
      and `S3_ENDPOINT` are Docker `ARG`s compiled into the bundle, and `next.config.ts` derives
      CSP `connect-src`/`media-src` from `S3_ENDPOINT` at build time. Changing storage endpoints
      needs a rebuild, not an env change — also why a prebuilt image can't be published as-is.
      Currently a code comment and nowhere in `docs/DEPLOYMENT.md`.
- [ ] Provision: Vercel project on a real domain, Neon/Supabase Postgres (set `APP_DB_PASSWORD`
      so `asincly_app` isn't on the dev password), R2 bucket with CORS PUT from the app origin,
      Resend with a verified sending domain, Groq key, Stripe live keys + webhook +
      `scripts/stripe-setup.mjs`, Slack app credentials.
- [ ] `DATA_ENCRYPTION_KEY` generated fresh and **backed up outside the platform** — losing it
      makes every transcript permanently unreadable, and `crypto.ts` has no key id in the
      envelope, so there is no rotation path.
- [ ] Set the `APP_URL` and `CRON_SECRET` repo secrets, then **read the Actions log** to confirm
      a real drain — the green check has been lying for days. Fail the job loudly instead of
      `exit 0` when secrets are missing.
- [ ] Smoke the whole loop on production: sign up → onboarding → record → AI draft → submit →
      feed → reaction/comment → digest → Stripe checkout → seat sync → Slack digest.
- [ ] Wire the marketing page's call-to-action to the real sign-up, tick the roadmap, tag
      `v0.1.0`, publish the release.

---

## Verification

- `pnpm lint && pnpm typecheck && pnpm test && pnpm build` green; `pnpm e2e` green with billing
  both on and off, now running in CI.
- New unit tests: MWF/weekly recurrence incl. a DST boundary; job-queue claim under concurrency
  (`SKIP LOCKED` never hands the same row to two drains); RFC 6238 TOTP vectors; backup-code
  single use; SSO enforcement decision table; Postgres rate limiter across two simulated
  instances; per-table cross-org RLS denial; drain 401 + idempotency + retention purge; export
  bundle owner-only.
- New Playwright specs: admin 2FA enrol → sign out → sign in → challenge → backup code; session
  revoke; magic link refused for an SSO-enforced domain; a Mon/Wed/Fri team showing no check-in
  on a Tuesday.
- Manual: run `docs/PENTEST.md` against deployed staging before opening sign-ups; confirm a
  deleted recording is gone from the bucket, not just the database.

## Open questions

1. **Encrypting the rest of the sensitive text** is a product decision, not a fix. Transcripts
   and AI summaries are properly encrypted (`process-recording.ts:84`, correct AES-256-GCM), but
   `check_in.yesterday/today/blockers` (`schema.ts:220`), `check_in_comment.body` (`:272`) and
   `notification.title/body` (`:163`) are plaintext — and notification bodies carry up to 140
   chars of blocker and comment text (`social.ts:185`) and are emailed in cleartext. Encrypting
   costs full-text search and adds N decrypts per feed render. Encrypt, or state plainly in the
   privacy page that only transcripts and AI summaries are encrypted at rest?
2. Ship 2FA and SSO enforcement on all plans, or gate org SSO behind Pro?
3. Phases 2–4 are substantial work before anyone can sign up. Worth a staging deploy right after
   Phase 2 so the product is exercised end-to-end while Phase 3 is built, rather than
   discovering deploy problems at the very end.
