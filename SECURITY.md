# Security Policy

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security problems.

Email **security@asincly.com** with:

- A description of the issue and its impact
- Steps to reproduce (or a proof-of-concept)
- The affected version / commit
- Your name and any preferred credit line

We'll acknowledge receipt within **2 business days** and aim to ship a fix or mitigation
within **30 days** for high-severity issues. Coordinated disclosure appreciated.

## Scope

- The Asincly hosted service (`*.asincly.com`)
- This repository, including self-hosted deployments derived from it

Out of scope: rate limiting on public marketing pages, missing security headers on
static assets, denial-of-service via traffic volume, social engineering, physical attacks.

## What we care about most

- Anything that lets one team read, modify, or delete another team's data
- Recording, transcript, or summary exposure via unsigned URLs or leaked keys
- Auth bypass, session fixation, magic-link replay
- SSRF, RCE, SQL injection, template injection
- Secrets leaking to logs, error reports, or client bundles

Thanks for helping keep members' standups private.
