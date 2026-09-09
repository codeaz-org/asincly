# Fingerprints

Every site you build with **scroll-craft** gets one row here, appended after it
ships. The registry exists so your next build can prove it is a different page
rather than a re-skin of one you already made.

This file is **yours**. It starts empty on purpose: the gate is about not
repeating *yourself*, so it has nothing to say until you have built something.

The rules and the gate live in the skill's
`references/uniqueness.md`. Short version:

**A new build must differ from EVERY row below on at least 4 of the 6
dimensions.** Four against each row individually, not four on average across the
table. If a planned build fails, change the plan. Never edit a row to make room
for it.

The six dimensions are: **grammar**, **nav treatment**, **hero device**,
**act-sequence shape**, **close pattern**, **signature move**.

Dimension 6 is free, because a signature move is unique by definition. So the
gate really asks for three more out of the remaining five, and a build that
changes only grammar and world will fail it.

---

## The registry

| Build | Grammar | Nav treatment | Hero device | Act-sequence shape | Close pattern | Signature move | World | Port |
|---|---|---|---|---|---|---|---|---|
| asincly | **Living ribbon** *(new grammar)* | The ribbon itself — 10 monogrammed teammate dots as jump-links, sun sweeps left→right on scroll | Ribbon at 04:30, silence, no headline for one screen | No acts — 7 hour-windows over one continuous scroll track (span 0.08 / 0.12 / 0.16 / 0.16 / **0.28 peak** / 0.12 / 0.08), sticky copy above a fixed ribbon | CTA input slotted into the ribbon as a "+" teammate slot; ribbon rests at 23:30, all 10 dots done | 24-hour team ribbon: scroll = time, per-teammate deterministic 5-state machine (asleep / about / open / checking / done), digest self-assembles line by line as evening arrives | Dark editorial-minimal + emerald accent + amber sun; serif italic for peak/close, sans elsewhere | Next.js `src/app/page.tsx` (replaced marketing landing) |

---

## What is taken

Add a bullet here whenever a build claims something a later build should avoid
reusing: a grammar, a nav treatment, a close pattern, a signature move, an
act-count-and-length band. The shared columns are what the next build inherits
as a constraint, so writing them down is the whole point.

- **Grammar "Living ribbon"** — one fixed horizontal ribbon is the whole
  world; scroll is time; per-scroll deterministic state; no acts, no seams,
  no video clips. Future builds using this grammar will need a strong
  reason (see uniqueness.md § 2 "burden of proof").
- **Signature move "24-hour team ribbon"** — persistent trace-rail-as-nav
  with per-teammate live state, plus digest self-assembly.
- **Close pattern "CTA embedded as a teammate slot"** — the input reads as
  the reader adding themselves to a horizontal ribbon.
- **Act shape** — 7 hour-windows over a single scroll track, peak span
  0.28 (largest by margin), sticky copy over a fixed ribbon canvas.

---

## Appending a row

After shipping, add one line to the table and one bullet to **What is taken** if
the build claimed something new. Fill every column. Say what the build shares
with existing rows.

Rows are append-only. A build that has been superseded stays in the table,
because the space it occupies is still occupied.

---

## Worked example

The skill's author kept a registry of twelve builds across eight page grammars.
If you want to see what a filled-in table looks like, and which shapes tend to
collide, read `EXAMPLES.md` in the scroll-craft repository. Treat it as
illustration only: those rows are somebody else's builds and they do **not**
constrain yours.
