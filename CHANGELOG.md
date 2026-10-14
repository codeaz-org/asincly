# Changelog

All notable changes to this project. Format: [Keep a Changelog](https://keepachangelog.com/),
versions: [SemVer](https://semver.org/).

## [Unreleased] — release candidate for 0.1.0

### Added
- Two-factor authentication (TOTP, backup codes), required per organization for owners and admins
- Session list with remote sign-out; Google SSO enforcement per email domain
- Role changes and ownership transfer for teams and organizations
- Email preferences with one-click unsubscribe
- AI notice before recording, "ai-assisted" label, AI opt-out per team and per person
- Personal data export; acceptance of Terms and DPA at organization creation
- Legal pages (privacy, terms, DPA, subprocessors, cookies, security, imprint,
  accessibility) driven by `LEGAL_*` settings; DPIA and records-of-processing templates
- `/api/health`, `/api/cron/daily`, `/.well-known/security.txt`, structured error logging,
  nightly backups in the Docker setup, encryption key rotation (`pnpm db:rotate-key`)

### Changed
- Every page reads and writes as the signed-in person under row-level security
- Rate limits are shared across instances (Postgres) and cover sign-in
- Nonce-based Content-Security-Policy; images and media only from the app and the bucket
- Video URLs are minted on play and expire in 15 minutes; uploads are signed for one size
- Magic links expire after one hour

### Fixed
- A guest could create a team and then delete the whole organization
- One invalid schedule rule stopped reminders for every tenant
- Deleting data left recordings in the bucket
- Out-of-order Stripe events could roll an organization's plan back
- Email bodies, invitee lists and raw errors were written to logs
