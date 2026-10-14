# Data Protection Impact Assessment — template for Asincly customers

Recording staff on video and processing it with AI is likely to need a DPIA under Art. 35
GDPR (systematic processing of employees' data with new technology). This template is filled
in with what Asincly does; the parts in **[brackets]** are yours. It is a starting point, not
legal advice.

## 1. Description of the processing

- **Purpose:** asynchronous standups — staff share yesterday's work, today's plan and blockers
  in writing and, optionally, a short camera or screen recording, instead of a daily meeting.
- **Controller:** **[your organization]**. **Processor:** the Asincly operator, under its DPA.
- **Data subjects:** **[teams using it]**; guests you invite.
- **Data:** name, work email, time zone; check-in text; video and audio (image, voice, screen
  contents); AI transcripts, summaries and drafts; replies, reactions, mentions; away periods;
  timestamps.
- **AI:** the audio track, the author's notes, their previous plan and teammates' names go to
  the AI provider to transcribe and draft the check-in. The author reviews and edits the draft
  before sending; sent drafts are labelled "ai-assisted". No automated decisions.
- **Retention:** recordings per team setting (default 90 days); text until deleted.
- **Recipients:** the team; the subprocessors at `/legal/subprocessors`.

## 2. Necessity and proportionality

- **Legal basis:** **[e.g. Art. 6(1)(f) legitimate interest in coordinating remote work, or
  6(1)(b), plus your national employment-data law — Art. 88 GDPR; in Germany § 26 BDSG]**.
- **Why video is optional:** check-ins can always be written. Keep "Require a video" off unless
  you have a reason you've documented; when it's on, people can still skip with a reason.
- **Minimization:** set the shortest recording retention that works; turn AI drafting off for
  teams that don't need it; tell staff not to show sensitive data on screen.
- **Transparency:** tell staff before rollout what is recorded, who sees it, the AI step, and
  their rights. The recorder repeats the AI notice every time.
- **Rights:** export, correction, deletion and AI opt-out are self-service in the app.

## 3. Risks and measures

| Risk | Likelihood / severity | Measures |
|---|---|---|
| Use of check-ins or videos to monitor performance or behaviour | **[assess]** | A works agreement or policy limiting use to coordination; no analytics on check-ins in Asincly; access limited to the team |
| Sensitive data visible on screen recordings | **[assess]** | Staff guidance; camera-only mode; retention; deletion by the author |
| Disclosure to other customers | Low / high | Row-level security per team on every request; encrypted transcripts and summaries; expiring playback links |
| AI provider retaining or training on recordings | **[depends on operator's contract]** | Processor's DPA; AI off per team or person |
| Transfer to the US | **[assess]** | DPF / SCCs per subprocessor |
| Account takeover | Low / high | Optional 2FA (enforceable for admins), SSO enforcement, session revocation, rate-limited sign-in |

## 4. Works councils and employee representatives

Introducing a tool that records staff and can be used to observe performance usually needs
co-determination: in **Germany** § 87(1) no. 6 BetrVG (a works agreement before rollout), in
**Austria** § 96/96a ArbVG, and similar rules elsewhere (e.g. France: CSE consultation). Start
that process before turning on recordings for a team. Settings you can commit to in such an
agreement: video optional (not required), AI off, retention days, guests disabled.

## 5. Outcome

**[Residual risk, decision, DPO opinion, date, review date.]**
