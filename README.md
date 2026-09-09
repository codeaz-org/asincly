# Asincly

Async standups for remote teams. Members check in on their own local schedule with a short
camera + screen recording and a markdown note; AI turns recordings into bullet summaries,
extracts action items and mentions; the team reads a per-occurrence digest instead of meeting.

- Landing page: <https://asincly.vercel.app>
- License: AGPL-3.0 — self-hostable, hosted cloud version available.

## Quick start (dev)

```bash
pnpm install
cp .env.example .env
pnpm db:up            # Postgres + MinIO via Docker Compose
pnpm db:migrate       # apply Drizzle migrations
pnpm dev              # http://localhost:3000
```

Optional: paste a free [Groq](https://console.groq.com) key into `.env` (`GROQ_API_KEY=...`)
to get real Whisper transcription + Llama summaries. Without a key the pipeline runs to
completion using a no-op stub that just echoes your written note.

### Other scripts

| Command            | What it does                                     |
| ------------------ | ------------------------------------------------ |
| `pnpm test`        | Vitest (unit)                                    |
| `pnpm e2e`         | Playwright (end-to-end)                          |
| `pnpm lint`        | ESLint                                           |
| `pnpm typecheck`   | `tsc --noEmit`                                   |
| `pnpm db:studio`   | Drizzle Studio (browse local Postgres)           |
| `pnpm db:generate` | Generate a new migration from `src/db/schema.ts` |
| `pnpm db:down`     | Stop the local Docker services                   |

## Stack

Next.js (App Router) · TypeScript · Tailwind · shadcn/ui · Postgres + Drizzle (with FORCE
row-level security) · Auth.js (Google + magic link) · S3-compatible storage (MinIO local,
R2/S3 prod) · Groq for AI (Whisper + Llama, free tier) · Resend for email · plain cron
endpoint for reminders + digest (no Inngest signup required).

## Self-host

Everything runs in Docker for the datastores:

```bash
cp .env.example .env
# Fill AUTH_SECRET (openssl rand -base64 32),
# DATA_ENCRYPTION_KEY (openssl rand -base64 32),
# CRON_SECRET (openssl rand -hex 32),
# optionally GROQ_API_KEY, RESEND_API_KEY.

docker compose up -d          # Postgres + MinIO
pnpm install
pnpm db:migrate
pnpm build && pnpm start      # serves on :3000
```

### Cron (already wired, free, zero external service)

The scheduled work — window-open reminders, digest generation, recording retention
purges — runs from a single endpoint `/api/cron/tick` guarded by `CRON_SECRET`.
**You don't have to run anything yourself.** Two schedulers ship in the repo, pick the
one that matches your deployment:

- **Vercel deploy** — `vercel.json` already registers `/api/cron/tick` every 5 minutes.
  Set `CRON_SECRET` in the Vercel project's env; Vercel signs each request with
  `Authorization: Bearer $CRON_SECRET` automatically. Done.
- **Anywhere else (self-host, Render, Fly, bare metal)** — the GitHub Actions workflow
  at `.github/workflows/cron.yml` fires every 5 minutes and curls your deploy. Set two
  repository secrets: `APP_URL` (e.g. `https://asincly.your-domain.com`) and `CRON_SECRET`
  (same value as in the app env).

Local dev: run `pnpm cron:local` to fire a single tick against `localhost:3000` — useful
for testing reminder logic without waiting for schedules to open.

Object retention on the bucket side (S3 lifecycle rule) is recommended so orphaned files
from deleted teams get swept — the DB delete leaves them behind on purpose to keep
cascading deletes fast.

### Prod deploy

Vercel + Neon/Supabase for Postgres + Cloudflare R2 for storage is the shortest path.
Set the same env vars, point `DATABASE_URL` at Neon, `S3_ENDPOINT` at R2, add a Vercel
Cron entry for `/api/cron/tick`.

## Security posture

- Postgres row-level security is `FORCE`-enabled on every domain table. Runtime queries
  go through a non-superuser `asincly_app` role; every request wraps its queries in a tx
  that sets `app.current_user_id` so policies can check membership.
- Recording transcripts and summaries are stored **AES-256-GCM encrypted** at rest
  (`DATA_ENCRYPTION_KEY` from env). Cipher never touches logs.
- Uploads go **browser → pre-signed PUT → bucket**, never through our API. Playback via
  short-lived signed GET URLs.
- Rate limiting on onboarding, invite, and upload-URL endpoints.
- Every mutation writes to `audit_log` (who did what to which resource, when).
- Team owners can export all data (JSON) or hard-delete the org (cascades everything).
- Recording retention is configurable per team (default 90 days).
- CSP + HSTS + `X-Frame-Options: DENY` + `Referrer-Policy` on every response.

See [SECURITY.md](./SECURITY.md) for the disclosure process.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Roadmap in [docs/PLAN.md](./docs/PLAN.md).
