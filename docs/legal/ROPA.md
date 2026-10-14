# Records of processing activities (Art. 30 GDPR) — operator template

Fill in **[brackets]** and keep this with your compliance records. Generated from what the
code does; review with counsel.

## A. As controller (Art. 30(1))

**Controller:** **[LEGAL_ENTITY_NAME, address, contact]** · **DPO / representative:** **[if any]**

| Activity | Purpose | Data subjects | Data | Recipients | Transfers | Retention | Security |
|---|---|---|---|---|---|---|---|
| Accounts and sign-in | Provide and secure accounts | Users | Email, name, time zone, sessions (device, network prefix), 2FA settings | Hosting, database, email provider, Google (optional) | US via DPF/SCCs | Until account deletion; sessions 30 days idle | See DPA Annex 2 |
| Billing | Charge for paid plans; tax | Organization owners, billing contacts | Contact, company, address, VAT ID, invoices | Stripe | IE/US | Per tax law | Card data held by Stripe |
| Service email | Reminders, notifications, sign-in links | Users | Email address, message content | Email provider | US via DPF/SCCs | Notifications 90 days | Preferences and one-click unsubscribe |
| Security and abuse | Protect accounts and the service | Users, visitors | Audit log, rate-limit counters, request logs | Hosting provider | US via DPF/SCCs | Audit log: org lifetime; counters 2 days; logs **[provider retention]** | Access restricted |

## B. As processor (Art. 30(2))

**Processor:** **[operator]** · **Controllers:** each customer organization (list kept in the
`organization` table, with `terms_version` and `terms_accepted_at`).

| Category of processing | Subprocessors | Transfers | Security |
|---|---|---|---|
| Hosting and storing team content (check-ins, recordings, replies, reactions, away periods) | Hosting, database, object storage | US via DPF/SCCs | DPA Annex 2 |
| AI transcription and drafting of recordings | AI provider | US via SCCs | Off per team / person; DPA Annex 2 |
| Notifications and digests to email and Slack | Email provider, Slack (if connected) | US via DPF/SCCs | DPA Annex 2 |
