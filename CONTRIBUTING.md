# Contributing to Asincly

Thanks for helping! Asincly is licensed under **AGPL-3.0-or-later**. By contributing, you agree
that your contributions are licensed under the same terms.

## Ways to help

- **Report bugs:** open an issue with steps to reproduce, what you expected and what
  happened (screenshots help).
- **Suggest features:** open an issue describing the problem first; check
  [docs/PLAN.md](./docs/PLAN.md) to see if it's planned.
- **Docs and deployment guides:** especially for hosting providers we don't cover yet.
- **Code:** issues labelled `good first issue` are a great start.

Security problems go to [SECURITY.md](./SECURITY.md), never public issues.

## Development setup

Requirements: Node.js 22+, pnpm 12 (`npm i -g corepack@latest && corepack enable`), Docker.

```bash
pnpm install
cp .env.example .env        # generate AUTH_SECRET, DATA_ENCRYPTION_KEY, CRON_SECRET
pnpm db:up                  # Postgres (5433) + MinIO (9000)
pnpm db:migrate
pnpm db:seed                # demo team: sign in as demo@asincly.local
AI_FAKE=1 pnpm dev          # fake AI drafts; drop AI_FAKE and set GROQ_API_KEY for the real thing
```

The magic sign-in link prints in the dev server output when `RESEND_API_KEY` is empty.

## Tests

```bash
pnpm lint && pnpm typecheck
pnpm test                               # Vitest: pure logic + row-level security (needs pnpm db:up)
AI_FAKE=1 pnpm dev                      # in another terminal
AI_FAKE=1 PW_CHANNEL=chrome pnpm e2e    # Playwright (omit PW_CHANNEL to use bundled Chromium)
```

CI runs lint, typecheck, migrations, unit tests, a production build and the Docker image
build on every pull request.

UI changes: refresh the README images with `node scripts/screenshots.mjs <token>` (token from
`pnpm db:seed --session`, dev server running with `AI_FAKE=1`).

## Conventions

- **Commits:** [Conventional Commits](https://www.conventionalcommits.org) (`feat:`, `fix:`,
  `docs:`, `refactor:`, `test:`, `chore:`). Keep them PR-sized.
- **Branches:** `feat/<short-desc>`, `fix/<short-desc>`.
- **Pull requests:** small and focused. Explain the *why*, link the issue, and add
  screenshots for UI changes.
- **Schema before UI:** for a new entity, write the Drizzle migration, its RLS policies and
  the Zod schema first.
- **Security rules:**
  - RLS on every table;
  - Zod validation at every boundary;
  - never log transcripts, summaries or drafts;
  - media only through pre-signed URLs;
  - write to `audit_log` from mutations.
- **Types:** no `any`, no `eslint-disable` without a comment explaining why.
- **Tests:** every feature ships with Vitest tests for its pure logic, and a Playwright test
  for user flows.
- **Dependencies:** explain why in the PR and check the bundle size impact. Licenses must be
  AGPL-compatible (MIT, Apache-2.0, BSD, ISC, …).
- **Time zones:** use the helpers in `src/lib/time.ts`; never hand-roll UTC offsets.
- **Design:** read the design notes in [CLAUDE.md](./CLAUDE.md) and
  [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md). Reuse the brand mark
  (`src/components/brand`) and UI primitives (`src/components/ui`).

## Project structure

See [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md#code-map).
