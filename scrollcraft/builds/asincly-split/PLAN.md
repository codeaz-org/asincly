# PLAN — Asincly v2 (Split stage)

## Grammar: Split stage (uniqueness.md §2.7)

Two columns held in tension for the whole page, resolved by scroll. The
comparison IS the product: sync meeting vs async digest.

**Why the other seven lost:**
- *Filmic one-shot*: carries the burden of proof and offers nothing the split
  doesn't do better here; the pitch is inherently two-sided, not linear.
- *Chaptered editorial*: Asincly's argument is a live comparison, not long-form
  prose; page-turns would defuse the tension.
- *Live surface*: closest rival, but it forbids the display-type moments the
  close needs, and the previous build already owns "the product surface as
  hero" territory (ribbon = product surface). Its honesty rule is imported:
  every panel computes from data.
- *Continuous world*: no geography, no video legs, requires worldflight.
- *Typographic poster*: the argument needs the two operable surfaces, not type
  alone.
- *Gallery/catalog*: no collection; one argument.
- *Living ribbon* (own prior grammar): taken, by the registry.
- *Rhythmic cutlist*: the peak is a long held collapse, the opposite of cuts.

**Grammar bans honored:** no full-bleed before the resolve, no centred copy, no
corner-anchored hero, no symmetric close, no pan/spotlight/magnet/drift, zero
scrub. Both columns carry real content the whole way. The divider is the chrome.

## Signature move: the tug-of-war divider

The divider is nav, scorekeeper and rope. Scroll drives its position (the state
of the argument). The visitor can grab it and drag; the page resists with a
spring and snaps back to the argument's position on release. Beats passed stamp
tick marks on the rail. Not a kit device; coded in the page.

## Fingerprint gate (vs the one existing row, "asincly")

| Dim | asincly (Living ribbon) | this build | differs |
|---|---|---|---|
| Grammar | Living ribbon | Split stage | ✓ |
| Nav | ribbon dots as jump links | the divider: labels, stamps, drag handle | ✓ |
| Hero | ribbon at 04:30, silence, no headline | 50/50 split, two opposed headlines at once | ✓ |
| Act shape | 7 hour-windows, peak 0.28 | 7 paired beats on one pinned dual stage, peak 0.26 collapse | ✓ |
| Close | CTA input slotted into ribbon | collapse; CTA in winning column; loser as tombstone sliver | ✓ |
| Signature | 24-hour team ribbon | tug-of-war divider | ✓ (free) |

6/6 differ against the only row. Gate passes.

## World

- Left ground: cold fluorescent near-white (oklch ~0.94, cool). Ink: cool
  near-black. Reads as office.
- Right ground: warm off-black (oklch ~0.16, warm). Ink: warm bone. Reads as
  pre-dawn.
- One accent hue (sunrise amber ~oklch hue 60), two lightnesses keyed per
  ground (taste.md's sanctioned two-stop for hard light/dark splits).
- Type: Geist (display + text), Geist Mono (timers, labels, math). Two families.

## Mechanics

- One sticky 100dvh stage + ~10x100vh spacer track. rAF-lerped progress p.
- Both panes are full-size layers clipped at the divider (`clip-path: inset`),
  driven by `--dx`. Desktop: vertical divider. Mobile (<860px): horizontal
  divider, top=sync, bottom=async; same p, same beats, distinct composition.
- Beat content cross-fades inside each pane on p windows (plateau copy).
- Divider dx by p: 50 → 50 → 50 → 45 → 45 → sweep to ~3 → 3 (vw%).
- Honesty: TEAM array + arithmetic drives calendar rows, timer, person-minutes,
  digest. Panels labelled "demo team · 10 people". No invented stats.
- Reduced motion: p still maps states; transitions near-instant; drag disabled.
- Port: `src/components/split-landing.tsx`, mounted from `src/app/page.tsx`
  (auth redirect preserved). Zero new dependencies.

## Length

~10 viewport-heights, 7 beats. Outside the prior build's band and the 13.6-13.8
fingerprinted band.
