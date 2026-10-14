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
      // Resolves the session's user row on every request.
      "src/lib/session.ts",
      // Scheduled jobs: act for no single viewer.
      "src/app/api/cron/**",
      "src/lib/process-recording.ts",
      "src/lib/recording-objects.ts",
      // Server-only bookkeeping tables the app role can't touch.
      "src/lib/audit.ts",
      "src/lib/rate-limit.ts",
      // Writes on other people's behalf: notifications to teammates.
      "src/lib/notifications.ts",
      // Stripe and Slack: org-level state written from webhooks and OAuth.
      "src/lib/billing/**",
      "src/lib/slack/**",
      "src/app/api/slack/**",
      "src/lib/actions/billing.ts",
      "src/lib/actions/slack.ts",
      // Admin flows that create users (invites), orgs (onboarding) or delete
      // across tables by cascade; each checks the caller's role first.
      "src/lib/actions/onboarding.ts",
      "src/lib/actions/team-admin.ts",
      "src/lib/actions/schedule.ts",
      "src/lib/actions/social.ts",
      "src/app/account/page.tsx",
      "src/app/api/teams/**",
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
