"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Logo } from "@/components/logo";
import { SOURCE_URL } from "@/lib/source";

// ── Split stage ───────────────────────────────────────────────────────────────
// Two worlds held in tension for the whole page: the 09:30 meeting (cold,
// fluorescent, left) and the async morning (warm, pre-dawn, right). Scroll
// advances the same workday on both sides; the divider is the chrome, the
// scorekeeper and a rope the visitor can tug. The page resolves when the
// divider collapses and the morning takes the full screen.
//
// Everything on both panes computes from the demo-team array below and is
// labelled as a demo scenario. No invented statistics: every number shown is
// arithmetic on the stated scenario (10 people, 25 minutes, UTC offsets).

type Mate = { mono: string; name: string; city: string; off: number; role: string; line?: string; blocker?: string };

const TEAM: Mate[] = [
  { mono: "MK", name: "Maia Kaui",      city: "Auckland",  off: 13,  role: "Design",  line: "Shipped the tokens rebase" },
  { mono: "JW", name: "Jia Wen",        city: "Sydney",    off: 11,  role: "Backend", line: "Ingest queue migrated" },
  { mono: "HT", name: "Hiroshi Tanaka", city: "Tokyo",     off: 9,   role: "Infra",   line: "Rotated the CDN certs" },
  { mono: "PR", name: "Priya Rao",      city: "Bangalore", off: 5.5, role: "Data",    line: "Weekly rollup rebuilt" },
  { mono: "LK", name: "Lena Krüger",    city: "Berlin",    off: 1,   role: "Web",     blocker: "Waiting on staging keys" },
  { mono: "OA", name: "Oluwa Adeyemi",  city: "Lagos",     off: 1,   role: "Mobile",  line: "Offline sync landed" },
  { mono: "SM", name: "Sam Miller",     city: "London",    off: 0,   role: "Product", line: "Talked to 3 pilot teams" },
  { mono: "RC", name: "Rafael Costa",   city: "São Paulo", off: -3,  role: "Growth",  line: "Onboarding email pass" },
  { mono: "AS", name: "Amelia Silva",   city: "New York",  off: -4,  role: "SRE",     line: "Rotated the R2 creds" },
  { mono: "JG", name: "Jordan García",  city: "LA",        off: -7,  role: "AI",      line: "Prompt evals green" },
];

// The meeting in the demo: 09:30 in New York (UTC-4) → 13:30 UTC.
const MEETING_UTC = 13.5;

function localSlot(off: number): { time: string; nextDay: boolean; awful: boolean } {
  let h = MEETING_UTC + off;
  let nextDay = false;
  if (h >= 24) { h -= 24; nextDay = true; }
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  const awful = h < 7 || h >= 21;
  return { time: `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`, nextDay, awful };
}

// ── Scroll math ───────────────────────────────────────────────────────────────

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeIO = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

// Visibility window with soft ramps at both edges.
function win(p: number, a: number, b: number, r = 0.025): number {
  if (p <= a || p >= b) return 0;
  return Math.min(clamp01((p - a) / r), clamp01((b - p) / r), 1);
}

// Divider position (percent from the left / top) as a function of progress.
function dxFor(p: number): number {
  if (p < 0.42) return 50;
  if (p < 0.5) return 50 - 5 * easeIO((p - 0.42) / 0.08);
  if (p < 0.6) return 45;
  if (p < 0.78) return 45 - 42 * easeIO((p - 0.6) / 0.18);
  return 3;
}

const BEATS = [0.0, 0.1, 0.26, 0.42, 0.56, 0.6, 0.86];

// ── Page ─────────────────────────────────────────────────────────────────────

export function SplitLanding() {
  const trackRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [p, setP] = useState(0);
  const [reduced, setReduced] = useState(false);

  // Drag state for the tug-of-war divider (refs: read inside rAF).
  const drag = useRef({ held: false, offset: 0, lastPos: 0, lastPosY: 0 });

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onMq = () => setReduced(mq.matches);
    onMq();
    mq.addEventListener("change", onMq);

    let target = 0;
    let shown = -1;
    let raf = 0;

    const measure = () => {
      const el = trackRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const total = r.height - window.innerHeight;
      target = total > 0 ? clamp01(-r.top / total) : 0;
    };

    const frame = () => {
      raf = requestAnimationFrame(frame);
      const instant = mq.matches;
      const next = instant ? target : shown < 0 ? target : shown + (target - shown) * 0.16;
      // Spring the drag offset home when released.
      if (!drag.current.held && Math.abs(drag.current.offset) > 0.01) {
        drag.current.offset *= 0.86;
      } else if (!drag.current.held) {
        drag.current.offset = 0;
      }
      if (Math.abs(next - (shown < 0 ? -1 : shown)) > 0.0004 || drag.current.offset !== 0 || shown < 0) {
        shown = next;
        setP(next);
        const stage = stageRef.current;
        if (stage) {
          const c = next < 0.6 ? 0 : easeIO(clamp01((next - 0.6) / 0.18));
          // On phones the sync half exits completely (no tombstone sliver up top,
          // where it would collide with the corner chrome).
          const vertical = window.innerWidth < 860;
          const floor = vertical ? 3 - 3 * c : 3;
          const dx = Math.min(94, Math.max(floor, dxFor(next) - (vertical ? 3 * c : 0) + drag.current.offset));
          stage.style.setProperty("--dx", String(dx));
          stage.style.setProperty("--c", String(c));
          stage.style.setProperty("--p", String(next));
        }
      }
    };

    measure();
    const onScroll = () => measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      mq.removeEventListener("change", onMq);
    };
  }, []);

  // ── Tug-of-war handlers ──
  const onHandleDown = (e: React.PointerEvent) => {
    if (reduced) return;
    drag.current.held = true;
    drag.current.lastPos = e.clientX;
    drag.current.lastPosY = e.clientY;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onHandleMove = (e: React.PointerEvent) => {
    if (!drag.current.held || !stageRef.current) return;
    const r = stageRef.current.getBoundingClientRect();
    const vertical = window.matchMedia("(max-width: 859px)").matches;
    const deltaPct = vertical
      ? ((e.clientY - drag.current.lastPosY) / r.height) * 100
      : ((e.clientX - drag.current.lastPos) / r.width) * 100;
    // The rope resists: movement costs more the further you pull.
    drag.current.offset += deltaPct * (1 - Math.min(0.75, Math.abs(drag.current.offset) / 40));
    drag.current.lastPos = e.clientX;
    drag.current.lastPosY = e.clientY;
  };
  const onHandleUp = () => {
    drag.current.held = false;
  };

  // ── Derived demo state ──
  const meetMin = 25 * clamp01((p - 0.26) / 0.16);
  const mm = Math.floor(meetMin);
  const ss = String(Math.floor((meetMin - mm) * 60)).padStart(2, "0");
  const heldMin = Math.max(mm, 1) * TEAM.length;
  const beatsPassed = BEATS.filter((b) => p >= b + 0.02).length;
  const collapsed = p >= 0.74;

  return (
    <div className="split" ref={trackRef}>
      <style>{css}</style>

      <div className="stage" ref={stageRef}>
        {/* ── Sync pane: the meeting world (cold, light) ── */}
        <section className="pane pane--sync" aria-label="The synchronous standup">
          <div className="pane__center pane__center--sync">
            {/* Hero */}
            <div className="panel" style={vis(win(p, -0.05, 0.105), seg(p, -0.05, 0.105))}>
              <p className="kicker kicker--sync">every day · everyone · live</p>
              <h2 className="display display--sync">The standup at&nbsp;09:30.</h2>
              <p className="sub sub--sync">
                Ten people, one calendar slot, five mornings a week. Somebody is
                always awake for it at the wrong time.
              </p>
            </div>

            {/* Beat 2: the calendar math */}
            <div className="panel" style={vis(win(p, 0.105, 0.26), seg(p, 0.105, 0.26))}>
              <p className="label label--sync">one slot · ten local times</p>
              <ul className="cal">
                {[TEAM[8], TEAM[6], TEAM[4], TEAM[3], TEAM[2], TEAM[1], TEAM[0]].map((t) => {
                  const s = localSlot(t.off);
                  return (
                    <li key={t.mono} className={`cal__row${s.awful ? " cal__row--awful" : ""}`}>
                      <span className="cal__city">{t.city}</span>
                      <span className="cal__dots" aria-hidden />
                      <span className="cal__time">
                        {s.time}
                        {s.nextDay && <em>&nbsp;+1 day</em>}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p className="fine fine--sync">demo team of ten · one 09:30 New York slot</p>
            </div>

            {/* Beat 3: the meeting runs */}
            <div className="panel" style={vis(win(p, 0.26, 0.42), seg(p, 0.26, 0.42))}>
              <p className="label label--sync">standup · in progress</p>
              <p className="timer" aria-hidden>{String(mm).padStart(2, "0")}:{ss}</p>
              <div className="room" aria-hidden>
                {TEAM.map((t, i) => (
                  <span key={t.mono} className={`room__dot${i === Math.min(9, Math.floor(meetMin / 2.5)) ? " room__dot--talking" : ""}`}>
                    {t.mono}
                  </span>
                ))}
              </div>
              <p className="sum sum--sync">1 talking. 9 waiting for their turn.</p>
              <p className="math">
                {Math.max(mm, 1)} min × {TEAM.length} people = <strong>{heldMin} person-minutes held</strong>
              </p>
            </div>

            {/* Beat 4: what remains */}
            <div className="panel" style={vis(win(p, 0.42, 0.56), seg(p, 0.42, 0.56))}>
              <p className="label label--sync">two hours later</p>
              <div className="chat">
                <p className="chat__line"><span>rafael</span> anyone have the notes from standup?</p>
                <p className="chat__line"><span>amelia</span> wait, what did Sam say about the pilots?</p>
                <p className="chat__line chat__line--dim"><span>sam</span> i&rsquo;ll re-explain on a call</p>
              </div>
              <p className="sum sum--sync">The meeting happened. The information didn&rsquo;t.</p>
            </div>
          </div>

          {/* The tombstone: what's left of sync after the collapse */}
          <p className="sliver" style={{ opacity: collapsed ? 1 : 0 }} aria-hidden>
            the meeting
          </p>
        </section>

        {/* ── Async pane: the morning world (warm, dark) ── */}
        <section className="pane pane--async" aria-label="The asynchronous standup">
          <div className="pane__center pane__center--async">
            {/* Hero */}
            <div className="panel" style={vis(win(p, -0.05, 0.105), seg(p, -0.05, 0.105))}>
              <p className="kicker kicker--async">asincly · async standups</p>
              <h1 className="display display--async">The standup whenever you&nbsp;wake.</h1>
              <p className="sub sub--async">
                Two minutes in your own morning. AI writes the digest. Nobody
                waits for anybody.
              </p>
            </div>

            {/* Beat 2: one check-in */}
            <div className="panel" style={vis(win(p, 0.105, 0.26), seg(p, 0.105, 0.26))}>
              <p className="label label--async">auckland · 07:40 her time</p>
              <div className="card">
                <div className="card__head">
                  <span className="card__mono">MK</span>
                  <span className="card__name">Maia Kaui <em>Design</em></span>
                  <span className="card__rec" aria-hidden><i />1:42</span>
                </div>
                <div className="card__wave" aria-hidden />
                <p className="card__note">
                  &ldquo;…tokens rebase is in, today I&rsquo;m on the empty
                  states, nothing blocking me.&rdquo;
                </p>
              </div>
              <p className="fine fine--async">recorded before the rest of the team woke up</p>
            </div>

            {/* Beat 3: the transform */}
            <div className="panel" style={vis(win(p, 0.26, 0.42), seg(p, 0.26, 0.42))}>
              <p className="label label--async">summary · written by ai</p>
              <ul className="bullets">
                <li>→ Shipped the tokens rebase</li>
                <li>→ Today: empty states pass</li>
                <li className="bullets__ok">No blockers</li>
              </ul>
              <p className="sum sum--async">Her two minutes became ten seconds of reading.</p>
            </div>

            {/* Beat 4: the digest */}
            <div className="panel" style={vis(win(p, 0.42, 0.56), seg(p, 0.42, 0.56))}>
              <p className="label label--async">today · the digest</p>
              <ol className="digest">
                {[TEAM[0], TEAM[4], TEAM[6], TEAM[8], TEAM[9]].map((t) => (
                  <li key={t.mono} className="digest__row">
                    <span className="digest__mono">{t.mono}</span>
                    <span className="digest__body">
                      <span className="digest__name">{t.name}</span>
                      {t.blocker ? (
                        <span className="digest__blocker">! {t.blocker}</span>
                      ) : (
                        <span className="digest__line">{t.line}</span>
                      )}
                    </span>
                  </li>
                ))}
              </ol>
              <p className="sum sum--async">Every update, one screen. Blockers routed to whoever can unblock them.</p>
            </div>

            {/* PEAK line, arrives as the async world takes the width */}
            <div className="panel panel--peak" style={vis(win(p, 0.66, 0.85, 0.04), seg(p, 0.66, 0.85))}>
              <p className="peakline">No meeting.<br />Nothing missed.</p>
            </div>

            {/* Close */}
            <div className="panel panel--close" style={vis(Math.min(1, clamp01((p - 0.865) / 0.035)), 0.5 + Math.min(0.5, seg(p, 0.865, 1) * 0.5) - 0.5)}>
              <h2 className="display display--close">Kill the meeting.<br />Keep the standup.</h2>
              <p className="sub sub--async">
                Set up a team in one minute. Invite by email. First digest
                tomorrow morning.
              </p>
              <Link href="/sign-in" className="cta">Start your team&rsquo;s morning →</Link>
              <p className="trust">
                <a href={SOURCE_URL} target="_blank" rel="noopener noreferrer">open source (AGPL-3.0)</a> · self-hostable · encrypted at rest
              </p>
              <p className="legal">
                <Link href="/legal/terms">Terms</Link>
                <Link href="/legal/privacy">Privacy</Link>
                <Link href="/legal/security">Security</Link>
              </p>
            </div>
          </div>
        </section>

        {/* ── The divider: chrome, scorekeeper, rope ── */}
        <div className="rail" aria-hidden>
          <div className="rail__line" />
          <div className="rail__fill" />
          <div className="rail__runner"><span className="rail__pos" /></div>
          <div className="rail__stamps">
            {BEATS.map((b, i) => (
              <span key={b} className={`rail__stamp${i < beatsPassed ? " rail__stamp--hit" : ""}`} />
            ))}
          </div>
          {!reduced && (
            <button
              type="button"
              className="rail__grip"
              tabIndex={-1}
              aria-hidden
              onPointerDown={onHandleDown}
              onPointerMove={onHandleMove}
              onPointerUp={onHandleUp}
              onPointerCancel={onHandleUp}
            >
              <i /><i /><i />
            </button>
          )}
        </div>

        {/* ── Corner chrome (no bar) ── */}
        <div className="chrome">
          <span className="chrome__brand">
            <span className="chrome__brandcold" style={{ opacity: `calc(1 - var(--c, 0))` }}>
              <Logo size={22} className="text-sm" />
            </span>
            <span className="chrome__brandwarm">
              <Logo size={22} className="text-sm" />
            </span>
          </span>
          <span className="chrome__links">
            <Link href="/sign-in" className="chrome__signin">Sign in</Link>
            <Link href="/sign-in" className="chrome__start">Start free</Link>
          </span>
        </div>
      </div>
    </div>
  );
}

// v: visibility 0..1 (ramped window). u: raw progress through the window,
// used for a constant slow drift so the page visibly answers every scroll
// tick even in the middle of a copy plateau.
function vis(v: number, u = 0.5): React.CSSProperties {
  return {
    opacity: v,
    transform: `translateY(${(1 - v) * 14 + (0.5 - clamp01(u)) * 26}px)`,
    visibility: v <= 0 ? "hidden" : "visible",
    pointerEvents: v > 0.5 ? "auto" : "none",
  };
}

const seg = (p: number, a: number, b: number) => (p - a) / (b - a);

// ── Styles ───────────────────────────────────────────────────────────────────

const css = `
.split { height: 1000vh; position: relative;
  --cold-g: oklch(0.94 0.006 240); --cold-ink: oklch(0.22 0.015 250);
  --cold-soft: oklch(0.45 0.02 250); --cold-line: oklch(0.22 0.015 250 / 0.14);
  --warm-g: oklch(0.17 0.012 60); --warm-ink: oklch(0.94 0.02 75);
  --warm-soft: oklch(0.68 0.03 70); --warm-line: oklch(0.94 0.02 75 / 0.12);
  --amber: oklch(0.78 0.15 60); --amber-deep: oklch(0.50 0.12 60);
  font-family: var(--font-geist-sans, system-ui, sans-serif);
}
.split ::selection { background: oklch(0.78 0.15 60 / 0.35); }

.stage { position: sticky; top: 0; height: 100dvh; overflow: hidden; --dx: 50; --c: 0; }

/* ── Panes ── */
.pane { position: absolute; inset: 0; }
.pane--sync {
  background:
    radial-gradient(ellipse 120% 90% at 20% 0%, oklch(0.97 0.004 240), transparent 55%),
    var(--cold-g);
  color: var(--cold-ink);
  clip-path: inset(0 calc((100 - var(--dx)) * 1%) 0 0);
}
.pane--async {
  background:
    radial-gradient(ellipse 130% 100% at 78% 108%, oklch(0.30 0.06 50 / 0.55), transparent 60%),
    radial-gradient(ellipse 90% 60% at 85% -8%, oklch(0.24 0.03 70 / 0.6), transparent 55%),
    var(--warm-g);
  color: var(--warm-ink);
  clip-path: inset(0 0 0 calc(var(--dx) * 1%));
}

.pane__center {
  position: absolute; inset: 0;
  display: grid; place-items: center;
}
.pane__center--sync  { transform: translateX(-25%); }
.pane__center--async { transform: translateX(calc(25% * (1 - var(--c)))); }
/* The sync world crumples as it loses */
.pane__center--sync > .panel {
  transform-origin: 20% 80%;
  rotate: calc(var(--c) * -3deg);
  scale: calc(1 - var(--c) * 0.15);
}

.panel {
  grid-area: 1 / 1;
  width: min(560px, 78vw);
  max-width: 42rem;
  transition: opacity 80ms linear;
}

/* ── Type ── */
.kicker {
  font-family: var(--font-geist-mono, ui-monospace, monospace);
  font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase;
  margin: 0 0 18px;
}
.kicker--sync  { color: var(--cold-soft); }
.kicker--async { color: var(--amber); }

.display {
  font-size: clamp(2rem, 4.4vw, 4.2rem);
  line-height: 1.02; letter-spacing: -0.025em; font-weight: 650;
  margin: 0 0 20px; text-wrap: balance;
}
.display--sync  { color: var(--cold-ink); }
.display--async { color: var(--warm-ink); letter-spacing: -0.02em; }
.display--close { font-size: clamp(2.2rem, 4.8vw, 4.6rem); }

.sub { font-size: clamp(1rem, 1.25vw, 1.15rem); line-height: 1.6; margin: 0; max-width: 34rem; text-wrap: pretty; }
.sub--sync  { color: var(--cold-soft); }
.sub--async { color: var(--warm-soft); line-height: 1.65; letter-spacing: 0.004em; }

.label {
  font-family: var(--font-geist-mono, ui-monospace, monospace);
  font-size: 10.5px; letter-spacing: 0.16em; text-transform: uppercase;
  margin: 0 0 16px;
}
.label--sync  { color: var(--cold-soft); }
.label--async { color: var(--amber); }

.sum { font-size: clamp(1.05rem, 1.4vw, 1.3rem); font-weight: 550; letter-spacing: -0.01em; margin: 22px 0 0; }
.sum--sync  { color: var(--cold-ink); }
.sum--async { color: var(--warm-ink); }

.fine {
  font-family: var(--font-geist-mono, ui-monospace, monospace);
  font-size: 10px; letter-spacing: 0.08em; margin: 14px 0 0;
}
.fine--sync  { color: oklch(0.45 0.02 250 / 0.8); }
.fine--async { color: oklch(0.68 0.03 70 / 0.8); }

/* ── Sync panels ── */
.cal { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.cal__row {
  display: flex; align-items: baseline; gap: 12px;
  font-size: 14.5px; color: var(--cold-ink);
}
.cal__city { min-width: 7.5em; }
.cal__dots { flex: 1; border-bottom: 1px dotted var(--cold-line); transform: translateY(-3px); }
.cal__time { font-family: var(--font-geist-mono, ui-monospace, monospace); font-size: 13.5px; font-variant-numeric: tabular-nums; }
.cal__time em { font-style: normal; font-size: 10px; letter-spacing: 0.06em; color: var(--amber-deep); }
.cal__row--awful .cal__time { color: var(--amber-deep); font-weight: 700; }
.cal__row--awful .cal__city { font-weight: 600; }

.timer {
  font-family: var(--font-geist-mono, ui-monospace, monospace);
  font-size: clamp(3rem, 6vw, 5rem); line-height: 1; letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums; margin: 0 0 22px; color: var(--cold-ink);
}
.room { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 4px; }
.room__dot {
  width: 34px; height: 34px; border-radius: 999px;
  display: grid; place-items: center;
  border: 1px solid var(--cold-line);
  font-size: 9px; font-weight: 600; color: var(--cold-soft);
  background: oklch(1 0 0 / 0.5);
}
.room__dot--talking {
  border-color: var(--amber-deep); color: var(--amber-deep);
  box-shadow: 0 0 0 3px oklch(0.50 0.12 60 / 0.15);
}
.math {
  font-family: var(--font-geist-mono, ui-monospace, monospace);
  font-size: 12.5px; color: var(--cold-soft); margin: 18px 0 0;
  font-variant-numeric: tabular-nums;
}
.math strong { color: var(--cold-ink); font-weight: 700; }

.chat { display: flex; flex-direction: column; gap: 10px; }
.chat__line {
  margin: 0; font-size: 14.5px; color: var(--cold-ink); line-height: 1.5;
  padding: 10px 14px; border: 1px solid var(--cold-line); border-radius: 10px;
  background: oklch(1 0 0 / 0.55); width: fit-content; max-width: 100%;
}
.chat__line span {
  font-family: var(--font-geist-mono, ui-monospace, monospace);
  font-size: 10.5px; color: var(--cold-soft); margin-right: 8px;
}
.chat__line--dim { opacity: 0.6; }

/* The tombstone label on the collapsed sliver */
.sliver {
  position: absolute; top: 50%; left: 0;
  transform: rotate(180deg) translateY(50%);
  writing-mode: vertical-rl;
  font-family: var(--font-geist-mono, ui-monospace, monospace);
  font-size: 10px; letter-spacing: 0.3em; text-transform: uppercase;
  color: var(--cold-soft); margin: 0; padding: 0 0.4vw;
  transition: opacity 400ms 200ms;
  white-space: nowrap;
}

/* ── Async panels ── */
.card {
  border: 1px solid var(--warm-line); border-radius: 14px;
  background: oklch(0.21 0.015 60 / 0.8);
  box-shadow: 0 18px 40px -18px oklch(0 0 0 / 0.5), inset 0 1px 0 oklch(0.94 0.02 75 / 0.06);
  padding: 16px 18px;
}
.card__head { display: flex; align-items: center; gap: 10px; }
.card__mono {
  width: 30px; height: 30px; border-radius: 999px; display: grid; place-items: center;
  border: 1px solid oklch(0.78 0.15 60 / 0.5); color: var(--amber);
  font-size: 10px; font-weight: 650; flex-shrink: 0;
}
.card__name { font-size: 14px; color: var(--warm-ink); flex: 1; }
.card__name em { font-style: normal; font-size: 11px; color: var(--warm-soft); margin-left: 6px; }
.card__rec {
  font-family: var(--font-geist-mono, ui-monospace, monospace);
  font-size: 11px; color: var(--warm-soft); display: inline-flex; align-items: center; gap: 6px;
  font-variant-numeric: tabular-nums;
}
.card__rec i { width: 7px; height: 7px; border-radius: 999px; background: oklch(0.65 0.2 25); animation: rec 1.4s ease-in-out infinite; }
@keyframes rec { 0%,100% { opacity: 1; } 50% { opacity: 0.35; } }
.card__wave {
  height: 40px; margin: 14px 0; border-radius: 5px;
  background: repeating-linear-gradient(90deg, oklch(0.78 0.15 60 / 0.45) 0 2px, transparent 2px 6px);
  mask-image: linear-gradient(90deg, transparent, black 12%, black 88%, transparent);
}
.card__note { font-size: 13.5px; font-style: italic; line-height: 1.6; color: var(--warm-soft); margin: 0; }

.bullets { list-style: none; margin: 0 0 4px; padding: 0; display: flex; flex-direction: column; gap: 12px; }
.bullets li { font-size: clamp(1rem, 1.3vw, 1.2rem); color: var(--warm-ink); }
.bullets__ok { color: var(--amber); }

.digest { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 13px; }
.digest__row { display: flex; gap: 11px; align-items: flex-start; }
.digest__mono {
  width: 24px; height: 24px; border-radius: 999px; flex-shrink: 0;
  display: grid; place-items: center;
  border: 1px solid oklch(0.78 0.15 60 / 0.4);
  font-size: 8.5px; font-weight: 650; color: var(--amber);
}
.digest__body { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.digest__name { font-size: 13.5px; color: var(--warm-ink); }
.digest__line { font-size: 12.5px; color: var(--warm-soft); }
.digest__blocker { font-size: 12.5px; color: oklch(0.78 0.14 40); }

.peakline {
  font-size: clamp(2.6rem, 5.6vw, 5.4rem);
  line-height: 1.04; letter-spacing: -0.028em; font-weight: 680;
  color: var(--warm-ink); margin: 0; text-wrap: balance;
}

.panel--close .cta {
  display: inline-flex; align-items: center;
  margin-top: 28px; padding: 14px 26px; border-radius: 12px;
  background: var(--amber); color: oklch(0.2 0.03 60);
  font-weight: 650; font-size: 15px; text-decoration: none;
  transition: transform 140ms cubic-bezier(0.23, 1, 0.32, 1), background 140ms;
  white-space: nowrap;
}
.panel--close .cta:hover { background: oklch(0.83 0.15 60); transform: translateY(-1px); }
.panel--close .cta:active { transform: translateY(1px) scale(0.98); }
.panel--close .cta:focus-visible { outline: 2px solid var(--amber); outline-offset: 3px; }
.trust a { color: inherit; text-decoration: underline; text-underline-offset: 3px; }
.trust {
  font-family: var(--font-geist-mono, ui-monospace, monospace);
  font-size: 11px; letter-spacing: 0.06em; color: var(--warm-soft); margin: 22px 0 0;
}
.legal { display: flex; gap: 18px; margin: 30px 0 0; font-size: 12px; }
.legal a { color: var(--warm-soft); text-decoration: none; }
.legal a:hover { color: var(--warm-ink); }
.legal a:focus-visible { outline: 2px solid var(--amber); outline-offset: 3px; border-radius: 3px; }

/* ── Divider rail ── */
.rail {
  position: absolute; inset: 0; pointer-events: none;
  transform: translateX(calc(var(--dx) * 1%));
}
.rail__line {
  position: absolute; top: 0; bottom: 0; left: -1px; width: 2px;
  background: linear-gradient(to bottom,
    oklch(0.78 0.15 60 / 0.15),
    oklch(0.78 0.15 60 / 0.85) 30%,
    oklch(0.78 0.15 60 / 0.85) 70%,
    oklch(0.78 0.15 60 / 0.15));
  box-shadow: 0 0 18px oklch(0.78 0.15 60 / 0.35);
}
/* Scroll position: the divider fills as the argument advances, and a marker
   rides it, so every wheel tick is visibly answered. */
.rail__fill {
  position: absolute; top: 0; bottom: 0; left: -1px; width: 2px;
  background: var(--amber);
  box-shadow: 0 0 10px oklch(0.78 0.15 60 / 0.5);
  transform: scaleY(var(--p, 0)); transform-origin: top center;
}
.rail__runner { position: absolute; inset: 0; transform: translateY(calc(var(--p, 0) * 100%)); }
.rail__pos {
  position: absolute; top: 0; left: 0;
  width: 9px; height: 9px; border-radius: 999px;
  background: var(--amber);
  box-shadow: 0 0 10px oklch(0.78 0.15 60 / 0.8), 0 0 0 3px oklch(0.78 0.15 60 / 0.18);
  transform: translate(-50%, -50%);
}
.rail__stamps {
  position: absolute; left: 0; top: 50%;
  transform: translate(-50%, -50%);
  display: flex; flex-direction: column; gap: 12px;
}
.rail__stamp {
  width: 5px; height: 5px; border-radius: 999px;
  background: oklch(0.78 0.15 60 / 0.25);
  transition: background 300ms, box-shadow 300ms;
}
.rail__stamp--hit { background: var(--amber); box-shadow: 0 0 8px oklch(0.78 0.15 60 / 0.6); }
.rail__grip {
  position: absolute; left: 0; top: 71%;
  transform: translate(-50%, -50%);
  width: 26px; height: 44px; border-radius: 999px;
  border: 1px solid oklch(0.78 0.15 60 / 0.5);
  background: oklch(0.17 0.012 60 / 0.85);
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px;
  cursor: grab; pointer-events: auto;
  touch-action: none;
}
.rail__grip:active { cursor: grabbing; }
.rail__grip i { width: 8px; height: 1.5px; background: var(--amber); border-radius: 2px; display: block; }

/* ── Corner chrome ── */
.chrome {
  position: absolute; top: 0; left: 0; right: 0;
  display: flex; justify-content: space-between; align-items: center;
  padding: 20px 26px; pointer-events: none;
}
.chrome a, .chrome__brand { pointer-events: auto; }
.chrome__brand { position: relative; display: inline-flex; }
.chrome__brandcold { color: var(--cold-ink); display: inline-flex; }
.chrome__brandwarm { position: absolute; inset: 0; color: var(--warm-ink); display: inline-flex; opacity: var(--c, 0); }
.chrome__links { display: inline-flex; gap: 22px; align-items: center; }
.chrome__signin { font-size: 13.5px; color: var(--warm-soft); text-decoration: none; }
.chrome__signin:hover { color: var(--warm-ink); }
.chrome__start {
  font-size: 13.5px; color: var(--warm-ink); text-decoration: none;
  border-bottom: 1px solid oklch(0.78 0.15 60 / 0.6); padding-bottom: 2px;
}
.chrome__start:hover { border-bottom-color: var(--amber); color: var(--amber); }
.chrome a:focus-visible { outline: 2px solid var(--amber); outline-offset: 3px; border-radius: 3px; }

/* ── Mobile: the split turns horizontal (sync above, async below) ── */
@media (max-width: 859px) {
  .pane--sync  { clip-path: inset(0 0 calc((100 - var(--dx)) * 1%) 0); }
  .pane--async { clip-path: inset(calc(var(--dx) * 1%) 0 0 0); }
  .pane__center--sync  { transform: translateY(-25%); }
  .pane__center--async { transform: translateY(calc(25% * (1 - var(--c)))); }
  .rail { transform: translateY(calc(var(--dx) * 1%)); }
  .rail__line {
    top: -1px; bottom: auto; left: 0; right: 0; width: auto; height: 2px;
    background: linear-gradient(to right,
      oklch(0.78 0.15 60 / 0.15),
      oklch(0.78 0.15 60 / 0.85) 30%,
      oklch(0.78 0.15 60 / 0.85) 70%,
      oklch(0.78 0.15 60 / 0.15));
  }
  .rail__stamps { left: 50%; top: 0; transform: translate(-50%, -50%); flex-direction: row; }
  .rail__grip {
    left: 78%; top: 0; transform: translate(-50%, -50%) rotate(90deg);
  }
  .rail { opacity: calc(1 - var(--c, 0)); }
  .rail__fill {
    top: -1px; bottom: auto; left: 0; right: 0; width: auto; height: 2px;
    transform: scaleX(var(--p, 0)); transform-origin: left center;
  }
  .rail__runner { transform: translateX(calc(var(--p, 0) * 100%)); }
  .sliver { display: none; }
  /* Top half is the cold world on phones: chrome links take cold ink and
     crossfade to warm as the morning takes over. */
  .chrome__signin { color: color-mix(in oklab, var(--cold-soft), var(--warm-soft) calc(var(--c, 0) * 100%)); }
  .chrome__signin:hover { color: color-mix(in oklab, var(--cold-ink), var(--warm-ink) calc(var(--c, 0) * 100%)); }
  .chrome__start { color: color-mix(in oklab, var(--cold-ink), var(--warm-ink) calc(var(--c, 0) * 100%)); }
  .panel { width: min(560px, 86vw); }
  .display { font-size: clamp(1.55rem, 6.4vw, 2.2rem); margin-bottom: 12px; }
  .display--close { font-size: clamp(1.8rem, 7.5vw, 2.6rem); }
  .sub { font-size: 0.92rem; line-height: 1.55; }
  .kicker { margin-bottom: 10px; font-size: 10px; }
  .label { margin-bottom: 10px; }
  .sum { font-size: 1rem; margin-top: 14px; }
  .timer { font-size: 2.6rem; margin-bottom: 12px; }
  .room__dot { width: 27px; height: 27px; font-size: 8px; }
  .cal { gap: 6px; }
  .cal__row { font-size: 12.5px; }
  .cal__row:nth-child(n+6) { display: none; }
  .chat__line { font-size: 12.5px; padding: 8px 11px; }
  .digest { gap: 9px; }
  .digest__row:nth-child(n+5) { display: none; }
  .peakline { font-size: clamp(2rem, 9vw, 2.8rem); }
  .panel--close .cta { margin-top: 18px; padding: 12px 20px; font-size: 14px; }
  rust { margin-top: 14px; font-size: 10px; }
  .legal { margin-top: 18px; }
  .chrome { padding: 14px 18px; }
  .card__note { font-size: 12px; }
  .card__wave { height: 30px; margin: 10px 0; }
  .fine { margin-top: 9px; }
}

@media (prefers-reduced-motion: reduce) {
  .split * { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
}
`;
