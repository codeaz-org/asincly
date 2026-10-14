# Security Policy

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security problems.

Report it privately through GitHub: **[Report a vulnerability](https://github.com/codeaz-org/asincly/security/advisories/new)**
(the repository's Security tab). For the hosted service, the contact in its
`/.well-known/security.txt` works too.

Include:

- A description of the issue and its impact
- Steps to reproduce (or a proof-of-concept)
- The affected version / commit
- Your name and any preferred credit line

We'll acknowledge receipt within **2 business days** and aim to ship a fix or mitigation
within **30 days** for high-severity issues. Coordinated disclosure appreciated.

## Scope

- The hosted service run by the maintainers
- This repository, including self-hosted deployments derived from it

Out of scope: denial of service by traffic volume, social engineering, physical attacks,
findings that need an already-compromised device.

## What we care about most

- Anything that lets one team or organization read, change or delete another's data
- Getting a recording, transcript or summary without access to its team
- Authentication bypass, session fixation, sign-in link replay, two-factor bypass
- SSRF, RCE, SQL or template injection, XSS that runs under the Content-Security-Policy
- Secrets or personal data leaking to logs, error pages or client bundles

How the code defends against these: [docs/THREAT-MODEL.md](docs/THREAT-MODEL.md).

Thanks for helping keep members' standups private.
