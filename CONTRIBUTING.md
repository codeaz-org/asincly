# Contributing

Thanks for your interest! Asincly is AGPL-3.0. By contributing you agree your work is
licensed under the same terms.

## Setup

See [README.md](./README.md#quick-start-dev) for the dev environment. TL;DR:

```bash
pnpm install
cp .env.example .env
pnpm db:up && pnpm db:migrate
pnpm dev
```

## Conventions

- **Commits:** conventional (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`). Keep them PR-sized.
- **Branches:** `feat/<short-desc>`, `fix/<short-desc>`.
- **PRs:** small and focused. Explain the *why*. Link the issue if there is one.
- **Style:** ESLint + Prettier are authoritative — run `pnpm lint` before pushing.
- **Types:** no `any`, no `eslint-disable` without a comment explaining why.
- **Schema before UI:** for any new entity, write the Drizzle migration and Zod schema before the UI.
- **Tests:** every feature ships with at least one Vitest test for pure logic; user flows get a Playwright test.
- **Dependencies:** before adding one, say why (in the PR) and check bundle size.
- **Product decisions:** if a decision isn't in [docs/PLAN.md](./docs/PLAN.md), ask before guessing.

## Security

Do **not** open public issues for security problems — see [SECURITY.md](./SECURITY.md).

## CI

GitHub Actions runs `lint`, `typecheck`, `test`, and `build` on every PR. Playwright e2e
runs against a spun-up dev server. PRs must be green to merge.
