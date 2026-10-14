# Legal documents

What ships with Asincly, and what an operator (the hosted cloud, or anyone self-hosting
for others) still has to do. **None of this is legal advice.** The pages are careful drafts
written against what the code actually does; have them reviewed by counsel in your
jurisdiction before launch.

| Document | Where | Notes |
|---|---|---|
| Privacy Policy | `/legal/privacy` | Controller/processor split, bases, AI processing, transfers, retention, rights |
| Terms of Service | `/legal/terms` | B2B only, plans and cancellation, liability, DSA contact, law and courts |
| Data Processing Agreement (Art. 28) | `/legal/dpa` | Accepted at org creation (stored with version and time); Annex 2 lists the real controls |
| Subprocessors | `/legal/subprocessors` | Data from `SUBPROCESSORS` in `src/lib/legal.ts` |
| Cookies | `/legal/cookies` | Strictly necessary only, so no consent banner |
| Security | `/legal/security`, `/.well-known/security.txt` | Disclosure policy and controls |
| Imprint | `/legal/imprint` | Legal notice (§ 5 DDG / § 5 ECG and similar) |
| Accessibility | `/legal/accessibility` | Statement with known gaps |
| DPIA template | [`DPIA.md`](DPIA.md) | For customers; video of staff + AI makes a DPIA likely mandatory for them |
| Records of processing (Art. 30) | [`ROPA.md`](ROPA.md) | The operator's own register, as controller and as processor |

## Before launch (operator)

1. Set the `LEGAL_*` variables (`.env.example`). Until the core ones are set, every legal
   page shows a red notice and bracketed placeholders.
2. Check `SUBPROCESSORS` in `src/lib/legal.ts` against the providers you actually use, and
   sign each provider's DPA. For the AI provider use a paid plan whose terms exclude
   training on your data and limit retention; the free tier is fine for trying Asincly, not
   for customers' staff recordings.
3. Confirm the transfer basis per provider (Data Privacy Framework certification or SCCs).
4. Decide on a Data Protection Officer (likely not mandatory at launch size) and, if the
   operator has no EU establishment, appoint an EU representative (Art. 27).
5. Register for VAT/OSS where needed, then set `STRIPE_TAX_ENABLED=true`; the Terms promise
   reverse charge for EU businesses with a VAT ID.
6. Bump `LEGAL_VERSION` in `src/lib/legal.ts` whenever these documents change materially.
   Organizations store the version they accepted.
7. Put the processes the documents promise in place: email owners 30 days before a
   subprocessor change, answer rights requests within a month, notify customers of breaches
   within 48 hours.
