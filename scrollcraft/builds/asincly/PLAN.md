# PLAN — Asincly (Living ribbon)

## Grammar

**Living ribbon.** A new named grammar. The whole page is one fixed horizontal ribbon
whose state is a deterministic function of scroll progress. There are no acts, no
chapters, no clips, no seams. Scroll is not a camera — scroll is **time**, from 04:00 to
midnight of a single day.

**Fits:** a product where the surface is inherently temporal and human. Async standups,
on-call rotas, calendars, sleep trackers, anything where the story you're telling is a
day itself.

**Forbids:** section blocks / `sc-section`; act devices (`scrub`, `pin`, `spotlight`,
`magnet`, `kinetic` stacks); marketing chrome above the fold (no full-bleed hero image,
no wordmark-and-CTA bar); centred hero copy; cards laid out in rails; chapter numbers;
"scroll" cues.

**Nav, hero, close:**
- Nav = the ribbon. Ten monogrammed dots for ten teammates in ten IANA zones. Each dot is
  a jump-to-that-hour link with an accessible label.
- Hero = the ribbon at 04:30, before anything has happened. Silence. Copy fades in on the
  next screen.
- Close = the ribbon at 23:30, the day complete. The CTA is a single input slotted into
  the far-right of the ribbon, styled like a teammate slot — the reader adds themselves
  to the day.

**Leans on:** `--sc-p` (or its equivalent per-page CSS variable) driven live SVG; copy
windows (fade-in / hold / fade-out) synced to hours; deterministic per-teammate state
transitions (asleep → about-to-open → open → checking-in → done).

**Bans (reiterated):** every act device, `flow`, `pan`, hard cuts, video, `src`
swapping, dashboard-style app chrome.

**Why not the eight defined grammars:**
- *Filmic one-shot*: bans nothing structural — the brief needs strong structural bans to
  hold the concept together, otherwise the ribbon becomes decoration under a normal
  scroll-page.
- *Chaptered editorial*: the brief explicitly says "sections are hours of that day, not
  chapters", and demands no page-turn feeling.
- *Live surface*: closest fit but wants full app chrome (sidebar / tab strip / status
  bar) and forbids a real headline moment. The brief needs "Standups that respect sleep"
  to arrive as a display-type moment above the ribbon.
- *Continuous world (worldflight)*: requires `data-sc-mode="worldflight"` with video legs
  that crossfade at seam frames. Brief is CSS/SVG only — there are no clips, so there is
  nothing to seam.
- *Typographic poster*: type is a supporting element here, not the imagery. The ribbon is
  the imagery, and it isn't type.
- *Gallery / catalog*: no collection. One team, one day.
- *Split stage*: no comparison. The pitch isn't "async vs sync"; the pitch is "watch a
  day pass".
- *Rhythmic cutlist*: bans dwell. The peak (the day sweep) is a long held wide shot —
  the opposite of a cut every second.

## Signature move

**The 24-hour team ribbon.** A persistent horizontal ribbon of ten teammates across ten
IANA zones (Auckland, Sydney, Tokyo, Bangalore, Berlin, Lagos, London, São Paulo, New
York, Los Angeles). Scroll scrubs a real day. The sun-marker sweeps left→right along the
top of the ribbon. Each teammate's dot goes through five states, deterministically, based
on that teammate's local hour at the current scroll-time:

| State | When (local) | Visual |
|---|---|---|
| asleep | 22:00 – 07:00 | dim outline, monogram at 15% alpha |
| about-to-open | 07:00 – 08:00 | outline warms to amber |
| window open | 08:00 – 11:00 | filled emerald ring; monogram at full alpha |
| checking-in | first ~3 min of window | inner ring pulses |
| done | after they submit (deterministic per teammate) | small tick, ring dims to soft-green |

Hovering a teammate reveals a tooltip with their name, IANA zone, current local time (a
function of scroll), and window state. Clicking jumps the scroll to the hour when that
teammate's window opens.

The digest panel in the top-right assembles line-by-line as evening progresses:
teammates who submitted earlier appear as ticked entries by 18:00; blockers surface at
19:00; final "5/5 checked in" state locks in by 20:00.

**Why this is not just a kit device:** no scroll-craft kit provides a live per-scroll
IANA-timezone state machine over a persistent trace, driving both product demo and
navigation. It's not `pan` at a different width. It's not `scrub` on a rail. It's a real
computed simulation of a distributed team's day.

## Fingerprint gate

Registry is empty (first build). All 6 dimensions differ trivially from any future row.
This build's row (to be appended post-verify):

| Dim | Value |
|---|---|
| Grammar | Living ribbon (new) |
| Nav treatment | The ribbon itself; ten teammate dots as jump-links |
| Hero device | Ribbon at 04:30, silence, no headline for one screen |
| Act-sequence shape | No acts. 7 hour-windows over a single continuous scroll track |
| Close pattern | CTA input slotted into the ribbon as a teammate slot |
| Signature move | 24-hour team ribbon: scroll = time, per-teammate deterministic state, digest self-assembles |
| World | Dark editorial-minimal + emerald + soft amber sun. Serif display for peak + headline; sans everywhere else. |
| Port | Next.js `src/app/page.tsx` (replaces existing landing) |

## Score (hour-windows, not acts)

Each row maps a range of scroll progress (as a fraction of total track) to an hour range
and a feeling. This is the whole score — the ribbon is present and live the entire time,
so what "changes" is the copy layer and the ribbon's own driven state.

| Scroll p | Hours | Feeling | Copy layer | Ribbon state |
|---|---|---|---|---|
| 0.00–0.08 | 04:00–06:00 | Curiosity | *(silence)* | pre-dawn: all dim, one Auckland dot faintly warm |
| 0.08–0.20 | 06:00–08:00 | Recognition | headline resolves: **"Standups that respect sleep."** | sun touches left edge; Auckland, Sydney light |
| 0.20–0.36 | 09:00–11:00 | Relief | one card floats above the ribbon: recording → note → bullet summary | Tokyo checks in; Bangalore opens |
| 0.36–0.52 | 13:00–15:00 | Calm | occurrence view: 5 summaries stack, blocker highlighted | Berlin, Lagos, London active |
| 0.52–0.80 | 17:00–19:00 | **PEAK — belonging** | *(minimal copy)*: one line above, one line below the sweep | full day-sweep; sun crosses; digest assembles in the corner |
| 0.80–0.92 | 20:00–22:00 | Trust | plain lines: self-host · AGPL-3.0 · encrypted · RLS · no third-party analytics | ribbon settles; São Paulo, NY, LA finishing |
| 0.92–1.00 | 23:00–24:00 | Resolve | "Start your team's morning." | night: only the CTA slot glows |

The peak span is `0.28` (`0.52 → 0.80`) — larger than any other by a visible margin. The
act before it (13–15) is quieter (only tick-marks and a small blocker chip), so the peak
arrives with room to breathe.

## Hard-rule check (from SKILL.md)

- ✅ No clay diorama. World is dark editorial with subtle SVG geometry, no illustration
  style at all.
- ✅ No "scroll" cue / arrow / mouse icon.
- ✅ No `01 / 06` counters (there are hours, but they're on the ribbon as tick-marks, not
  as section indices).
- ✅ At most one eyebrow per three sections — there are no eyebrows.
- ✅ No em dashes visible in the rendered copy.
- ✅ Copy anchor varies: hero lead, digest trail, peak split (above + below), CTA lead.
- ✅ No two adjacent hour-windows use the same feeling.
- ✅ One engineered peak (17–19).
- ✅ Close resolves and holds — CTA is embedded in the ribbon at rest, not a fade-out.
- ✅ Signature move is bespoke and coded in the page, not a kit parameter.
- ✅ CSS/SVG only, no fake dashboards, no baked-in text on any image (all real HTML).
- ✅ `transform` + `opacity` only, no `top` / `left` animations.
- ✅ No autoplay audio, no clips at all.

## Assets

None. Everything is HTML / CSS / SVG / small inline JS.

- Ribbon: SVG `<g>` per teammate; monogram in a `<circle>` + `<text>`.
- Sun: single `<circle>` with a radial-gradient fill, `translateX` driven by scroll
  progress.
- Digest panel: HTML `<ol>` with `visibility` and `opacity` transitions driven from
  scroll bins.
- Phone-card transform (relief moment): three stacked `<div>`s cross-fading.
- Occurrence view (calm): five summary rows composed of typography.
- Tick-marks / hour axis: SVG.

## Deliverable

The page is real Next.js: `src/app/page.tsx`. Signed-in users still redirect to their
team (behaviour preserved). Signed-out users see the ribbon page. Zero new dependencies.
