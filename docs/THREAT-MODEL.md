# Threat model

What Asincly protects, where the trust boundaries are, how each is attacked, and what
stops it. Written against the code; when a control changes, change this file in the same
commit. The run-before-launch checklist is [PENTEST.md](PENTEST.md).

## Assets

| Asset | Where | Protection at rest |
|---|---|---|
| Video and audio recordings | Object storage (R2 / MinIO) | Private bucket, provider encryption; keys are random UUIDs under the check-in |
| Transcripts, AI summaries, AI drafts | `recording.*_cipher` | AES-256-GCM, bound to row and field, rotatable key |
| Slack bot tokens | `slack_install.bot_token_cipher` | AES-256-GCM, bound to the team |
| TOTP secrets, backup codes | `user_totp` | Secret AES-256-GCM; codes SHA-256; table invisible to the app role |
| Check-in text, replies, notifications | Postgres | Database-level only (no column encryption — stated in the privacy policy) |
| Session tokens, magic-link tokens | `session`, `verificationToken` | Invisible to the app role; magic links 1 h single use |
| `DATA_ENCRYPTION_KEY`, `AUTH_SECRET`, `CRON_SECRET`, provider keys | Environment | Never in the repo; key backed up outside the platform |
| Billing state | `org_billing`, Stripe | Written only by verified webhooks; app role read-only |

## Trust boundaries

```
browser ──(1)── Next.js app ──(2)── Postgres
   │                 │  └──(3)── object storage ──(4)── browser (signed URLs)
   │                 ├──(5)── AI provider (Groq)
   │                 ├──(6)── Stripe / Slack / Google / Resend
   └──(7)── scheduler ──► /api/cron/*
```

## STRIDE per boundary

### 1. Browser → app
| Threat | Control |
|---|---|
| **S**poofing a user | Auth.js database sessions (httpOnly, `__Secure-`), magic links 1 h single use and rate-limited per inbox and per client address, optional TOTP with per-session challenge, SSO enforcement per domain, Google profiles without verified email refused |
| **T**ampering with input | Zod at every server action and route; ids parsed as UUIDs; markdown rendered without raw HTML, images rendered as links |
| **R**epudiation | `audit_log` for administrative actions (roles, ownership, exports, deletions, security settings, schedule changes, recording create/delete, check-in reopen) |
| **I**nformation disclosure | RLS on every request (below); export owner-only and audited; personal export filtered to the requester; error pages show a digest only |
| **D**enial of service | Postgres-backed rate limits on sign-in, uploads, AI, exports, polling, social actions; RRULEs validated so one tenant can't stall the scheduler |
| **E**levation of privilege | Team roles checked server-side; org-level power (delete, billing, SSO, 2FA policy) only for `organization.owner_user_id`; guests and members can't create teams |
| XSS | Nonce-based CSP (`strict-dynamic`, no `unsafe-inline` scripts); React escaping; `img-src`/`media-src` limited to self + bucket |

### 2. App → Postgres
| Threat | Control |
|---|---|
| A missing membership check reads another tenant | Request-path code uses `withUser()` (role `asincly_app`, RLS forced); the owner client is allowlisted per file in `eslint.config.mjs` |
| Forged rows via the app role | Policies check membership and authorship; `audit_log` inserts need the caller as actor; `occurrence` changes need admin |
| SQL injection | Drizzle parameterized queries; raw SQL only with bound parameters |
| Ciphertext swapped between rows | GCM associated data binds each value to its row |

### 3–4. Object storage
| Threat | Control |
|---|---|
| Upload of arbitrary or huge files | Presigned PUT signs content type and exact length; MIME allowlist; 500 MB cap; key minted per check-in and checked on register |
| Reading someone else's video | Bucket private; playback URL minted on play after a membership + plan-history check; 15 min (posters 5 min) |
| Orphaned data after deletion | Every delete path removes objects; daily sweep removes anything unreferenced after 24 h |

### 5. AI provider
| Threat | Control |
|---|---|
| Recordings retained or used for training | Contractual (paid plan + DPA; see `docs/legal`); AI off per team or per person; notice before recording |
| Malicious or malformed model output | `CheckInDraftSchema` limits shape and sizes; `composeDraft` re-checks ids against the roster; author reviews before sending |
| Prompt injection through speech | Output is only ever a draft for its author; it can't act, mention people outside the team, or send |

### 6. Third parties
| Threat | Control |
|---|---|
| Forged Stripe events | Signature verification; idempotency table; out-of-order events ignored by `stripe_event_at` |
| Slack OAuth CSRF / state replay | HMAC-signed state bound to user, 10 min expiry, `timingSafeEqual`; admin re-checked on callback |
| Email content leaking | No email bodies in logs; one-click unsubscribe signed per user and stream |

### 7. Scheduler
| Threat | Control |
|---|---|
| Unauthenticated cron calls | `Authorization: Bearer` only (no query-string secret), constant-time compare |
| One bad tenant stopping jobs | Per-schedule isolation in the tick; per-job isolation in the daily route |

## Accepted risks

- Check-in text, replies and notifications aren't column-encrypted (search and feed speed);
  a database dump without the key exposes them.
- Fixed-window rate limits allow up to twice the limit across a window boundary.
- `user_visible()` lets anyone who shares an org see a member's name and email.
- Request logs at the hosting provider contain IP addresses; retention is the provider's.
- Old Git history still contains the removed design-lab files (no secrets).
- Self-hosters own their infrastructure hardening (TLS via the Caddy profile, firewall,
  backups off-machine).
