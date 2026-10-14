# Deploying Asincly

Asincly is a Next.js app plus four services: **Postgres**, **S3-compatible storage**, an
**email sender** and a **scheduler** that calls `/api/cron/tick` every few minutes. AI
(Groq) is optional. Pick the path that fits your budget and how you'll use it.

| Path | Monthly cost | Provider allows business use¹ | Effort | Best for |
|---|---|---|---|---|
| [A. Free managed stack](#a-free-managed-stack-0) | **$0** | ❌ (Vercel Hobby is personal/non-commercial) | Low | Trying it, personal teams, open-source projects |
| [B. Free VM with Docker](#b-free-vm-with-docker-0) | **$0** | ✅ | Medium | Small companies that want $0 and full control |
| [C. Cheapest VPS with Docker](#c-cheapest-vps-with-docker-5month) | **~€5.50** | ✅ | Medium | Reliable production for a team or a few teams |
| [D. Managed for companies](#d-managed-for-companies-20month) | **~$20+** | ✅ | Low | Teams that don't want to run servers |

¹ About the *hosting provider's* terms only. Asincly's AGPL-3.0 license allows commercial
use on every path. Self-hosted installs have every feature: leave `BILLING_ENABLED` unset
(it's only for running a paid cloud).

Prices and free-tier limits were checked in **September 2026** and change often. Verify on
each provider's pricing page before you commit.

> **HTTPS is required for real use.** Browsers only allow the camera on `https://` (or
> `localhost`). Every path below ends with HTTPS.

---

## What you'll need in every path

1. **Secrets:**
   ```bash
   openssl rand -base64 32   # AUTH_SECRET
   openssl rand -base64 32   # DATA_ENCRYPTION_KEY (back this up — it decrypts transcripts)
   openssl rand -hex 32      # CRON_SECRET
   openssl rand -base64 24   # APP_DB_PASSWORD
   ```
2. **Email for sign-in.** A [Resend](https://resend.com) account. The free plan sends
   3,000 emails/month (100/day). You must verify a domain to email anyone other than
   yourself. Alternatively, enable Google sign-in (`AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`).
3. **AI (optional).** A [Groq](https://console.groq.com) API key. The free tier covered, at
   the time of writing, roughly 28,800 audio seconds/day of Whisper and 1,000 Llama
   requests/day. A five-minute check-in uses 300 audio seconds and one request. Check your
   limits in the Groq console. Without a key, people write check-ins by hand.

All variables are documented in [`.env.example`](../.env.example).

---

## A. Free managed stack ($0)

**Vercel Hobby + Neon + Backblaze B2 (or Cloudflare R2) + Resend + Groq + GitHub Actions.**

⚠️ Vercel's Hobby plan is for **personal, non-commercial use only**. For a company, use
B, C or D.

| Piece | Free allowance (Sept 2026) | Notes |
|---|---|---|
| [Vercel Hobby](https://vercel.com/docs/plans/hobby) | 1M function invocations, 4 CPU-hrs, 300s max duration | Cron jobs limited to **once per day**: keep the daily cron in `vercel.json`, remove the `*/5` tick entry, and run the tick from an external pinger |
| [Neon Free](https://neon.com/pricing) | 0.5 GB storage, 100 CU-hours/project, scale-to-zero after 5 min | No credit card. First request after idle is slower (cold start) |
| [Backblaze B2](https://www.backblaze.com/cloud-storage/pricing) | 10 GB storage, free egress up to 3× stored data | No credit card. Alternative: [Cloudflare R2](https://developers.cloudflare.com/r2/pricing/) with 10 GB and free egress, but R2 needs a payment method on file |
| [Resend Free](https://resend.com/pricing) | 3,000 emails/month, 100/day | Verify a sending domain |
| [Groq Free](https://console.groq.com) | See above | Optional |
| [cron-job.org](https://cron-job.org) or GitHub Actions | Free | Calls the 5-minute tick. GitHub runs scheduled jobs late under load (hours, at times), so prefer a dedicated pinger |

A recording is about 10–20 MB per 5 minutes at 720p. The default 90-day retention keeps
10 GB comfortable for a small team. Adjust it in **Settings → Data**.

### Steps

1. **Fork** this repository on GitHub. Keep it public if you want GitHub Actions minutes
   for free.
2. **Database: Neon.** Create a project, then copy two connection strings:
   - **Direct** (no `-pooler` in the host). Use it once to run migrations.
   - **Pooled** (`-pooler`). Use it for the app.

   Run the migrations from your machine:
   ```bash
   DATABASE_URL="postgres://neondb_owner:…@ep-xxx.eu-central-1.aws.neon.tech/neondb?sslmode=require" \
   APP_DB_PASSWORD="<your generated password>" \
   pnpm db:migrate
   ```
   The command warns you if the role can't bypass row-level security. Neon's default owner
   role can (projects created after Aug 2023).
3. **Storage: Backblaze B2.**
   1. Create a **private** bucket, e.g. `asincly-recordings`.
   2. Create an application key limited to that bucket.
   3. Note the S3 endpoint, e.g. `https://s3.eu-central-003.backblazeb2.com`.
   4. Add CORS rules so browsers can upload (see [CORS](#storage-cors)). B2's S3-compatible
      CORS needs the B2 CLI: `b2 bucket update --cors-rules '…'`.

   **If you use Cloudflare R2:** create a bucket and an R2 API token. The endpoint is
   `https://<account-id>.r2.cloudflarestorage.com` and the region is `auto`. Paste the CORS
   JSON under Bucket → Settings → CORS policy.
4. **Deploy on Vercel.** Import the fork and set these environment variables:
   ```
   NEXT_PUBLIC_APP_URL=https://<your-project>.vercel.app
   AUTH_URL=https://<your-project>.vercel.app
   NEXT_PUBLIC_SOURCE_URL=https://github.com/<you>/asincly
   DATABASE_URL=<Neon pooled URL, owner role>
   DATABASE_URL_APP=postgres://asincly_app:<APP_DB_PASSWORD>@<Neon pooled host>/neondb?sslmode=require
   APP_DB_PASSWORD=<the same password>
   AUTH_SECRET=…  DATA_ENCRYPTION_KEY=…  CRON_SECRET=…
   RESEND_API_KEY=…  EMAIL_FROM="Asincly <hello@yourdomain.com>"
   S3_ENDPOINT=…  S3_REGION=…  S3_ACCESS_KEY_ID=…  S3_SECRET_ACCESS_KEY=…
   S3_BUCKET_RECORDINGS=asincly-recordings  S3_FORCE_PATH_STYLE=false
   GROQ_API_KEY=…   # optional
   ```
5. **Scheduler.** Two endpoints, both called with `Authorization: Bearer $CRON_SECRET`:
   `/api/cron/tick` every 5 minutes (reminders, digests) and `/api/cron/daily` once a day
   (recording retention, storage cleanup, old notifications and sessions).
   - On Hobby, delete the `/api/cron/tick` line from `vercel.json` (Hobby crons run at most
     daily and the deploy is refused otherwise); Vercel then runs the daily job for you.
   - Call the tick from [cron-job.org](https://cron-job.org) with the header above, or use
     the bundled GitHub workflow: in the fork, **Settings → Secrets and variables →
     Actions**, add the secrets `APP_URL` and `CRON_SECRET` and the variable
     `CRON_ENABLED=true`. GitHub delays scheduled runs under load, sometimes by hours, and
     pauses them in repositories with no activity for 60 days.
6. Open your URL, sign in and create your team.

**Migrations on Vercel.** Production deploys run `pnpm db:migrate` before `next build`
(the `vercel-build` script; preview deploys skip it so they never change the production
schema). Set `APP_DB_PASSWORD` in the project so the app role isn't left on its
development password. The old deployment keeps serving while the new one builds, so write
migrations that the previous release can live with: add columns and tables first, drop
them a release later.

**Changing URLs needs a rebuild.** `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SOURCE_URL` and
`S3_ENDPOINT` are compiled into the build (the client bundle and the CSP's allowed bucket
origin come from them). After changing one, redeploy; on Docker, rebuild the image
(`--build`). An env change alone leaves the old values in place, and a mismatched
`S3_ENDPOINT` shows up as uploads or playback blocked by the CSP.

---

## B. Free VM with Docker ($0)

**Oracle Cloud Always Free VM + [`docker-compose.selfhost.yml`](../docker-compose.selfhost.yml).**
Everything, including Postgres and MinIO storage, runs on one machine you control.
Oracle's terms allow business use.

What to know about [Oracle's Always Free tier](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm):
- **Capacity:** since June 2026 the Ampere A1 allowance is **2 OCPUs and 12 GB RAM**,
  plenty for Asincly.
- **Sign-up:** needs a credit card for verification. Free resources aren't charged.
- **Idle reclamation:** Oracle can reclaim idle Always Free instances. A team using it
  daily keeps it active.
- **Availability:** popular regions sometimes report "out of capacity" when you create the
  VM; retry, or pick another region.

Setup is the same as [Docker self-host](#docker-self-host) below. You also need a domain
name for HTTPS. A cheap domain costs ~$10/year, or use a free dynamic DNS subdomain.

---

## C. Cheapest VPS with Docker (~€5.50/month)

**Hetzner Cloud CX23 (2 vCPU, 4 GB RAM, 40 GB disk, 20 TB traffic) at €5.49/month**
(prices after Hetzner's June 2026 increase). Any VPS with 2 GB+ RAM and Docker works
(DigitalOcean, Scaleway, OVH, etc.).

Then follow [Docker self-host](#docker-self-host). Add Hetzner's automatic backups (+20%)
or schedule `pg_dump` yourself.

---

## D. Managed for companies (~$20+/month)

**Vercel Pro ($20/user/month) + Neon Launch (usage-based, no minimum) + Cloudflare R2 +
Resend + Groq.**

Same steps as path A, with two differences:
- Vercel Pro's terms allow business use.
- Vercel Cron runs both jobs from the bundled `vercel.json` (tick every 5 minutes, daily
  at 03:00 UTC); no external scheduler needed. Vercel sends
  `Authorization: Bearer $CRON_SECRET` automatically when `CRON_SECRET` is set in the
  project.

---

## Docker self-host

Requirements: a Linux machine with Docker (Compose v2), ports 80/443 open, and two DNS
records pointing at it, e.g. `standup.example.com` and `files.standup.example.com`.

```bash
git clone https://github.com/codeaz-org/asincly.git && cd asincly
cp .env.example .env
```

Edit `.env`:

```bash
NEXT_PUBLIC_APP_URL=https://standup.example.com
AUTH_URL=https://standup.example.com
APP_DOMAIN=standup.example.com
S3_DOMAIN=files.standup.example.com
S3_ENDPOINT=https://files.standup.example.com
S3_FORCE_PATH_STYLE=true
S3_ACCESS_KEY_ID=asincly                 # MinIO root user
S3_SECRET_ACCESS_KEY=<long random string>
POSTGRES_PASSWORD=<long random string>
APP_DB_PASSWORD=<long random string>
AUTH_SECRET=…  DATA_ENCRYPTION_KEY=…  CRON_SECRET=…
RESEND_API_KEY=…  EMAIL_FROM="Asincly <hello@example.com>"
GROQ_API_KEY=…                           # optional
```

Start everything, with automatic HTTPS from Caddy:

```bash
docker compose -f docker-compose.selfhost.yml --profile https up -d --build
```

What runs:

| Service | Role |
|---|---|
| `postgres` | Postgres 17 with a persistent volume |
| `minio` | S3-compatible storage for recordings |
| `migrate` | Applies migrations and sets the `asincly_app` password, then exits |
| `app` | The Next.js server (non-root, standalone build) |
| `scheduler` | Calls `/api/cron/tick` every 5 minutes and `/api/cron/daily` once per UTC day |
| `caddy` | HTTPS for `APP_DOMAIN` → app and `S3_DOMAIN` → MinIO (only with `--profile https`) |

To try it locally without a domain, leave out `--profile https` and keep
`http://localhost:3000` / `http://localhost:9000`.

The app and MinIO ports are bound to `127.0.0.1`: with `--profile https`, Caddy is the only
way in, so nobody reaches the app over plain http around it. For a plain-http setup on a
trusted private network, set `PUBLIC_BIND=0.0.0.0` in `.env`. `AUTH_URL` is required:
sign-in links are built from it, never from the request's Host header.

**Updating:**

```bash
git pull
docker compose -f docker-compose.selfhost.yml --profile https up -d --build
```

**Backups:** the `backup` service dumps the database every 24 hours into `./backups`
and keeps 14 days (`BACKUP_KEEP_DAYS`). See [Operations](#operations) for what else to
keep and how to restore.

---

## Encryption key

`DATA_ENCRYPTION_KEY` encrypts transcripts, AI summaries and drafts, Slack tokens and 2FA
secrets (AES-256-GCM, each value bound to its row). A database backup is useless for that
data without the key, and the key is useless without the backup, so store them apart:

- Keep a copy of the key **outside the hosting platform** (a password manager or secrets
  vault), not only in Vercel's or the server's environment.
- Don't commit it, paste it into tickets, or reuse it between staging and production.

**Rotating** (a suspected leak, someone with access leaving, or on a schedule):

1. `openssl rand -base64 32` for a new key.
2. Set it as `DATA_ENCRYPTION_KEY`; put the old value in `DATA_ENCRYPTION_KEYS_OLD`
   (comma-separated if there are several). Deploy. Old values keep decrypting.
3. `pnpm db:rotate-key` with the production `DATABASE_URL` and both variables set. It
   re-encrypts every value onto the new key and is safe to re-run.
4. When it reports `rotated 0, failed 0`, remove the old key from `DATA_ENCRYPTION_KEYS_OLD`.

Upgrading from a version before the versioned envelope: run step 3 once; until then the
old values still read.

---

## Operations

### What to back up

| What | Managed stack | Docker self-host |
|---|---|---|
| Database | Neon / Supabase point-in-time restore (check your plan's window) | `backup` service → `./backups`; copy it off the machine (`rclone`, `restic`, a nightly `rsync`) |
| Recordings | R2/B2/S3: turn on bucket versioning or replicate to a second bucket if videos must survive an accidental delete | Mirror MinIO with `mc mirror` to another bucket or disk |
| `DATA_ENCRYPTION_KEY` | Outside the platform (see [Encryption key](#encryption-key)) | Same |
| `.env` | Your secrets manager | Your secrets manager |

Recordings are the least critical: retention deletes them anyway, and the database (with
summaries and transcripts) is what a team actually reads.

### Restoring

```bash
# Docker: into a fresh stack
gunzip -c backups/asincly-<timestamp>.sql.gz | \
  docker compose -f docker-compose.selfhost.yml exec -T postgres psql -U asincly asincly
docker compose -f docker-compose.selfhost.yml run --rm migrate   # sets the app role password
```

Restore into a scratch database once before you need it, and check a transcript decrypts
(open a check-in with a video summary). A backup you haven't restored is a guess.

### Monitoring

- **Uptime:** point a monitor (UptimeRobot, Better Stack, Checkly…) at `/api/health`. It
  returns 200 when the app reaches Postgres and 503 when it can't.
- **Errors:** every server error is logged as one JSON line with `"event":"request_error"`
  and a `digest` — the same reference users see on the error page. On Vercel, add a log
  drain (or an error-tracking integration) and alert on that event; on Docker, ship
  `docker compose logs app` to your collector.
- **Scheduled work:** `/api/cron/tick` and `/api/cron/daily` return their counts as JSON
  and a 500 if a daily job failed (`"failed"` per job). Alert on non-200 responses.
- **Stripe:** watch failed deliveries on the webhook endpoint in the Stripe dashboard.

---

## Storage CORS

Browsers upload recordings straight to the bucket with pre-signed URLs, so the bucket must
allow `PUT` from your app's origin and `GET` for playback. MinIO in the Docker setup allows
this by default. For R2, B2 or AWS S3:

```json
[
  {
    "AllowedOrigins": ["https://standup.example.com"],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["content-type"],
    "MaxAgeSeconds": 3600
  }
]
```

## Storage privacy and encryption

Keep the bucket **private**. Asincly only hands out short-lived signed URLs: a video's URL
is minted when someone presses play and lasts 15 minutes, poster frames last 5. Uploads are
signed for one exact size, so the bucket refuses anything larger than what was checked.

Encrypt recordings at rest. Asincly can't set this portably when it creates a bucket, so set
it on the provider:

| Provider | Private by default | Encryption at rest |
|---|---|---|
| Cloudflare R2 | Yes, unless you enable a public bucket URL or custom domain | Always on (AES-256) |
| Backblaze B2 | Choose **Private** when creating the bucket | Turn on **Default Encryption (SSE-B2)** in the bucket settings |
| AWS S3 | Yes (Block Public Access on by default) | SSE-S3 is the default for new buckets; use SSE-KMS for your own key |
| MinIO (Docker) | Yes | Needs a KMS: configure one per the [MinIO encryption docs](https://min.io/docs/minio/linux/operations/server-side-encryption.html), then enable SSE-S3 on the bucket. Otherwise rely on full-disk encryption on the host |

Deleting a recording, a team, an organization or an account removes its objects right away.
`/api/cron/daily` also removes any object no recording points at, as a backstop.

---

## After deploying

- **Sign in and create your team.** The first person to finish onboarding owns the
  organization.
- **Check-in rules:** under **Settings → Check-in rules**, decide whether video is required.
- **Retention:** under **Settings → Data**, set recording retention (default 90 days).
  Also add a lifecycle rule on the bucket, because deleted teams leave objects behind.
- **Modified the code?** Set `NEXT_PUBLIC_SOURCE_URL` to your fork. The AGPL requires
  offering the modified source to your users.

## Slack

Optional. Create a Slack app from the manifest in **[SLACK.md](SLACK.md)**, set
`SLACK_CLIENT_ID` and `SLACK_CLIENT_SECRET`, then connect each team under
**Settings → Integrations**.

## Billing (hosted cloud)

Self-hosters skip this section: leave `BILLING_ENABLED` unset and every feature is on.

Asincly Cloud, or anyone offering Asincly as a paid service, turns on plans with
`BILLING_ENABLED=true`. Prices and limits live in `src/lib/billing/plans.ts`.

1. **Try it in a Stripe sandbox first.** `stripe sandbox create` gives test keys without a
   business registration.
2. **Create the catalog.** `STRIPE_SECRET_KEY=... node scripts/stripe-setup.mjs` creates the
   *Asincly Pro* product, a monthly and a yearly per-member price, and a Customer Portal
   configuration.
   - It is safe to re-run.
   - It prints `STRIPE_PRICE_MONTHLY` / `STRIPE_PRICE_YEARLY`.
   - Prices are created tax-exclusive; pass `--tax-behavior=inclusive` to change that
     before the first run.
3. **Add a webhook endpoint** at `https://<your app>/api/stripe/webhook` with these events:
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
   - `customer.subscription.created`, `customer.subscription.updated`,
     `customer.subscription.deleted`
   - `invoice.paid`
   - `invoice.payment_failed`

   Put its signing secret in `STRIPE_WEBHOOK_SECRET`. Locally:
   `stripe listen --forward-to localhost:3000/api/stripe/webhook`.
4. **Set the environment:** `BILLING_ENABLED=true`, `STRIPE_SECRET_KEY` (a restricted `rk_`
   key is recommended), `STRIPE_WEBHOOK_SECRET`, and optionally the two price ids.
5. **Tax.** `STRIPE_TAX_ENABLED` stays off until you have active registrations in Stripe
   Tax.
   - With it on and no registration, Stripe calculates no tax at all.
   - Checkout always collects billing addresses and tax IDs, so turning it on later
     needs no code change.
   - The product uses tax code `txcd_10103001` (SaaS, business use). Confirm it fits
     before enabling.

How it behaves:

- **Trial:** new organizations get 14 days of Pro, with no card.
- **Seats:** they follow billable members (guests are free), with prorated invoice
  changes.
- **Failed payment:** Pro stays on for 7 days, then the organization drops to Free.
- **Downgrades lock, they don't delete.** History older than 14 days is hidden. The
  retention job trims Free videos to 14 days only 30 days after Pro ended.
- **Deleting an organization** cancels its subscription immediately.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Magic link email never arrives | Check the Resend dashboard; verify your sending domain; `EMAIL_FROM` must use it |
| "Couldn't start the camera" | The site must be served over HTTPS |
| Upload fails with a CORS error | Add the [CORS rules](#storage-cors) for your exact app origin |
| Pages load but data is empty after migrating a hosted DB | `DATABASE_URL` must use a role that can bypass RLS (owner/admin); `pnpm db:migrate` warns if not |
| `password authentication failed for user "asincly_app"` | Run `pnpm db:migrate` with `APP_DB_PASSWORD` set, and use the same password in `DATABASE_URL_APP` |
| Video uploads but no draft appears | Set `GROQ_API_KEY`; check server logs for `groq transcribe`/`groq draft` errors and your Groq rate limits |
| Reminders/digests never happen | The scheduler isn't calling `/api/cron/tick` with `Authorization: Bearer $CRON_SECRET` (the `?secret=` query form is no longer accepted) |
| Old recordings stay in the bucket | `/api/cron/daily` isn't being called once a day |
| Paid in Stripe but the plan still shows Free | The webhook isn't reaching `/api/stripe/webhook` or `STRIPE_WEBHOOK_SECRET` is wrong; check the endpoint's delivery log in Stripe |
