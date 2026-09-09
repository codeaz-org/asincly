"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Footer } from "@/components/footer";
import { Logo } from "@/components/logo";

// ── The team in the hero demo ───────────────────────────────────────────────
// Ten teammates spanning ten IANA zones, east → west. The demo scrubs one
// 24-hour day; every state below derives deterministically from progress p.

type Teammate = {
  monogram: string;
  name: string;
  city: string;
  offsetHrs: number;
  wakeAtP: number;
  submitAtP: number;
  role: string;
  actionItem?: string;
  blocker?: string;
};

const TEAM: Teammate[] = [
  { monogram: "MK", name: "Maia Kaui",      city: "Auckland",    offsetHrs: 13,  wakeAtP: 0.10, submitAtP: 0.15, role: "Design",  actionItem: "Ship the tokens rebase" },
  { monogram: "JW", name: "Jia Wen",        city: "Sydney",      offsetHrs: 11,  wakeAtP: 0.15, submitAtP: 0.20, role: "Backend", actionItem: "Migrate the ingest queue" },
  { monogram: "HT", name: "Hiroshi Tanaka", city: "Tokyo",       offsetHrs: 9,   wakeAtP: 0.20, submitAtP: 0.26, role: "Infra" },
  { monogram: "PR", name: "Priya Rao",      city: "Bangalore",   offsetHrs: 5.5, wakeAtP: 0.30, submitAtP: 0.36, role: "Data",    actionItem: "Rebuild the weekly rollup" },
  { monogram: "LK", name: "Lena Krüger",    city: "Berlin",      offsetHrs: 1,   wakeAtP: 0.42, submitAtP: 0.48, role: "Web",     blocker: "Waiting on staging keys" },
  { monogram: "OA", name: "Oluwa Adeyemi",  city: "Lagos",       offsetHrs: 1,   wakeAtP: 0.44, submitAtP: 0.50, role: "Mobile" },
  { monogram: "SM", name: "Sam Miller",     city: "London",      offsetHrs: 0,   wakeAtP: 0.46, submitAtP: 0.53, role: "Product", actionItem: "Interview 3 pilot teams" },
  { monogram: "RC", name: "Rafael Costa",   city: "São Paulo",   offsetHrs: -3,  wakeAtP: 0.56, submitAtP: 0.62, role: "Growth" },
  { monogram: "AS", name: "Amelia Silva",   city: "New York",    offsetHrs: -5,  wakeAtP: 0.64, submitAtP: 0.70, role: "SRE",     actionItem: "Rotate the R2 creds" },
  { monogram: "JG", name: "Jordan García",  city: "Los Angeles", offsetHrs: -8,  wakeAtP: 0.74, submitAtP: 0.79, role: "AI" },
];

type State = "asleep" | "about" | "open" | "checking" | "done";

function stateFor(t: Teammate, p: number): State {
  if (p < t.wakeAtP - 0.02) return "asleep";
  if (p < t.wakeAtP) return "about";
  if (p < t.submitAtP - 0.01) return "open";
  if (p < t.submitAtP + 0.005) return "checking";
  return "done";
}

function localTime(t: Teammate, p: number): string {
  const local = (p * 24 + t.offsetHrs + 24) % 24;
  const h = Math.floor(local);
  const m = Math.floor((local - h) * 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

const HOUR_MARKS = Array.from({ length: 25 }, (_, i) => i);
const LOOP_SECONDS = 36;

// ── Scroll reveal ───────────────────────────────────────────────────────────
// Sections rise into place as they enter the viewport. One observer per
// element, disconnects after firing, disabled under reduced motion (CSS
// forces the visible state there).

function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("reveal--in");
          io.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`reveal ${className}`}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

export function RibbonLanding() {
  return (
    <div className="landing flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-background/85 backdrop-blur">
        <div className="mx-auto max-w-6xl px-6 h-16 flex items-center gap-4 md:gap-8">
          <Logo size={26} className="text-base" />
          <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
            <a href="#how" className="hover:text-foreground transition">How it works</a>
            <a href="#digest" className="hover:text-foreground transition">The digest</a>
            <a href="#trust" className="hover:text-foreground transition">Self-host</a>
          </nav>
          <span className="flex-1" />
          <Link
            href="/sign-in"
            className="text-sm text-muted-foreground hover:text-foreground transition whitespace-nowrap"
          >
            Sign in
          </Link>
          <Link
            href="/sign-in"
            className="h-9 px-4 rounded-lg bg-foreground text-primary-foreground text-sm font-medium hover:bg-foreground/90 transition inline-flex items-center whitespace-nowrap"
          >
            Get started<span className="hidden sm:inline">&nbsp;free</span>
          </Link>
        </div>
      </header>

      <main className="flex-1">
        {/* ── Hero ── */}
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "radial-gradient(ellipse 90% 60% at 50% -10%, oklch(0.72 0.16 155 / 0.07), transparent 60%)",
            }}
          />
          <div className="relative mx-auto max-w-6xl px-6 pt-20 pb-14 md:pt-28 md:pb-16 text-center">
            <p className="text-[12px] uppercase tracking-[0.22em] text-muted-foreground mb-5">
              Async standups for remote teams
            </p>
            <h1 className="text-5xl md:text-7xl font-semibold tracking-tight leading-[1.02] text-balance">
              Standups that
              <br />
              <span className="serif-italic text-amber-300/90">respect sleep.</span>
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-base md:text-lg text-muted-foreground leading-relaxed">
              Everyone checks in during their own morning with a two-minute video
              or note. AI turns it into a digest your team reads in ten seconds.
              No meeting. No 3&nbsp;a.m. calls.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link
                href="/sign-in"
                className="h-12 px-7 rounded-lg bg-foreground text-primary-foreground text-sm font-semibold hover:bg-foreground/90 active:scale-[0.99] transition inline-flex items-center gap-2"
              >
                Start your team&rsquo;s morning →
              </Link>
              <a
                href="#how"
                className="h-12 px-6 rounded-lg border border-white/12 text-sm font-medium hover:bg-white/[0.04] transition inline-flex items-center"
              >
                See how it works
              </a>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              Free while in beta · magic-link sign-in · no credit card
            </p>
          </div>

        </section>

        {/* Pinned act: scroll scrubs one full day across the ribbon */}
        <RibbonAct />

        {/* ── Transform ── */}
        <section id="how" className="border-t border-white/[0.06]">
          <div className="mx-auto max-w-6xl px-6 py-20 md:py-24">
            <Reveal>
              <SectionHead
                kicker="One check-in"
                title="Talk for two minutes. It becomes text."
                sub="Record your screen and camera, or just type. AI writes the bullets, pulls the action items, flags the blockers."
              />
            </Reveal>
            <div className="mt-12 grid md:grid-cols-3 gap-4 items-stretch">
              <Reveal delay={0}>
              <StepCard step="1" label="Record or type">
                <div className="mock">
                  <div className="mock__head">
                    <span className="mock__rec" /> recording · 01:42
                  </div>
                  <div className="mock__wave" aria-hidden />
                  <p className="mock__cap">
                    &ldquo;…shipped the token rebase, today I&rsquo;m reviewing
                    Sam&rsquo;s PR, and I&rsquo;m blocked on staging keys…&rdquo;
                  </p>
                </div>
              </StepCard>
              </Reveal>
              <Reveal delay={120}>
              <StepCard step="2" label="AI summarizes">
                <div className="mock">
                  <div className="mock__head">summary · auto</div>
                  <ul className="mock__bullets">
                    <li>→ Shipped the token rebase</li>
                    <li>→ Reviewing Sam&rsquo;s PR today</li>
                    <li className="mock__blocker">! Blocked on staging keys</li>
                  </ul>
                </div>
              </StepCard>
              </Reveal>
              <Reveal delay={240}>
              <StepCard step="3" label="Team skims it">
                <div className="mock">
                  <div className="mock__head">today · digest</div>
                  <div className="mock__row"><span className="mock__mono">MK</span> Shipped tokens rebase</div>
                  <div className="mock__row"><span className="mock__mono">JW</span> Queue migrated, no blockers</div>
                  <div className="mock__row mock__row--hot"><span className="mock__mono">LK</span> Blocked on staging keys</div>
                </div>
              </StepCard>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ── Digest ── */}
        <section id="digest" className="border-t border-white/[0.06]">
          <div className="mx-auto max-w-6xl px-6 py-20 md:py-24 grid lg:grid-cols-2 gap-12 items-center">
            <Reveal>
              <SectionHead
                align="left"
                kicker="The occurrence"
                title="A meeting you can read."
                sub="Every update in one page, grouped by day. Action items pulled out. Blockers surfaced to the person who can unblock them. Mention a teammate and they're notified, in the app or by email."
              />
              <ul className="mt-8 space-y-3 text-sm text-muted-foreground">
                <li className="flex gap-3"><Tick /> Carry-over: unchecked tasks pre-fill tomorrow&rsquo;s check-in</li>
                <li className="flex gap-3"><Tick /> @mentions with autocomplete, stored as structured references</li>
                <li className="flex gap-3"><Tick /> Reminders in each person&rsquo;s local morning, DST-safe</li>
                <li className="flex gap-3"><Tick /> Video plays inline; the summary sits above it</li>
              </ul>
            </Reveal>
            <Reveal delay={140}>
              <DigestMock />
            </Reveal>
          </div>
        </section>

        {/* ── Trust ── */}
        <section id="trust" className="border-t border-white/[0.06]">
          <div className="mx-auto max-w-6xl px-6 py-20 md:py-24">
            <Reveal>
              <SectionHead
                kicker="Yours, actually"
                title="Open source. Self-hostable. Encrypted."
                sub="Run our cloud or your own box. Either way the security posture is the same."
              />
            </Reveal>
            <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Reveal delay={0}>
              <TrustCard title="AGPL-3.0">
                Full source on GitHub. One <code>docker compose up</code> and it
                runs on your infrastructure.
              </TrustCard>
              </Reveal>
              <Reveal delay={100}>
              <TrustCard title="Encrypted at rest">
                AES-256-GCM on every transcript and summary. Keys never leave
                your environment.
              </TrustCard>
              </Reveal>
              <Reveal delay={200}>
              <TrustCard title="Postgres RLS">
                Row-level security FORCE-enabled on every table. One team can
                never read another&rsquo;s data.
              </TrustCard>
              </Reveal>
              <Reveal delay={300}>
              <TrustCard title="Private media">
                Video goes browser → signed URL → your bucket. It never touches
                our API servers.
              </TrustCard>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ── Final CTA ── */}
        <section className="border-t border-white/[0.06]">
          <div className="mx-auto max-w-3xl px-6 py-20 md:py-28 text-center">
            <Reveal>
            <h2 className="text-4xl md:text-5xl font-semibold tracking-tight text-balance">
              Kill the meeting.
              <br />
              <span className="serif-italic text-amber-300/90">Keep the standup.</span>
            </h2>
            <p className="mt-5 text-muted-foreground">
              Set up a team in one minute. Invite by email. First digest tomorrow
              morning.
            </p>
            <div className="mt-8">
              <Link
                href="/sign-in"
                className="h-12 px-8 rounded-lg bg-foreground text-primary-foreground text-sm font-semibold hover:bg-foreground/90 transition inline-flex items-center gap-2"
              >
                Get started free →
              </Link>
            </div>
            </Reveal>
          </div>
        </section>
      </main>

      <Footer />
      <style>{PAGE_CSS}</style>
    </div>
  );
}

// ── The pinned act: scroll scrubs one full day across the ribbon ────────────
// The demo card sticks to the viewport while its 260vh track scrolls past;
// track progress IS time. Before the reader touches the wheel the day plays
// itself slowly, so the card is alive at rest; the first real scroll inside
// the track hands ownership to the wheel for good (no snap: the autoplay
// offset freezes rather than resets). A range input scrubs the same clock
// for keyboards, touch, and reduced motion.

function RibbonAct() {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [scrollP, setScrollP] = useState(0);
  const [offset, setOffset] = useState(0.03);
  const [playing, setPlaying] = useState(true);
  const [hovered, setHovered] = useState<number | null>(null);
  const [reduced, setReduced] = useState(false);
  const rafRef = useRef(0);
  const lastRef = useRef(0);
  const playingRef = useRef(true);
  const scrollOwnedRef = useRef(false);

  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => {
      setReduced(mq.matches);
      if (mq.matches) {
        setPlaying(false);
        setOffset(0.66); // a rich, mid-evening still
      }
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  // Scroll drives time while the card is pinned.
  useEffect(() => {
    if (reduced) return;
    let raf = 0;
    const measure = () => {
      const el = trackRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const total = el.offsetHeight - window.innerHeight;
      const advanced = Math.max(0, Math.min(total, -rect.top));
      const next = total > 0 ? advanced / total : 0;
      setScrollP((prev) => {
        if (Math.abs(next - prev) > 0.002 && next > 0.01) {
          // The wheel took over: freeze the autoplay offset.
          if (!scrollOwnedRef.current) {
            scrollOwnedRef.current = true;
            setPlaying(false);
          }
        }
        return next;
      });
    };
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [reduced]);

  // Idle autoplay until the reader scrolls.
  useEffect(() => {
    if (reduced) return;
    const step = (now: number) => {
      const dt = lastRef.current ? (now - lastRef.current) / 1000 : 0;
      lastRef.current = now;
      if (playingRef.current) {
        setOffset((prev) => {
          const next = prev + dt / LOOP_SECONDS;
          return next >= 1.04 ? 0 : next;
        });
      }
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [reduced]);

  const clampedP = Math.max(0, Math.min(1, scrollP + offset));
  const done = TEAM.filter((t) => stateFor(t, clampedP) === "done");
  const utc = clampedP * 24;
  const clock = `${String(Math.floor(utc)).padStart(2, "0")}:${String(
    Math.floor((utc % 1) * 60),
  ).padStart(2, "0")}`;
  const phase = phaseFor(done.length);

  return (
    <div ref={trackRef} className="act-track">
      <div
        className="act-sticky"
        style={{
          // A soft glow tracks the sun across the top of the scene.
          background: `radial-gradient(720px 340px at ${clampedP * 100}% -8%, oklch(0.80 0.14 60 / ${0.05 + 0.08 * Math.sin(Math.PI * clampedP)}), transparent 70%)`,
        }}
      >
        <div className="mx-auto max-w-6xl px-6 w-full">
          <div className="act-scene" key={phase.key}>
            <p className="act-scene__kicker">{phase.kicker}</p>
            <h2 className="act-scene__title">
              {phase.title}{" "}
              <span className="serif-italic text-amber-300/90">{phase.accent}</span>
            </h2>
          </div>
          <RibbonCard
            clampedP={clampedP}
            clock={clock}
            done={done}
            hovered={hovered}
            setHovered={setHovered}
            reduced={reduced}
            playing={playing}
            setPlaying={setPlaying}
            onScrub={(v) => {
              setPlaying(false);
              setOffset(v - scrollP);
            }}
          />
        </div>
      </div>
    </div>
  );
}

// Scene copy driven by how many teammates are in, so the headline can never
// contradict the digest. Keyed so the block re-animates on change.
function phaseFor(done: number): {
  key: string;
  kicker: string;
  title: string;
  accent: string;
} {
  if (done === 0)
    return { key: "dawn", kicker: "before dawn", title: "The day hasn't started.", accent: "Nobody is waiting." };
  if (done <= 3)
    return { key: "east", kicker: "morning in the east", title: "Auckland, Sydney, Tokyo", accent: "check in first." };
  if (done <= 7)
    return { key: "europe", kicker: "midday", title: "Europe wakes.", accent: "The digest grows." };
  if (done <= 9)
    return { key: "west", kicker: "afternoon", title: "The Americas join.", accent: "Almost everyone is in." };
  return { key: "done", kicker: "day complete", title: "Ten check-ins.", accent: "Zero meetings." };
}

function RibbonCard({
  clampedP,
  clock,
  done,
  hovered,
  setHovered,
  reduced,
  playing,
  setPlaying,
  onScrub,
}: {
  clampedP: number;
  clock: string;
  done: Teammate[];
  hovered: number | null;
  setHovered: (i: number | null) => void;
  reduced: boolean;
  playing: boolean;
  setPlaying: (fn: boolean) => void;
  onScrub: (v: number) => void;
}) {
  const listRef = useRef<HTMLOListElement>(null);
  // Keep the newest check-in visible as the digest writes itself.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [done.length]);
  return (
    <div className="demo">
      <div className="demo__head">
        <div>
          <p className="demo__title">One team. Ten time zones. One day.</p>
          <p className="demo__sub">
            Watch the sun cross the ribbon: everyone checks in during their own
            morning, and the digest writes itself by evening.
          </p>
        </div>
        <div className="demo__clock" aria-hidden>
          <span className="demo__clocktime">{clock}</span>
          <span className="demo__clocklabel">UTC · demo day</span>
        </div>
      </div>

      <div className="demo__grid">
        <div className="demo__ribbon">
          <div className="ribbon__hourline" style={{ ["--sun-x" as string]: `${clampedP * 100}%` }}>
            {HOUR_MARKS.map((h) => (
              <span key={h} className="ribbon__tick" style={{ left: `${(h / 24) * 100}%` }}>
                {h % 6 === 0 && (
                  <span className="ribbon__ticklabel">{String(h).padStart(2, "0")}</span>
                )}
              </span>
            ))}
            <span className="ribbon__sun" aria-hidden />
          </div>
          <ol className="ribbon__team" role="list">
            {TEAM.map((t, i) => {
              const state = stateFor(t, clampedP);
              return (
                <li key={t.monogram} className="teammate">
                  <button
                    type="button"
                    className={`teammate__btn teammate__btn--${state}`}
                    onMouseEnter={() => { setHovered(i); setPlaying(false); }}
                    onMouseLeave={() => setHovered(null)}
                    onFocus={() => { setHovered(i); setPlaying(false); }}
                    onBlur={() => setHovered(null)}
                    aria-label={`${t.name}, ${t.city}. Local time ${localTime(t, clampedP)}. ${stateLabel(state)}.`}
                  >
                    <span className="teammate__ring" aria-hidden />
                    <span className="teammate__mono">{t.monogram}</span>
                  </button>
                  <span className="teammate__city" aria-hidden>{t.city.toLowerCase()}</span>
                  {hovered === i && (
                    <div className="teammate__tip" role="tooltip">
                      <div className="teammate__tipname">{t.name}</div>
                      <div className="teammate__tipmeta">
                        <span>{t.city}</span>
                        <span className="teammate__tiptz">{localTime(t, clampedP)}</span>
                      </div>
                      <div className={`teammate__tipstate teammate__tipstate--${state}`}>
                        {stateLabel(state)}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>

          <div className="demo__controls">
            {!reduced && (
              <button
                type="button"
                className="demo__play"
                onClick={() => setPlaying(!playing)}
                aria-label={playing ? "Pause the demo" : "Play the demo"}
              >
                {playing ? "❚❚" : "▶"}
              </button>
            )}
            <input
              type="range"
              min={0}
              max={1000}
              value={Math.round(clampedP * 1000)}
              onChange={(e) => onScrub(Number(e.target.value) / 1000)}
              aria-label="Scrub through the demo day"
              className="demo__scrub"
            />
            <span className="demo__hint" aria-hidden>
              scroll or drag to pass the day
            </span>
          </div>
        </div>

        <aside className="demo__digest">
          <header className="demo__digesthead">
            <span className="demo__digestkey">today · digest</span>
            <span className="demo__digestcount">
              <strong>{done.length}</strong>/{TEAM.length}
            </span>
          </header>
          {done.length === 0 ? (
            <p className="demo__digestempty">
              The day is young. Check-ins land here as each morning arrives.
            </p>
          ) : (
            <ol className="demo__digestlist" ref={listRef}>
              {done.map((t) => (
                <li key={t.monogram} className="demo__digestline">
                  <span className="demo__digestmono">{t.monogram}</span>
                  <span className="demo__digestbody">
                    <span className="demo__digestname">
                      {t.name} <em>{t.role}</em>
                    </span>
                    {t.actionItem && <span className="demo__digestaction">→ {t.actionItem}</span>}
                    {t.blocker && <span className="demo__digestblocker">! {t.blocker}</span>}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </aside>
      </div>
    </div>
  );
}

function stateLabel(s: State): string {
  if (s === "asleep") return "asleep";
  if (s === "about") return "window opens soon";
  if (s === "open") return "window open";
  if (s === "checking") return "checking in now";
  return "done for today";
}

// ── Static section pieces ───────────────────────────────────────────────────

function SectionHead({
  kicker,
  title,
  sub,
  align = "center",
}: {
  kicker: string;
  title: string;
  sub: string;
  align?: "center" | "left";
}) {
  const cls = align === "center" ? "text-center mx-auto" : "";
  return (
    <div className={`max-w-2xl ${cls}`}>
      <p className="text-[12px] uppercase tracking-[0.22em] text-emerald-400/90 mb-3">
        {kicker}
      </p>
      <h2 className="text-3xl md:text-4xl font-semibold tracking-tight text-balance">
        {title}
      </h2>
      <p className="mt-4 text-muted-foreground leading-relaxed">{sub}</p>
    </div>
  );
}

function StepCard({
  step,
  label,
  children,
}: {
  step: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-5 flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <span className="grid place-items-center size-7 rounded-full bg-emerald-400/10 border border-emerald-400/30 text-emerald-300 text-xs font-semibold">
          {step}
        </span>
        <span className="text-sm font-medium">{label}</span>
      </div>
      {children}
    </div>
  );
}

function TrustCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-5">
      <h3 className="text-sm font-semibold mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed">{children}</p>
    </div>
  );
}

function Tick() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden className="mt-0.5 shrink-0">
      <circle cx="9" cy="9" r="8" stroke="oklch(0.72 0.16 155 / 0.4)" strokeWidth="1.5" />
      <path d="M5.5 9.5l2.2 2.2L12.5 7" stroke="oklch(0.72 0.16 155)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DigestMock() {
  const rows = [
    { m: "MK", name: "Maia Kaui", role: "Design", body: "Shipped the token rebase. Reviewing Sam's PR next.", tag: null },
    { m: "JW", name: "Jia Wen", role: "Backend", body: "Ingest queue migrated. No blockers.", tag: null },
    { m: "PR", name: "Priya Rao", role: "Data", body: "Weekly rollup fix landed, rebuild running.", tag: "action" },
    { m: "LK", name: "Lena Krüger", role: "Web", body: "Feature flag rollout paused.", tag: "blocker" },
    { m: "SM", name: "Sam Miller", role: "Product", body: "Talked to 3 pilot teams. Notes in the doc.", tag: "action" },
  ];
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-5">
      <header className="flex items-baseline justify-between pb-4 mb-4 border-b border-white/[0.06]">
        <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          platform · wed 9 sep
        </span>
        <span className="font-mono text-sm text-emerald-400">
          <strong className="text-foreground">5</strong>/5 in
        </span>
      </header>
      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.m} className="flex gap-3 items-start">
            <span className="grid place-items-center size-8 rounded-full bg-white/[0.05] border border-white/[0.1] text-[10px] font-semibold shrink-0">
              {r.m}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm">
                <span className="font-medium">{r.name}</span>
                <span className="ml-2 text-[11px] text-muted-foreground uppercase tracking-wide">{r.role}</span>
              </p>
              <p className="text-sm text-muted-foreground mt-0.5">{r.body}</p>
            </div>
            {r.tag && (
              <span
                className={`self-center px-2 py-0.5 rounded-full text-[10px] tracking-wide border shrink-0 ${
                  r.tag === "blocker"
                    ? "text-red-300 border-red-400/35 bg-red-400/10"
                    : "text-emerald-300 border-emerald-400/30 bg-emerald-400/10"
                }`}
              >
                {r.tag}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── CSS: demo + serif accents ───────────────────────────────────────────────

const PAGE_CSS = `
/* Pinned act: the demo card holds while its track scrolls past */
.act-track { height: 300vh; position: relative; margin-top: -6vh; }
.act-sticky {
  position: sticky; top: 0; min-height: 100svh;
  display: flex; align-items: center;
  padding: 84px 0 24px;
}
@media (max-width: 900px) { .act-track { height: 220vh; } }

.act-scene { text-align: center; margin-bottom: 28px; }
.act-scene__kicker {
  font-family: var(--font-geist-mono, ui-monospace, monospace);
  font-size: 11px; text-transform: uppercase; letter-spacing: 0.22em;
  color: oklch(0.62 0.02 240);
  margin-bottom: 10px;
  animation: scene-in 480ms cubic-bezier(.2,.6,.25,1);
}
.act-scene__title {
  font-size: clamp(30px, 4.4vw, 52px);
  font-weight: 600; letter-spacing: -0.02em; line-height: 1.05;
  animation: scene-in 480ms cubic-bezier(.2,.6,.25,1);
}
@keyframes scene-in {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: none; }
}

/* Scroll reveal */
.reveal {
  opacity: 0;
  transform: translateY(20px);
  transition: opacity 700ms cubic-bezier(.2,.6,.25,1), transform 700ms cubic-bezier(.2,.6,.25,1);
  will-change: opacity, transform;
}
.reveal--in { opacity: 1; transform: none; }

.demo__hint {
  font-family: var(--font-geist-mono, ui-monospace, monospace);
  font-size: 9px; text-transform: uppercase; letter-spacing: 0.14em;
  color: oklch(0.55 0.02 240 / 0.8);
  white-space: nowrap;
}
@media (max-width: 720px) { .demo__hint { display: none; } }

@media (prefers-reduced-motion: reduce) {
  .act-track { height: auto; }
  .act-sticky { position: static; min-height: 0; padding: 40px 0; }
  .reveal { opacity: 1 !important; transform: none !important; transition: none !important; }
}

.landing .serif-italic {
  font-family: var(--font-serif), "Charter", "Iowan Old Style", Georgia, serif;
  font-style: italic;
  font-weight: 450;
  letter-spacing: -0.01em;
}

/* Demo card */
.demo {
  border: 1px solid oklch(1 0 0 / 0.09);
  background: linear-gradient(180deg, oklch(0.15 0.01 250 / 0.75), oklch(0.12 0.01 250 / 0.9));
  border-radius: 18px;
  padding: 22px 22px 18px;
  box-shadow: 0 24px 80px -32px oklch(0 0 0 / 0.8);
}
.demo__head {
  display: flex; align-items: flex-start; justify-content: space-between; gap: 16px;
  margin-bottom: 18px;
}
.demo__title { font-size: 15px; font-weight: 600; letter-spacing: -0.01em; }
.demo__sub { font-size: 12.5px; color: oklch(0.66 0.02 240); margin-top: 3px; max-width: 52ch; }
.demo__clock { text-align: right; flex-shrink: 0; }
.demo__clocktime {
  display: block;
  font-family: var(--font-geist-mono, ui-monospace, monospace);
  font-size: 22px; font-weight: 500; letter-spacing: 0.02em;
  font-variant-numeric: tabular-nums;
}
.demo__clocklabel {
  font-family: var(--font-geist-mono, ui-monospace, monospace);
  font-size: 9px; text-transform: uppercase; letter-spacing: 0.16em;
  color: oklch(0.60 0.02 240);
}

.demo__grid { display: grid; grid-template-columns: 1fr 300px; gap: 18px; }
@media (max-width: 900px) { .demo__grid { grid-template-columns: 1fr; } }

.demo__ribbon {
  border: 1px solid oklch(1 0 0 / 0.06);
  background: oklch(0.10 0.01 250 / 0.7);
  border-radius: 12px;
  padding: 16px 16px 12px;
  min-width: 0;
}

.ribbon__hourline { position: relative; height: 20px; margin-bottom: 14px; }
.ribbon__tick {
  position: absolute; top: 9px; width: 1px; height: 4px;
  background: oklch(1 0 0 / 0.12); transform: translateX(-0.5px);
}
.ribbon__tick:has(.ribbon__ticklabel) { height: 6px; background: oklch(1 0 0 / 0.22); }
.ribbon__ticklabel {
  position: absolute; top: -13px; left: 50%; transform: translateX(-50%);
  font-family: var(--font-geist-mono, ui-monospace, monospace);
  font-size: 9px; color: oklch(0.60 0.02 240 / 0.7); letter-spacing: 0.05em;
}
.ribbon__sun {
  position: absolute; top: 7px; left: var(--sun-x, 0);
  width: 10px; height: 10px; border-radius: 999px;
  background: radial-gradient(circle, oklch(0.92 0.14 65) 0%, oklch(0.75 0.18 40) 60%, transparent 100%);
  box-shadow: 0 0 12px oklch(0.85 0.18 55 / 0.7), 0 0 32px oklch(0.85 0.18 55 / 0.35);
  transform: translate(-50%, 0);
}

.ribbon__team {
  list-style: none; padding: 0; margin: 0;
  display: grid; grid-template-columns: repeat(10, 1fr); gap: 4px;
}
.teammate { position: relative; display: flex; flex-direction: column; align-items: center; gap: 5px; }
.teammate__btn {
  appearance: none; background: transparent; border: 0; padding: 0; cursor: pointer;
  position: relative; width: 48px; height: 48px; border-radius: 999px;
  display: grid; place-items: center;
  transition: transform 200ms cubic-bezier(.2,.6,.3,1);
}
.teammate__btn:focus-visible { outline: 2px solid oklch(0.72 0.16 155); outline-offset: 3px; }
.teammate__btn:hover { transform: translateY(-2px); }
.teammate__ring {
  position: absolute; inset: 0; border-radius: 999px;
  border: 1.5px solid oklch(1 0 0 / 0.12);
  transition: border-color 240ms, box-shadow 240ms, background 240ms;
}
.teammate__mono {
  position: relative; font-size: 11.5px; font-weight: 600; letter-spacing: 0.03em;
  color: oklch(0.55 0.02 240 / 0.7); transition: color 240ms;
}
.teammate__btn--about .teammate__ring { border-color: oklch(0.75 0.14 60 / 0.55); }
.teammate__btn--about .teammate__mono { color: oklch(0.85 0.05 60); }
.teammate__btn--open .teammate__ring {
  border-color: oklch(0.72 0.16 155);
  box-shadow: 0 0 14px oklch(0.72 0.16 155 / 0.35), inset 0 0 8px oklch(0.72 0.16 155 / 0.15);
}
.teammate__btn--open .teammate__mono { color: oklch(0.95 0.01 240); }
.teammate__btn--checking .teammate__ring {
  border-color: oklch(0.72 0.16 155);
  box-shadow: 0 0 20px oklch(0.72 0.16 155 / 0.6);
  animation: demo-pulse 1.4s ease-in-out infinite;
}
.teammate__btn--checking .teammate__mono { color: oklch(0.98 0.01 240); }
.teammate__btn--done .teammate__ring {
  border-color: oklch(0.55 0.10 155 / 0.55);
  background: oklch(0.72 0.16 155 / 0.07);
}
.teammate__btn--done .teammate__mono { color: oklch(0.80 0.06 155); }
.teammate__btn--done::after {
  content: "";
  position: absolute; right: 0; top: 0;
  width: 12px; height: 12px; border-radius: 999px;
  background: oklch(0.72 0.16 155);
  box-shadow: 0 0 0 2px oklch(0.11 0.01 250);
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'><path d='M3 6.5l2 2 4-4.5' stroke='%230f1712' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round' fill='none'/></svg>");
  background-repeat: no-repeat; background-position: center;
}
@keyframes demo-pulse {
  0%, 100% { box-shadow: 0 0 20px oklch(0.72 0.16 155 / 0.6); }
  50% { box-shadow: 0 0 28px oklch(0.72 0.16 155 / 0.85); }
}
.teammate__city {
  font-family: var(--font-geist-mono, ui-monospace, monospace);
  font-size: 8.5px; letter-spacing: 0.05em;
  color: oklch(0.55 0.02 240 / 0.7); white-space: nowrap;
}

.teammate__tip {
  position: absolute; bottom: calc(100% + 10px); left: 50%; transform: translateX(-50%);
  min-width: 176px; padding: 10px 12px;
  background: oklch(0.07 0.005 250 / 0.97);
  border: 1px solid oklch(1 0 0 / 0.10); border-radius: 10px;
  z-index: 30; animation: tip-in 150ms cubic-bezier(.2,.6,.3,1);
}
.teammate__tip::after {
  content: ""; position: absolute; top: 100%; left: 50%; transform: translateX(-50%);
  border: 5px solid transparent; border-top-color: oklch(0.07 0.005 250 / 0.97);
}
.teammate__tipname { font-size: 13px; font-weight: 500; }
.teammate__tipmeta {
  display: flex; justify-content: space-between;
  font-family: var(--font-geist-mono, ui-monospace, monospace);
  font-size: 10px; color: oklch(0.62 0.02 240); margin-top: 4px;
}
.teammate__tiptz { color: oklch(0.80 0.04 60); }
.teammate__tipstate {
  margin-top: 6px; padding-top: 6px; border-top: 1px solid oklch(1 0 0 / 0.06);
  font-size: 9.5px; letter-spacing: 0.08em; text-transform: uppercase;
  color: oklch(0.60 0.02 240);
}
.teammate__tipstate--open, .teammate__tipstate--checking, .teammate__tipstate--done { color: oklch(0.75 0.14 155); }
.teammate__tipstate--about { color: oklch(0.78 0.12 60); }
@keyframes tip-in { from { opacity: 0; transform: translate(-50%, 4px); } to { opacity: 1; transform: translate(-50%, 0); } }

.demo__controls {
  display: flex; align-items: center; gap: 10px;
  margin-top: 14px; padding-top: 12px;
  border-top: 1px solid oklch(1 0 0 / 0.05);
}
.demo__play {
  appearance: none; border: 1px solid oklch(1 0 0 / 0.14); background: oklch(1 0 0 / 0.03);
  color: oklch(0.90 0.01 240); border-radius: 8px;
  width: 30px; height: 30px; font-size: 9px; cursor: pointer;
  display: grid; place-items: center;
  transition: background 160ms;
}
.demo__play:hover { background: oklch(1 0 0 / 0.08); }
.demo__scrub {
  flex: 1; appearance: none; height: 4px; border-radius: 999px;
  background: oklch(1 0 0 / 0.10); outline-offset: 4px; cursor: pointer;
}
.demo__scrub::-webkit-slider-thumb {
  appearance: none; width: 14px; height: 14px; border-radius: 999px;
  background: oklch(0.85 0.14 60);
  box-shadow: 0 0 10px oklch(0.85 0.18 55 / 0.6);
}
.demo__scrub::-moz-range-thumb {
  width: 14px; height: 14px; border: 0; border-radius: 999px;
  background: oklch(0.85 0.14 60);
}

.demo__digest {
  border: 1px solid oklch(1 0 0 / 0.06);
  background: oklch(0.10 0.01 250 / 0.7);
  border-radius: 12px; padding: 14px 16px;
  display: flex; flex-direction: column;
}
/* Two-column layout: let the ribbon column set the row height, and scroll
   the digest list inside it instead of stretching the row (which left a
   void under the scrubber). */
@media (min-width: 901px) {
  .demo__digest { height: 0; min-height: 100%; }
}
.demo__digesthead {
  display: flex; justify-content: space-between; align-items: baseline;
  padding-bottom: 10px; margin-bottom: 10px;
  border-bottom: 1px solid oklch(1 0 0 / 0.06);
}
.demo__digestkey {
  font-family: var(--font-geist-mono, ui-monospace, monospace);
  font-size: 10px; text-transform: uppercase; letter-spacing: 0.16em;
  color: oklch(0.60 0.02 240);
}
.demo__digestcount {
  font-family: var(--font-geist-mono, ui-monospace, monospace);
  font-size: 13px; color: oklch(0.72 0.16 155);
}
.demo__digestcount strong { color: oklch(0.95 0.01 240); font-weight: 600; }
.demo__digestempty { font-size: 12px; color: oklch(0.60 0.02 240); line-height: 1.6; }
.demo__digestlist {
  list-style: none; padding: 0; margin: 0;
  display: flex; flex-direction: column; gap: 8px;
  flex: 1; min-height: 0; overflow-y: auto; max-height: 240px;
  mask-image: linear-gradient(to bottom, transparent, black 18px);
}
@media (min-width: 901px) { .demo__digestlist { max-height: none; } }
.demo__digestline { display: flex; gap: 9px; align-items: flex-start; animation: digest-in 300ms cubic-bezier(.2,.6,.3,1); }
@keyframes digest-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
.demo__digestmono {
  flex-shrink: 0; width: 22px; height: 22px; border-radius: 999px;
  display: grid; place-items: center;
  background: oklch(1 0 0 / 0.04); border: 1px solid oklch(0.72 0.16 155 / 0.35);
  font-size: 8.5px; font-weight: 600; color: oklch(0.78 0.06 155);
}
.demo__digestbody { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.demo__digestname { font-size: 12px; color: oklch(0.94 0.006 240); }
.demo__digestname em {
  font-style: normal; color: oklch(0.60 0.02 240); font-size: 10px; margin-left: 4px;
}
.demo__digestaction { font-size: 11px; color: oklch(0.72 0.05 240); }
.demo__digestblocker { font-size: 11px; color: oklch(0.78 0.16 30); }

/* Transform mocks */
.mock {
  border: 1px solid oklch(1 0 0 / 0.06);
  background: oklch(0.10 0.01 250 / 0.6);
  border-radius: 10px; padding: 14px; flex: 1;
  display: flex; flex-direction: column; gap: 10px;
}
.mock__head {
  display: flex; align-items: center; gap: 7px;
  font-family: var(--font-geist-mono, ui-monospace, monospace);
  font-size: 10px; text-transform: uppercase; letter-spacing: 0.14em;
  color: oklch(0.60 0.02 240);
}
.mock__rec { width: 7px; height: 7px; border-radius: 999px; background: oklch(0.65 0.2 25); animation: demo-pulse 1.2s ease-in-out infinite; }
.mock__wave {
  height: 44px;
  background: repeating-linear-gradient(90deg, oklch(0.72 0.16 155 / 0.4) 0 2px, transparent 2px 6px);
  mask-image: linear-gradient(90deg, transparent, black 15%, black 85%, transparent);
  border-radius: 4px;
}
.mock__cap { font-size: 12px; color: oklch(0.70 0.02 240); line-height: 1.55; font-style: italic; }
.mock__bullets { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 7px; }
.mock__bullets li { font-size: 13px; color: oklch(0.90 0.01 240); }
.mock__bullets .mock__blocker { color: oklch(0.78 0.16 30); }
.mock__row {
  display: flex; align-items: center; gap: 8px;
  font-size: 12.5px; color: oklch(0.85 0.01 240);
}
.mock__row--hot { color: oklch(0.80 0.14 30); }
.mock__mono {
  width: 20px; height: 20px; border-radius: 999px; flex-shrink: 0;
  display: grid; place-items: center;
  background: oklch(1 0 0 / 0.05); border: 1px solid oklch(1 0 0 / 0.10);
  font-size: 8px; font-weight: 600; color: oklch(0.85 0.01 240);
}

@media (max-width: 720px) {
  .demo { padding: 16px 14px 14px; }
  .demo__head { flex-direction: column; }
  .demo__clock { text-align: left; }
  /* Ten dots must fit the card: size from the grid column, not a fixed px. */
  .teammate__btn { width: 100%; max-width: 32px; height: auto; aspect-ratio: 1; }
  .teammate__mono { font-size: 9.5px; }
  .teammate__btn--done::after { width: 9px; height: 9px; }
  .teammate__city { display: none; }
  .demo__hint { display: none; }
}

@media (prefers-reduced-motion: reduce) {
  .landing * { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
}
`;
