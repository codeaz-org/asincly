# Deploying Asincly

Asincly is a Next.js app plus four services: **Postgres**, **S3-compatible storage**, an
**email sender** and a **scheduler** that calls `/api/cron/tick` every few minutes. AI
(Groq) is optional. Pick the path that fits your budget and how you'll use it.

| Path | Monthly cost | Commercial use | Effort | Best for |
|---|---|---|---|---|
| [A. Free managed stack](#a-free-managed-stack-0) | **$0** | ❌ (Vercel Hobby is personal/non-commercial) | Low | Trying it, personal teams, open-source projects |
| [B. Free VM with Docker](#b-free-vm-with-docker-0) | **$0** | ✅ | Medium | Small companies that want $0 and full control |
| [C. Cheapest VPS with Docker](#c-cheapest-vps-with-docker-5month) | **~€5.50** | ✅ | Medium | Reliable production for a team or a few teams |
| [D. Managed for companies](#d-managed-for-companies-20month) | **~$20+** | ✅ | Low | Teams that don't want to run servers |

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
| [Vercel Hobby](https://vercel.com/docs/plans/hobby) | 1M function invocations, 4 CPU-hrs, 300s max duration | Cron jobs limited to **once per day**, so use GitHub Actions for the 5-minute tick |
| [Neon Free](https://neon.com/pricing) | 0.5 GB storage, 100 CU-hours/project, scale-to-zero after 5 min | No credit card. First request after idle is slower (cold start) |
| [Backblaze B2](https://www.backblaze.com/cloud-storage/pricing) | 10 GB storage, free egress up to 3× stored data | No credit card. Alternative: [Cloudflare R2](https://developers.cloudflare.com/r2/pricing/) with 10 GB and free egress, but R2 needs a payment method on file |
| [Resend Free](https://resend.com/pricing) | 3,000 emails/month, 100/day | Verify a sending domain |
| [Groq Free](https://console.groq.com) | See above | Optional |
| GitHub Actions | Free for public repos | [`cron.yml`](../.github/workflows/cron.yml) runs every 5 minutes |

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
   AUTH_SECRET=…  DATA_ENCRYPTION_KEY=…  CRON_SECRET=…
   RESEND_API_KEY=…  EMAIL_FROM="Asincly <hello@yourdomain.com>"
   S3_ENDPOINT=…  S3_REGION=…  S3_ACCESS_KEY_ID=…  S3_SECRET_ACCESS_KEY=…
   S3_BUCKET_RECORDINGS=asincly-recordings  S3_FORCE_PATH_STYLE=false
   GROQ_API_KEY=…   # optional
   ```
5. **Scheduler: GitHub Actions.** In the fork, go to **Settings → Secrets and variables →
   Actions** and add `APP_URL` (your Vercel URL) and `CRON_SECRET`. The workflow calls the
   tick every 5 minutes. GitHub may delay scheduled runs, and it pauses scheduled
   workflows in repositories with no activity for 60 days. Any push re-enables them.
6. Open your URL, sign in and create your team.

---

## B. Free VM with Docker ($0)

**Oracle Cloud Always Free VM + [`docker-compose.selfhost.yml`](../docker-compose.selfhost.yml).**
Everything, including Postgres and MinIO storage, runs on one machine you control.
Commercial use is allowed.

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
- Commercial use is allowed.
- You can replace GitHub Actions with Vercel Cron. Add this to `vercel.json`:
  ```json
  { "crons": [{ "path": "/api/cron/tick", "schedule": "*/5 * * * *" }] }
  ```
  Vercel sends `Authorization: Bearer $CRON_SECRET` automatically when `CRON_SECRET` is
  set in the project.

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
| `scheduler` | Calls `/api/cron/tick` every 5 minutes |
| `caddy` | HTTPS for `APP_DOMAIN` → app and `S3_DOMAIN` → MinIO (only with `--profile https`) |

To try it locally without a domain, leave out `--profile https` and keep
`http://localhost:3000` / `http://localhost:9000`.

**Updating:**

```bash
git pull
docker compose -f docker-compose.selfhost.yml --profile https up -d --build
```

**Backups:**

```bash
docker compose -f docker-compose.selfhost.yml exec postgres pg_dump -U asincly asincly > backup.sql
```

Also back up the `miniodata` volume and, above all, `DATA_ENCRYPTION_KEY`.

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

Keep the bucket **private**. Asincly only hands out short-lived signed URLs.

---

## After deploying

- **Sign in and create your team.** The first person to finish onboarding owns the
  organization.
- **Check-in rules:** under **Settings → Check-in rules**, decide whether video is required.
- **Retention:** under **Settings → Data**, set recording retention (default 90 days).
  Also add a lifecycle rule on the bucket, because deleted teams leave objects behind.
- **Modified the code?** Set `NEXT_PUBLIC_SOURCE_URL` to your fork. The AGPL requires
  offering the modified source to your users.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Magic link email never arrives | Check the Resend dashboard; verify your sending domain; `EMAIL_FROM` must use it |
| "Couldn't start the camera" | The site must be served over HTTPS |
| Upload fails with a CORS error | Add the [CORS rules](#storage-cors) for your exact app origin |
| Pages load but data is empty after migrating a hosted DB | `DATABASE_URL` must use a role that can bypass RLS (owner/admin); `pnpm db:migrate` warns if not |
| `password authentication failed for user "asincly_app"` | Run `pnpm db:migrate` with `APP_DB_PASSWORD` set, and use the same password in `DATABASE_URL_APP` |
| Video uploads but no draft appears | Set `GROQ_API_KEY`; check server logs for `groq transcribe`/`groq draft` errors and your Groq rate limits |
| Reminders/digests never happen | The scheduler isn't calling `/api/cron/tick` with the right `CRON_SECRET` |
