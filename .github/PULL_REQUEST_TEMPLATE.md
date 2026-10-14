## What and why

<!-- One or two sentences. Link the issue if there is one. -->

## How it was tested

- [ ] `pnpm lint && pnpm typecheck && pnpm test`
- [ ] `pnpm e2e` for user-facing changes (CI runs it with billing off and on)
- [ ] New entity: migration + Zod schema + RLS policy before the UI

## Checks

- [ ] No personal data or secrets in logs
- [ ] New `db` (owner connection) imports are justified in `eslint.config.mjs`
- [ ] `.env.example` and docs updated if behaviour or configuration changed
