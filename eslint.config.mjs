import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // The owner connection (`db`) bypasses row-level security. Request-path
  // code reads and writes through withUser() (src/db/with-user.ts) so RLS is
  // the backstop if a membership check is ever missed. Only the files below
  // may import `db`, each for a stated reason; adding one is a review item.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: [
      "src/**/*.test.ts",
      "src/db/**",
      // Auth.js adapter: writes users and tokens before any session exists.
      "src/auth.ts",
      // Resolves the session's user row on every request; sessions and TOTP
      // secrets are tables the app role can't read.
      "src/lib/session.ts",
      "src/lib/actions/account-security.ts",
      "src/app/account/security/page.tsx",
      // Scheduled jobs: act for no single viewer.
      "src/app/api/cron/**",
      "src/lib/process-recording.ts",
      "src/lib/recording-objects.ts",
      // Maintainer growth counts across all orgs (aggregates only), behind
      // STATS_TOKEN like the cron routes.
      "src/app/api/stats/**",
      // Anonymous per-campaign visit counters, written from after() on public pages.
      "src/lib/visits.ts",
      // Server-only bookkeeping tables the app role can't touch.
      "src/lib/audit.ts",
      "src/lib/rate-limit.ts",
      // Writes on other people's behalf: notifications to teammates, and the
      // signed (sessionless) unsubscribe link.
      "src/lib/notifications.ts",
      "src/app/api/email/**",
      // Stripe and Slack: org-level state written from webhooks and OAuth.
      "src/lib/billing/**",
      "src/lib/slack/**",
      "src/app/api/slack/**",
      "src/lib/actions/billing.ts",
      "src/lib/actions/slack.ts",
      // Admin flows that create users (invites), orgs (onboarding) or delete
      // across tables by cascade; each checks the caller's role first.
      "src/lib/actions/onboarding.ts",
      // Invites live in a table the app role can't read; matched by the
      // signed-in email.
      "src/lib/actions/invitations.ts",
      "src/lib/actions/team-admin.ts",
      "src/lib/actions/schedule.ts",
      "src/lib/actions/social.ts",
      "src/app/account/page.tsx",
      "src/app/api/teams/**",
      // A person's own data, including teams they've left (RLS would hide it).
      "src/app/api/account/**",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/db",
              importNames: ["db"],
              message: "Use withUser() from @/db/with-user so RLS applies. See the allowlist in eslint.config.mjs.",
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
