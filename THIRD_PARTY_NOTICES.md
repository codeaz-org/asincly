# Third-party notices

Asincly is licensed under the [GNU AGPL-3.0-or-later](./LICENSE). It builds on open-source
software and assets under their own licenses, all compatible with the AGPL.

## Bundled assets

| Asset | Where | License |
|---|---|---|
| [Emojibase data](https://emojibase.dev) (emoji dataset and Slack/iamcal shortcodes) | `public/emoji/17.0.0/` | MIT — see `public/emoji/17.0.0/LICENSE` |
| [Geist](https://vercel.com/font) and Geist Mono | Downloaded and self-hosted at build time by `next/font` | SIL Open Font License 1.1 |
| [Noto Color Emoji](https://fonts.google.com/noto/specimen/Noto+Color+Emoji) | Downloaded and self-hosted at build time by `next/font` | SIL Open Font License 1.1 |
| [Lucide](https://lucide.dev) icons | Rendered from the `lucide-react` package | ISC |

## Runtime dependencies

As of this release, the production dependency tree (`pnpm licenses list --prod`) contains
only licenses compatible with AGPL-3.0:

| License | Packages |
|---|---|
| MIT | 374 |
| Apache-2.0 | 30 |
| ISC | 22 |
| BSD-3-Clause | 8 |
| BSD-2-Clause | 4 |
| Unlicense | 2 |
| BlueOak-1.0.0 | 2 |
| MIT-0, 0BSD, Python-2.0, CC-BY-4.0 (browser data) | 1 each |

Key direct dependencies:
- [Next.js](https://github.com/vercel/next.js) (MIT)
- [React](https://github.com/facebook/react) (MIT)
- [Drizzle ORM](https://github.com/drizzle-team/drizzle-orm) (Apache-2.0)
- [postgres.js](https://github.com/porsager/postgres) (Unlicense)
- [Auth.js](https://github.com/nextauthjs/next-auth) (ISC)
- [Base UI](https://github.com/mui/base-ui) (MIT)
- [Tailwind CSS](https://github.com/tailwindlabs/tailwindcss) (MIT)
- [AWS SDK for JavaScript](https://github.com/aws/aws-sdk-js-v3) (Apache-2.0)
- [Zod](https://github.com/colinhacks/zod) (MIT)
- [frimousse](https://github.com/liveblocks/frimousse) (MIT)
- [react-markdown](https://github.com/remarkjs/react-markdown) (MIT)
- [rrule](https://github.com/jkbrzt/rrule) (BSD-3-Clause)
- [date-fns](https://github.com/date-fns/date-fns) (MIT)
- [Resend SDK](https://github.com/resend/resend-node) (MIT)

To regenerate the full list: `pnpm licenses list --prod`.

## External services

Asincly can call third-party services that you configure: Groq (AI), Resend (email), your S3
provider and Google (sign-in). Their terms apply to your use of them; none are required to
run the software.
