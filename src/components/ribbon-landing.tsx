"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Footer } from "@/components/footer";

// ── The team on the ribbon ──────────────────────────────────────────────────
// Ten teammates spanning ten IANA zones, sorted east → west. Each wakes at a
// specific fraction of scroll progress — that's the choreography, expressed
// once here so every other piece of the page derives from it deterministically.

type Teammate = {
  monogram: string;
  name: string;
  city: string;
  tz: string; // IANA
  offsetHrs: number; // hours from UTC (for the tooltip clock display)
  wakeAtP: number; // scroll fraction 0..1 when their window opens
  submitAtP: number; // scroll fraction when they submit
  role: string;
  actionItem?: string;
  blocker?: string;
};

const TEAM: Teammate[] = [
  { monogram: "MK", name: "Maia Kaui",       city: "Auckland",   tz: "Pacific/Auckland",  offsetHrs: 13,   wakeAtP: 0.12, submitAtP: 0.17, role: "Design",     actionItem: "Ship the tokens rebase" },
  { monogram: "JW", name: "Jia Wen",         city: "Sydney",     tz: "Australia/Sydney",  offsetHrs: 11,   wakeAtP: 0.17, submitAtP: 0.22, role: "Backend",    actionItem: "Migrate the ingest queue" },
  { monogram: "HT", name: "Hiroshi Tanaka",  city: "Tokyo",      tz: "Asia/Tokyo",        offsetHrs: 9,    wakeAtP: 0.22, submitAtP: 0.28, role: "Infra" },
  { monogram: "PR", name: "Priya Rao",       city: "Bangalore",  tz: "Asia/Kolkata",      offsetHrs: 5.5,  wakeAtP: 0.32, submitAtP: 0.38, role: "Data",       actionItem: "Rebuild the weekly rollup" },
  { monogram: "LK", name: "Lena Krüger",     city: "Berlin",     tz: "Europe/Berlin",     offsetHrs: 1,    wakeAtP: 0.44, submitAtP: 0.50, role: "Web",        blocker: "Waiting on staging keys" },
  { monogram: "OA", name: "Oluwa Adeyemi",   city: "Lagos",      tz: "Africa/Lagos",      offsetHrs: 1,    wakeAtP: 0.46, submitAtP: 0.52, role: "Mobile" },
  { monogram: "SM", name: "Sam Miller",      city: "London",     tz: "Europe/London",     offsetHrs: 0,    wakeAtP: 0.48, submitAtP: 0.55, role: "Product",    actionItem: "Interview 3 pilot teams" },
  { monogram: "RC", name: "Rafael Costa",    city: "São Paulo",  tz: "America/Sao_Paulo", offsetHrs: -3,   wakeAtP: 0.58, submitAtP: 0.64, role: "Growth" },
  { monogram: "AS", name: "Amelia Silva",    city: "New York",   tz: "America/New_York",  offsetHrs: -5,   wakeAtP: 0.66, submitAtP: 0.72, role: "SRE",        actionItem: "Rotate the R2 creds" },
  { monogram: "JG", name: "Jordan García",   city: "Los Angeles",tz: "America/Los_Angeles",offsetHrs: -8,  wakeAtP: 0.76, submitAtP: 0.80, role: "AI" },
];

// ── State machine per teammate ─────────────────────────────────────────────
type State = "asleep" | "about" | "open" | "checking" | "done";

function stateFor(t: Teammate, p: number): State {
  if (p < t.wakeAtP - 0.02) return "asleep";
  if (p < t.wakeAtP) return "about";
  if (p < t.submitAtP - 0.01) return "open";
  if (p < t.submitAtP + 0.005) return "checking";
  return "done";
}

// Rough local-clock derived from scroll for the tooltip. Scroll p=0 means
// UTC 00:00; p=1 means UTC 24:00. This is a visual metaphor, not a real
// wall-clock — the whole point of the page is that time is being scrubbed.
function tooltipLocalTime(t: Teammate, p: number): string {
  const utcHour = p * 24;
  const local = (utcHour + t.offsetHrs + 24) % 24;
  const h = Math.floor(local);
  const m = Math.floor((local - h) * 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// Hours-marks along the ribbon top edge.
const HOUR_MARKS = Array.from({ length: 25 }, (_, i) => i);

export function RibbonLanding() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [p, setP] = useState(0);
  const [hovered, setHovered] = useState<number | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    let rafId = 0;
    let scheduled = false;

    const tick = () => {
      scheduled = false;
      const total = document.documentElement.scrollHeight - window.innerHeight;
      const next = total > 0 ? Math.max(0, Math.min(1, window.scrollY / total)) : 0;
      setP(next);
    };
    const onScroll = () => {
      if (scheduled) return;
      scheduled = true;
      rafId = requestAnimationFrame(tick);
    };

    // Under reduced-motion the whole day resolves immediately — the reader
    // sees the final composed state and can still read every line of copy
    // by scrolling; no ribbon animation runs.
    const onMq = () => {
      if (mq.matches) {
        setP(1);
        window.removeEventListener("scroll", onScroll);
        window.removeEventListener("resize", onScroll);
      } else {
        window.addEventListener("scroll", onScroll, { passive: true });
        window.addEventListener("resize", onScroll);
        tick();
      }
    };
    onMq();
    mq.addEventListener("change", onMq);

    return () => {
      cancelAnimationFrame(rafId);
      mq.removeEventListener("change", onMq);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  const doneCount = useMemo(
    () => TEAM.filter((t) => stateFor(t, p) === "done").length,
    [p],
  );

  // Digest lines appear as teammates finish; ordered by submit time.
  const digestLines = useMemo(
    () =>
      TEAM.filter((t) => stateFor(t, p) === "done").map((t) => ({
        monogram: t.monogram,
        name: t.name,
        role: t.role,
        actionItem: t.actionItem,
        blocker: t.blocker,
      })),
    [p],
  );

  return (
    <div ref={rootRef} className="relative flex min-h-dvh flex-col">
      {/* Fixed sky + horizon behind everything */}
      <Sky p={p} />

      {/* The persistent ribbon at the bottom of the viewport */}
      <Ribbon
        p={p}
        hovered={hovered}
        onHover={setHovered}
      />

      {/* Digest panel — top-right, assembles line by line as evening arrives */}
      <DigestPanel p={p} doneCount={doneCount} lines={digestLines} />

      {/* Marketing chrome — brand mark top-left, sign-in top-right */}
      <TopBar />

      {/* Scroll content: each hour-window is a section with copy that
          drifts in/out at its scroll fraction. The ribbon underneath is
          uninterrupted; these blocks are purely typography. */}
      <main className="relative z-10 flex-1">
        <HourWindow from={0.00} to={0.08} align="lead">
          {/* Silence: no headline. The ribbon breathes. */}
        </HourWindow>

        <HourWindow from={0.08} to={0.20} align="lead" srKey="hero">
          <span className="tag">04:00 · Auckland stirs</span>
          <h1 className="display">
            Standups
            <br />
            that respect sleep.
          </h1>
          <p className="lede">
            Your team checks in during their own morning. Not yours. Nobody sits
            on video at 3&nbsp;a.m. so a stand-up can happen.
          </p>
        </HourWindow>

        <HourWindow from={0.20} to={0.36} align="trail" srKey="transform">
          <span className="tag">09:00 · one check-in</span>
          <h2 className="serif">Talk. It becomes text.</h2>
          <p className="lede">
            A short screen and camera recording. AI turns it into bullets your
            team can skim in ten seconds. No meeting was interrupted to make it.
          </p>
          <TransformDemo p={p} from={0.20} to={0.36} />
        </HourWindow>

        <HourWindow from={0.36} to={0.52} align="lead" srKey="digest-preview">
          <span className="tag">13:00 · the occurrence</span>
          <h2 className="serif">A meeting you can read.</h2>
          <p className="lede">
            Every teammate&rsquo;s update in one page. Action items pulled out.
            Blockers surfaced. Your inbox stops mattering.
          </p>
          <SummaryStack p={p} from={0.36} to={0.52} />
        </HourWindow>

        <HourWindow from={0.52} to={0.80} align="split" srKey="peak">
          <span className="tag tag--peak">17:00 · the day sweep</span>
          <h2 className="display display--serif">
            Your team works
            <br />
            <em>while you sleep.</em>
          </h2>
          <div className="peak-space" aria-hidden />
          <p className="lede lede--peak">
            Watch a day pass. The sun crosses the ribbon. Ten teammates check in
            during their own morning. By your evening, the digest has written
            itself.
          </p>
        </HourWindow>

        <HourWindow from={0.80} to={0.92} align="lead" srKey="trust">
          <span className="tag">20:00 · dusk</span>
          <ul className="trust">
            <li><strong>Self-host</strong> · single <code>docker compose up</code></li>
            <li><strong>AGPL-3.0</strong> · full source, no lock-in</li>
            <li><strong>Encrypted</strong> · AES-256-GCM on every transcript</li>
            <li><strong>Postgres RLS</strong> · FORCE-enabled on every table</li>
            <li><strong>No third-party analytics</strong> · one strictly-necessary cookie</li>
          </ul>
        </HourWindow>

        <HourWindow from={0.92} to={1.00} align="lead" srKey="close">
          <span className="tag">23:30 · your turn</span>
          <p className="close">
            <span className="serif">Start your team&rsquo;s morning.</span>
          </p>
          <div className="close-cta">
            <Link href="/sign-in" className="cta-slot">
              <span className="cta-slot__mono">+</span>
              <span className="cta-slot__label">Sign in with email</span>
              <span className="cta-slot__arrow" aria-hidden>→</span>
            </Link>
          </div>
        </HourWindow>
      </main>

      <Footer />

      {/* Global CSS scoped to this page — declarations sit here so the rest of
          the app doesn't inherit the ribbon-page tokens. */}
      <style>{PAGE_CSS}</style>
    </div>
  );
}

// ── Pieces ────────────────────────────────────────────────────────────────

function TopBar() {
  return (
    <header className="topbar">
      <span className="topbar__brand">
        <span className="topbar__dot" aria-hidden />
        asincly
      </span>
      <nav className="topbar__nav">
        <Link href="/legal/privacy" className="topbar__link">
          Privacy
        </Link>
        <a
          href="https://github.com"
          target="_blank"
          rel="noopener noreferrer"
          className="topbar__link"
        >
          Source
        </a>
        <Link href="/sign-in" className="topbar__cta">
          Sign in
        </Link>
      </nav>
    </header>
  );
}

function Sky({ p }: { p: number }) {
  // Sky tone slides from pre-dawn through daylight to night. All CSS-driven
  // via the custom property; no per-frame React work.
  return (
    <div
      className="sky"
      style={{ ["--p" as string]: p }}
      aria-hidden
    />
  );
}

function Ribbon({
  p,
  hovered,
  onHover,
}: {
  p: number;
  hovered: number | null;
  onHover: (i: number | null) => void;
}) {
  // Sun x-position along the ribbon, based on scroll progress.
  const sunX = p * 100;

  return (
    <div className="ribbon" style={{ ["--p" as string]: p, ["--sun-x" as string]: `${sunX}%` }}>
      <div className="ribbon__inner">
        <div className="ribbon__hourline" aria-hidden>
          {HOUR_MARKS.map((h) => (
            <span
              key={h}
              className="ribbon__tick"
              style={{ left: `${(h / 24) * 100}%` }}
            >
              {h % 6 === 0 && (
                <span className="ribbon__ticklabel">
                  {String(h).padStart(2, "0")}
                </span>
              )}
            </span>
          ))}
          <span className="ribbon__sun" aria-hidden />
        </div>
        <ol className="ribbon__team" role="list">
          {TEAM.map((t, i) => (
            <TeammateDot
              key={t.tz}
              t={t}
              i={i}
              p={p}
              hovered={hovered === i}
              onHover={onHover}
            />
          ))}
        </ol>
      </div>
    </div>
  );
}

function TeammateDot({
  t,
  i,
  p,
  hovered,
  onHover,
}: {
  t: Teammate;
  i: number;
  p: number;
  hovered: boolean;
  onHover: (i: number | null) => void;
}) {
  const state = stateFor(t, p);
  const local = tooltipLocalTime(t, p);

  // Jump the reader to the scroll position where this teammate wakes.
  const jump = () => {
    const total = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo({ top: total * t.wakeAtP, behavior: "smooth" });
  };

  return (
    <li className="teammate">
      <button
        type="button"
        className={`teammate__btn teammate__btn--${state}`}
        onMouseEnter={() => onHover(i)}
        onMouseLeave={() => onHover(null)}
        onFocus={() => onHover(i)}
        onBlur={() => onHover(null)}
        onClick={jump}
        aria-label={`${t.name}, ${t.city}. Local time ${local}. Status: ${state}.`}
      >
        <span className="teammate__ring" aria-hidden />
        <span className="teammate__mono">{t.monogram}</span>
      </button>
      <span className="teammate__city" aria-hidden>{t.city}</span>
      {hovered && (
        <div className="teammate__tip" role="tooltip">
          <div className="teammate__tipname">{t.name}</div>
          <div className="teammate__tipmeta">
            <span>{t.city}</span>
            <span className="teammate__tiptz">{local}</span>
          </div>
          <div className={`teammate__tipstate teammate__tipstate--${state}`}>
            {stateLabel(state)}
          </div>
        </div>
      )}
    </li>
  );
}

function stateLabel(s: State): string {
  if (s === "asleep") return "asleep";
  if (s === "about") return "window opens soon";
  if (s === "open") return "window open";
  if (s === "checking") return "checking in now";
  return "done for today";
}

function DigestPanel({
  p,
  doneCount,
  lines,
}: {
  p: number;
  doneCount: number;
  lines: Array<{
    monogram: string;
    name: string;
    role: string;
    actionItem?: string;
    blocker?: string;
  }>;
}) {
  // The digest starts to appear during the peak.
  const opacity = Math.max(0, Math.min(1, (p - 0.45) / 0.15));
  if (opacity < 0.02) return null;

  return (
    <aside
      className="digest"
      style={{ ["--opacity" as string]: opacity }}
      aria-hidden={opacity < 0.5}
    >
      <header className="digest__head">
        <span className="digest__key">today · digest</span>
        <span className="digest__count">
          <span>{doneCount}</span>/{TEAM.length}
        </span>
      </header>
      <ol className="digest__list">
        {lines.map((l) => (
          <li key={l.monogram} className="digest__line">
            <span className="digest__mono">{l.monogram}</span>
            <span className="digest__body">
              <span className="digest__name">
                {l.name} <span className="digest__role">{l.role}</span>
              </span>
              {l.actionItem && (
                <span className="digest__action">→ {l.actionItem}</span>
              )}
              {l.blocker && (
                <span className="digest__blocker">! {l.blocker}</span>
              )}
            </span>
          </li>
        ))}
      </ol>
    </aside>
  );
}

// A hour-window is copy layered above the fixed ribbon. It fades in/out at
// its scroll fractions. This is the plateau window pattern from worldflight —
// we're not in worldflight mode but the copy contract is the same: a
// triangle-fade means only one pixel is fully legible, so we plateau instead.
function HourWindow({
  from,
  to,
  align,
  children,
  srKey,
}: {
  from: number;
  to: number;
  align: "lead" | "trail" | "split";
  children?: React.ReactNode;
  srKey?: string;
}) {
  const span = to - from;
  // The window's vertical size in viewport-heights. Peak (span 0.28) gets ~2.6vh;
  // shorter windows shorter. The ribbon persists across all of them.
  const vh = Math.max(60, span * 1000);
  return (
    <section
      className={`hourwindow hourwindow--${align}`}
      style={{
        ["--from" as string]: from,
        ["--to" as string]: to,
        minHeight: `${vh}vh`,
      }}
      data-sr-key={srKey}
    >
      <div className="hourwindow__wrap">
        <div className="hourwindow__inner">{children}</div>
      </div>
    </section>
  );
}

// ── Two small in-page demos: the transform card and the summary stack ─────

function TransformDemo({
  p,
  from,
  to,
}: {
  p: number;
  from: number;
  to: number;
}) {
  const local = clamp((p - from) / (to - from), 0, 1);
  // Three stages: recording (0-0.4), note (0.4-0.7), summary (0.7-1)
  return (
    <div className="transform" aria-hidden>
      <div
        className="transform__card"
        style={{ opacity: local < 0.35 ? 1 : 0 }}
      >
        <div className="transform__cardhead">
          <span className="transform__rec">●</span>
          <span className="transform__caption">recording · 00:38</span>
        </div>
        <div className="transform__mic" />
      </div>
      <div
        className="transform__card"
        style={{ opacity: local >= 0.30 && local < 0.72 ? 1 : 0 }}
      >
        <div className="transform__cardhead">
          <span className="transform__caption">note · draft</span>
        </div>
        <div className="transform__notelines">
          <span />
          <span />
          <span />
        </div>
      </div>
      <div
        className="transform__card"
        style={{ opacity: local >= 0.65 ? 1 : 0 }}
      >
        <div className="transform__cardhead">
          <span className="transform__caption">summary</span>
        </div>
        <ul className="transform__bullets">
          <li>→ Ship the token rebase</li>
          <li>→ Review Sam&rsquo;s PR</li>
          <li>→ Draft the migration plan</li>
        </ul>
      </div>
    </div>
  );
}

function SummaryStack({
  p,
  from,
  to,
}: {
  p: number;
  from: number;
  to: number;
}) {
  const local = clamp((p - from) / (to - from), 0, 1);
  const rows = [
    { m: "MK", head: "Design", body: "Shipped the token rebase. Reviewing Sam's PR.", tag: "action" },
    { m: "JW", head: "Backend", body: "Ingest queue migrated. No blockers.", tag: null },
    { m: "PR", head: "Data", body: "Weekly rollup fix landed. Rebuild running.", tag: "action" },
    { m: "LK", head: "Web", body: "Feature flag rollout paused.", tag: "blocker" },
    { m: "OA", head: "Mobile", body: "Cut the beta build. QA has it.", tag: null },
  ];
  return (
    <div className="summaries" aria-hidden>
      {rows.map((r, i) => {
        const trigger = 0.1 + i * 0.15;
        const opacity = clamp((local - trigger) / 0.15, 0, 1);
        return (
          <div
            key={r.m}
            className={`summary summary--${r.tag ?? "plain"}`}
            style={{ opacity, transform: `translateY(${(1 - opacity) * 6}px)` }}
          >
            <span className="summary__mono">{r.m}</span>
            <div className="summary__body">
              <div className="summary__head">{r.head}</div>
              <div className="summary__text">{r.body}</div>
            </div>
            {r.tag && (
              <span className={`summary__pill summary__pill--${r.tag}`}>
                {r.tag}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// ── The one big CSS block ─────────────────────────────────────────────────
// Kept in a template literal here so the ribbon page's aesthetic doesn't
// leak into the app shell. Uses two families: Geist Sans (already loaded)
// and a serif from Google Fonts loaded via <link> in layout.

const PAGE_CSS = `
.sky {
  position: fixed; inset: 0; z-index: 0; pointer-events: none;
  background:
    radial-gradient(ellipse 120% 80% at 50% -20%,
      color-mix(in oklch, oklch(0.70 0.18 60) calc(var(--p) * 25%), transparent),
      transparent 60%),
    linear-gradient(
      180deg,
      color-mix(in oklch, oklch(0.20 0.03 260) calc(90% - var(--p) * 60%), oklch(0.08 0.01 260)) 0%,
      oklch(0.11 0.01 260) 55%,
      oklch(0.09 0.01 260) 100%
    );
  transition: background-color 400ms linear;
}
.sky::after {
  content: ""; position: absolute; inset: 0;
  background:
    radial-gradient(circle at 15% 15%, oklch(0.85 0.02 240 / 0.03), transparent 40%),
    radial-gradient(circle at 85% 85%, oklch(0.85 0.02 240 / 0.02), transparent 40%);
  mix-blend-mode: screen;
}

/* Top bar */
.topbar {
  position: fixed; top: 0; left: 0; right: 0; z-index: 50;
  display: flex; align-items: center; justify-content: space-between;
  padding: 20px clamp(24px, 4vw, 40px);
  color: oklch(0.94 0.006 240);
}
.topbar__brand {
  display: inline-flex; align-items: center; gap: 8px;
  font-size: 13px; font-weight: 500; letter-spacing: 0.02em;
}
.topbar__dot {
  width: 6px; height: 6px; border-radius: 999px;
  background: oklch(0.72 0.16 155);
  box-shadow: 0 0 12px oklch(0.72 0.16 155 / 0.7);
}
.topbar__nav { display: inline-flex; align-items: center; gap: 16px; }
.topbar__link {
  font-size: 12px; color: oklch(0.66 0.02 240);
  text-decoration: none; transition: color 200ms;
}
.topbar__link:hover { color: oklch(0.95 0.01 240); }
.topbar__cta {
  font-size: 13px; font-weight: 500; text-decoration: none;
  padding: 8px 14px; border-radius: 8px;
  background: oklch(0.94 0.006 240); color: oklch(0.10 0.01 250);
  transition: opacity 200ms;
}
.topbar__cta:hover { opacity: 0.85; }

/* The persistent ribbon */
.ribbon {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 20;
  padding: 24px clamp(24px, 4vw, 48px) 32px;
  pointer-events: none;
}
.ribbon__inner {
  position: relative;
  max-width: 1400px; margin: 0 auto;
  background: linear-gradient(
    180deg,
    color-mix(in oklch, oklch(0.10 0.01 250) 40%, transparent),
    oklch(0.10 0.01 250) 60%
  );
  padding: 18px 20px 20px;
  border-radius: 14px;
  border: 1px solid oklch(1 0 0 / 0.06);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  pointer-events: auto;
}
.ribbon__hourline {
  position: relative; height: 20px; margin-bottom: 14px;
}
.ribbon__tick {
  position: absolute; top: 8px; width: 1px; height: 4px;
  background: oklch(1 0 0 / 0.12);
  transform: translateX(-0.5px);
}
.ribbon__tick:has(.ribbon__ticklabel) { height: 6px; background: oklch(1 0 0 / 0.22); }
.ribbon__ticklabel {
  position: absolute; top: -14px; left: 50%; transform: translateX(-50%);
  font-family: var(--font-geist-mono, ui-monospace, monospace);
  font-size: 9px; color: oklch(0.60 0.02 240 / 0.7);
  letter-spacing: 0.05em;
}
.ribbon__sun {
  position: absolute; top: 6px; left: var(--sun-x, 0);
  width: 10px; height: 10px; border-radius: 999px;
  background: radial-gradient(circle,
    oklch(0.92 0.14 65) 0%,
    oklch(0.75 0.18 40) 60%,
    transparent 100%);
  box-shadow:
    0 0 12px oklch(0.85 0.18 55 / 0.7),
    0 0 32px oklch(0.85 0.18 55 / 0.35);
  transform: translate(-50%, 0);
  transition: left 220ms cubic-bezier(.2,.6,.3,1);
}
.ribbon__team {
  list-style: none; padding: 0; margin: 0;
  display: grid; grid-template-columns: repeat(10, 1fr); gap: 4px;
}

/* Teammate */
.teammate {
  position: relative;
  display: flex; flex-direction: column; align-items: center; gap: 6px;
}
.teammate__btn {
  appearance: none; background: transparent; border: 0; padding: 0; cursor: pointer;
  position: relative;
  width: 44px; height: 44px; border-radius: 999px;
  display: grid; place-items: center;
  transition: transform 220ms cubic-bezier(.2,.6,.3,1);
}
.teammate__btn:focus-visible { outline: 2px solid oklch(0.72 0.16 155); outline-offset: 4px; }
.teammate__btn:hover { transform: translateY(-3px); }
.teammate__ring {
  position: absolute; inset: 0; border-radius: 999px;
  border: 1.5px solid oklch(1 0 0 / 0.12);
  transition: all 260ms cubic-bezier(.2,.6,.3,1);
}
.teammate__mono {
  position: relative;
  font-size: 12px; font-weight: 500; letter-spacing: 0.03em;
  color: oklch(0.55 0.02 240 / 0.7);
  transition: color 260ms;
}
/* State visuals — deterministic from scroll */
.teammate__btn--about .teammate__ring { border-color: oklch(0.75 0.14 60 / 0.5); }
.teammate__btn--about .teammate__mono { color: oklch(0.85 0.05 60); }

.teammate__btn--open .teammate__ring {
  border-color: oklch(0.72 0.16 155);
  box-shadow: 0 0 14px oklch(0.72 0.16 155 / 0.35), inset 0 0 8px oklch(0.72 0.16 155 / 0.15);
}
.teammate__btn--open .teammate__mono { color: oklch(0.95 0.01 240); }

.teammate__btn--checking .teammate__ring {
  border-color: oklch(0.72 0.16 155);
  box-shadow: 0 0 20px oklch(0.72 0.16 155 / 0.6);
  animation: pulse 1.4s ease-in-out infinite;
}
.teammate__btn--checking .teammate__mono { color: oklch(0.98 0.01 240); }

.teammate__btn--done .teammate__ring {
  border-color: oklch(0.55 0.10 155 / 0.55);
  background: oklch(0.72 0.16 155 / 0.06);
}
.teammate__btn--done .teammate__mono { color: oklch(0.78 0.06 155); }
.teammate__btn--done::after {
  content: "";
  position: absolute; right: -2px; top: -2px;
  width: 12px; height: 12px; border-radius: 999px;
  background: oklch(0.72 0.16 155);
  box-shadow: 0 0 0 2px oklch(0.10 0.01 250);
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'><path d='M3 6.5l2 2 4-4.5' stroke='%230f1712' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round' fill='none'/></svg>");
  background-repeat: no-repeat; background-position: center;
}

@keyframes pulse {
  0%, 100% { box-shadow: 0 0 20px oklch(0.72 0.16 155 / 0.6); }
  50% { box-shadow: 0 0 28px oklch(0.72 0.16 155 / 0.85); }
}

.teammate__city {
  font-family: var(--font-geist-mono, ui-monospace, monospace);
  font-size: 9px; letter-spacing: 0.06em;
  color: oklch(0.55 0.02 240 / 0.7);
  text-transform: lowercase;
  white-space: nowrap;
}

.teammate__tip {
  position: absolute; bottom: calc(100% + 12px); left: 50%; transform: translateX(-50%);
  min-width: 180px;
  padding: 10px 12px;
  background: oklch(0.06 0.005 250 / 0.95);
  border: 1px solid oklch(1 0 0 / 0.10);
  border-radius: 10px;
  backdrop-filter: blur(8px);
  animation: tipin 160ms cubic-bezier(.2,.6,.3,1);
  z-index: 30;
}
.teammate__tip::after {
  content: ""; position: absolute; top: 100%; left: 50%; transform: translateX(-50%);
  border: 5px solid transparent; border-top-color: oklch(0.06 0.005 250 / 0.95);
}
.teammate__tipname { font-size: 13px; font-weight: 500; color: oklch(0.95 0.01 240); }
.teammate__tipmeta {
  display: flex; justify-content: space-between;
  font-family: var(--font-geist-mono, ui-monospace, monospace);
  font-size: 10px; color: oklch(0.60 0.02 240 / 0.8); margin-top: 4px;
}
.teammate__tiptz { color: oklch(0.80 0.04 60); }
.teammate__tipstate {
  margin-top: 6px; padding-top: 6px; border-top: 1px solid oklch(1 0 0 / 0.06);
  font-size: 10px; letter-spacing: 0.06em; text-transform: uppercase;
  color: oklch(0.55 0.02 240 / 0.7);
}
.teammate__tipstate--open, .teammate__tipstate--checking, .teammate__tipstate--done {
  color: oklch(0.75 0.14 155);
}
.teammate__tipstate--about { color: oklch(0.78 0.12 60); }
@keyframes tipin {
  from { opacity: 0; transform: translate(-50%, 4px); }
  to { opacity: 1; transform: translate(-50%, 0); }
}

/* Digest panel */
.digest {
  position: fixed; top: 78px; right: clamp(24px, 4vw, 40px);
  width: min(320px, calc(100vw - 48px));
  padding: 16px 18px;
  background: oklch(0.10 0.01 250 / 0.75);
  border: 1px solid oklch(1 0 0 / 0.08);
  border-radius: 12px;
  backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
  z-index: 40;
  opacity: var(--opacity);
  transform: translateY(calc((1 - var(--opacity)) * -6px));
  transition: opacity 200ms, transform 200ms;
}
.digest__head {
  display: flex; justify-content: space-between; align-items: baseline;
  padding-bottom: 10px; margin-bottom: 10px;
  border-bottom: 1px solid oklch(1 0 0 / 0.06);
}
.digest__key {
  font-family: var(--font-geist-mono, ui-monospace, monospace);
  font-size: 10px; text-transform: uppercase; letter-spacing: 0.16em;
  color: oklch(0.60 0.02 240);
}
.digest__count {
  font-family: var(--font-geist-mono, ui-monospace, monospace);
  font-size: 13px; color: oklch(0.72 0.16 155);
}
.digest__count span:first-child { color: oklch(0.95 0.01 240); }
.digest__list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
.digest__line {
  display: flex; gap: 10px; align-items: flex-start;
  animation: digestin 320ms cubic-bezier(.2,.6,.3,1);
}
@keyframes digestin { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
.digest__mono {
  flex-shrink: 0;
  width: 24px; height: 24px; border-radius: 999px;
  display: grid; place-items: center;
  background: oklch(1 0 0 / 0.04);
  border: 1px solid oklch(0.72 0.16 155 / 0.35);
  font-size: 9px; font-weight: 500; color: oklch(0.78 0.06 155);
}
.digest__body { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.digest__name { font-size: 12px; color: oklch(0.94 0.006 240); }
.digest__role { color: oklch(0.60 0.02 240); font-size: 10px; margin-left: 4px; }
.digest__action, .digest__blocker {
  font-size: 11px; color: oklch(0.75 0.06 240);
}
.digest__blocker { color: oklch(0.78 0.16 30); }

/* Hour-windows: typography above the ribbon.
   Sticky inner so the copy holds near the top of the viewport for the whole
   time its section is passing — that's what makes a worldflight-y ribbon
   page feel continuous instead of blocky. */
.hourwindow {
  position: relative;
  padding: 0 clamp(24px, 4vw, 48px);
  display: flex;
}
.hourwindow--lead .hourwindow__wrap { margin-right: auto; }
.hourwindow--trail .hourwindow__wrap { margin-left: auto; }
.hourwindow--split .hourwindow__wrap { margin: 0 auto; }
.hourwindow__wrap {
  width: 100%; max-width: 720px;
}
.hourwindow__inner {
  position: sticky;
  top: clamp(72px, 12vh, 140px);
  max-width: 640px;
  display: flex; flex-direction: column; gap: 20px;
  color: oklch(0.94 0.006 240);
  padding-bottom: 220px; /* clears the fixed ribbon */
}

.tag {
  display: inline-flex; align-items: center; gap: 8px;
  font-family: var(--font-geist-mono, ui-monospace, monospace);
  font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase;
  color: oklch(0.62 0.02 240);
  padding-left: 14px; position: relative;
}
.tag::before {
  content: ""; position: absolute; left: 0; top: 50%;
  width: 8px; height: 1px; background: oklch(0.72 0.16 155);
}
.tag--peak { color: oklch(0.80 0.06 60); }
.tag--peak::before { background: oklch(0.80 0.12 60); }

.display {
  font-family: var(--font-sans);
  font-weight: 400;
  font-size: clamp(48px, 8vw, 96px);
  line-height: 0.98;
  letter-spacing: -0.03em;
  margin: 0;
  color: oklch(0.96 0.006 240);
}
.display--serif {
  font-family: var(--font-serif), "Charter", "Iowan Old Style", Georgia, serif;
  font-weight: 400;
  font-size: clamp(52px, 9vw, 108px);
  letter-spacing: -0.02em;
}
.display--serif em {
  font-style: italic;
  color: oklch(0.85 0.10 60);
}

.serif {
  font-family: var(--font-serif), "Charter", "Iowan Old Style", Georgia, serif;
  font-weight: 400;
  font-size: clamp(32px, 5vw, 56px);
  line-height: 1.05;
  letter-spacing: -0.015em;
  color: oklch(0.96 0.006 240);
  margin: 0;
}

.lede {
  font-size: clamp(16px, 1.3vw, 19px);
  line-height: 1.55;
  color: oklch(0.75 0.015 240);
  max-width: 44ch;
  margin: 0;
}
.lede--peak {
  max-width: 42ch;
  color: oklch(0.72 0.02 240);
}

.peak-space { min-height: 20vh; }

.trust {
  list-style: none; padding: 0; margin: 0;
  display: flex; flex-direction: column; gap: 10px;
  font-size: 15px; color: oklch(0.75 0.015 240);
}
.trust strong { color: oklch(0.94 0.006 240); font-weight: 500; margin-right: 6px; }
.trust code {
  font-family: var(--font-geist-mono, ui-monospace, monospace);
  font-size: 12px;
  padding: 2px 6px; border-radius: 4px;
  background: oklch(1 0 0 / 0.05);
  color: oklch(0.85 0.02 240);
}

.close {
  font-size: clamp(36px, 5vw, 56px);
  color: oklch(0.94 0.006 240);
  margin: 0;
}
.close .serif { font-style: italic; }
.close-cta { margin-top: 8px; }
.cta-slot {
  display: inline-flex; align-items: center; gap: 12px;
  padding: 12px 20px;
  border: 1px dashed oklch(0.72 0.16 155 / 0.55);
  border-radius: 12px;
  background: oklch(0.72 0.16 155 / 0.05);
  color: oklch(0.94 0.006 240);
  text-decoration: none;
  transition: all 200ms cubic-bezier(.2,.6,.3,1);
}
.cta-slot:hover {
  background: oklch(0.72 0.16 155 / 0.12);
  border-style: solid;
  transform: translateY(-1px);
}
.cta-slot__mono {
  width: 32px; height: 32px; border-radius: 999px;
  display: grid; place-items: center;
  border: 1.5px solid oklch(0.72 0.16 155);
  color: oklch(0.85 0.10 155);
  font-size: 16px;
}
.cta-slot__label { font-size: 15px; font-weight: 500; letter-spacing: -0.01em; }
.cta-slot__arrow { color: oklch(0.72 0.02 240); font-size: 14px; margin-left: 4px; }

/* Transform demo */
.transform {
  position: relative; height: 220px;
  max-width: 320px; margin-top: 8px;
}
.transform__card {
  position: absolute; inset: 0;
  padding: 14px 16px;
  background: oklch(0.14 0.01 250 / 0.9);
  border: 1px solid oklch(1 0 0 / 0.08);
  border-radius: 14px;
  transition: opacity 220ms cubic-bezier(.2,.6,.3,1);
}
.transform__cardhead {
  display: flex; align-items: center; gap: 8px;
  font-family: var(--font-geist-mono, ui-monospace, monospace);
  font-size: 10px; text-transform: uppercase; letter-spacing: 0.12em;
  color: oklch(0.60 0.02 240);
  margin-bottom: 14px;
}
.transform__rec { color: oklch(0.68 0.18 30); animation: pulse 1.2s ease-in-out infinite; }
.transform__caption { flex: 1; }
.transform__mic {
  height: 60px; margin-top: 16px;
  background: repeating-linear-gradient(
    90deg,
    oklch(0.72 0.16 155 / 0.4) 0 2px,
    transparent 2px 6px
  );
  mask-image: linear-gradient(90deg, transparent, black 20%, black 80%, transparent);
}
.transform__notelines { display: flex; flex-direction: column; gap: 8px; margin-top: 4px; }
.transform__notelines span { height: 8px; background: oklch(1 0 0 / 0.06); border-radius: 3px; }
.transform__notelines span:nth-child(2) { width: 80%; }
.transform__notelines span:nth-child(3) { width: 65%; }
.transform__bullets { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
.transform__bullets li { font-size: 13px; color: oklch(0.90 0.01 240); }

/* Summary stack */
.summaries {
  display: flex; flex-direction: column; gap: 8px;
  max-width: 480px; margin-top: 12px;
}
.summary {
  display: flex; gap: 12px; align-items: flex-start;
  padding: 12px 14px;
  background: oklch(0.14 0.01 250 / 0.7);
  border: 1px solid oklch(1 0 0 / 0.06);
  border-radius: 10px;
  transition: opacity 320ms cubic-bezier(.2,.6,.3,1), transform 320ms cubic-bezier(.2,.6,.3,1);
}
.summary__mono {
  flex-shrink: 0;
  width: 26px; height: 26px; border-radius: 999px;
  display: grid; place-items: center;
  background: oklch(1 0 0 / 0.04);
  border: 1px solid oklch(1 0 0 / 0.10);
  font-size: 10px; color: oklch(0.85 0.01 240);
}
.summary__body { flex: 1; min-width: 0; }
.summary__head {
  font-family: var(--font-geist-mono, ui-monospace, monospace);
  font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase;
  color: oklch(0.60 0.02 240);
}
.summary__text { font-size: 13px; color: oklch(0.90 0.01 240); margin-top: 2px; }
.summary__pill {
  align-self: center; padding: 3px 8px; border-radius: 999px;
  font-size: 10px; letter-spacing: 0.06em;
}
.summary__pill--action {
  background: oklch(0.72 0.16 155 / 0.10); color: oklch(0.85 0.10 155);
  border: 1px solid oklch(0.72 0.16 155 / 0.30);
}
.summary__pill--blocker {
  background: oklch(0.68 0.18 30 / 0.10); color: oklch(0.80 0.12 30);
  border: 1px solid oklch(0.68 0.18 30 / 0.35);
}

/* Reduced motion: kill non-essential animation */
@media (prefers-reduced-motion: reduce) {
  * { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; }
  .teammate__btn--checking .teammate__ring { animation: none; }
  .transform__rec { animation: none; }
  .ribbon__sun { transition: none; }
}

/* Compact mobile: hide city labels, cluster monograms tighter, smaller ribbon */
@media (max-width: 720px) {
  .ribbon { padding: 12px 16px 20px; }
  .ribbon__inner { padding: 12px 12px 14px; }
  .ribbon__team { gap: 2px; }
  .teammate__btn { width: 32px; height: 32px; }
  .teammate__mono { font-size: 10px; }
  .teammate__city { display: none; }
  .digest {
    position: fixed; top: auto; bottom: 130px; right: 16px; left: 16px; width: auto;
    max-width: none;
  }
  .digest__list { max-height: 200px; overflow-y: auto; }
  .display, .display--serif { font-size: clamp(36px, 10vw, 64px); }
  .serif { font-size: clamp(28px, 7vw, 40px); }
  .hourwindow { padding-bottom: 180px; }
  .transform, .summaries { max-width: 100%; }
}
`;
