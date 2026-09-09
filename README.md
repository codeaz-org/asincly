# Asincly

Async standups for remote teams. Members check in on their own local schedule with a short
camera + screen recording and a markdown note; AI turns recordings into bullet summaries,
extracts action items and mentions; the team reads a per-occurrence digest instead of meeting.

- Landing page: <https://asincly.vercel.app>
- License: AGPL-3.0 — self-hostable via Docker Compose, hosted cloud version available.

## Quick start (dev)

```bash
pnpm install
cp .env.example .env
pnpm db:up            # Postgres + MinIO via Docker Compose
pnpm db:migrate       # apply Drizzle migrations
pnpm dev              # http://localhost:3000
```

Other scripts:

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

Next.js (App Router) · TypeScript · Tailwind · shadcn/ui · Postgres + Drizzle ·
Auth.js (Google, Microsoft, magic link) · S3-compatible storage (MinIO local, R2 cloud) ·
Inngest for background jobs · pluggable AI (Anthropic + Deepgram default) · Resend · Slack app.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Security reports: [SECURITY.md](./SECURITY.md).

## Roadmap

See [docs/PLAN.md](./docs/PLAN.md).
